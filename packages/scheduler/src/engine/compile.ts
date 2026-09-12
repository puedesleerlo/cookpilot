import {
  COLD_STORAGE_EQUIPMENT,
  contentHash,
  makeId,
  type Constraints,
  type DegradationEvent,
  type Dish,
  type EquipmentKind,
  type Lane,
  type MealPlan,
  type Rationale,
  type Schedule,
  type ScheduleMetrics,
  type ScheduleWarning,
  type Task,
} from '@kitchen/domain';
import { compileTaskGraph, type TaskGraph } from '../graph/compile';
import { scheduleTasks, type ScheduleAttempt } from './schedule';
import { serialMinutes } from './cpm';

/**
 * The top of the engine: plan in, schedule out.
 *
 * The shape is: compile the graph, schedule it, and if it does not fit the budget, climb
 * the degradation ladder one rung at a time — rescheduling after each — stopping the moment
 * it does fit. Each rung says what it gave up and what that bought.
 *
 * The ladder's order is a claim about what people actually mind losing. Garnishes first,
 * because nobody planned their week around a garnish. Beverages next, because they are
 * almost pure passive time and the cheapest thing to lose per minute recovered. Food last,
 * and the dish that goes is the one using the fewest ingredients that had to be used today.
 */

export type CompileOptions = {
  plan: MealPlan;
  constraints: Constraints;
  /** Minute the schedule starts from. Non-zero only when recompiling mid-session. */
  originMin?: number;
};

export type CompileFailure = { ok: false; reason: string };
export type CompileSuccess = { ok: true; schedule: Schedule };
export type EngineResult = CompileSuccess | CompileFailure;

const RUNGS = [
  'drop-optional-steps',
  'drop-beverages',
  'substitute-shorter-dish',
  'reduce-servings',
  'drop-dish',
] as const;

// ------------------------------------------------------------------- lanes

/**
 * A lane is one physical thing: burner #2, cutting board #1.
 *
 * Which lane a task belongs on is decided by the resource slot it was actually given, never
 * by the task's own requirement list. Reading it off the requirements put a task holding
 * burner #2 and a saucepan onto the burner **#1** row as well — the saucepan's instance
 * number applied to the burner's lane id — and the chart then drew two things happening at
 * once on a burner that only ever had one.
 */
const LANE_LABEL: Partial<Record<EquipmentKind, string>> = {
  burner: 'Burner',
  'oven-rack': 'Oven',
  'fridge-shelf': 'Fridge',
  'freezer-shelf': 'Freezer',
};

const laneGroupOf = (kind: EquipmentKind): Lane['group'] => {
  if (kind === 'burner' || kind === 'oven-rack') return 'heat';
  if (kind === 'fridge-shelf' || kind === 'freezer-shelf') return 'cold';
  return 'tools';
};

const laneOf = (kind: EquipmentKind, instance: number): Lane => {
  const spelled = kind.replace('-', ' ');
  const name = LANE_LABEL[kind] ?? spelled[0]!.toUpperCase() + spelled.slice(1);
  // A shelf that holds four containers is four slots, so its rows are slots, not shelves.
  const label = COLD_STORAGE_EQUIPMENT.has(kind)
    ? `${name} slot ${instance + 1}`
    : `${name}${instance > 0 ? ` ${instance + 1}` : ''}`;
  return { id: `lane:${kind}:${instance}`, group: laneGroupOf(kind), label, taskIds: [] };
};

const buildLanes = (attempt: ScheduleAttempt, constraints: Constraints): Lane[] => {
  const byId = new Map(attempt.tasks.map((t) => [t.id, t]));
  const kindOf = new Map(constraints.equipment.map((e) => [e.id, e.kind]));
  const lanes = new Map<string, Lane>();

  // People first: one lane per cook, in the order they were configured.
  for (const cook of constraints.cooks) {
    lanes.set(`lane:cook:${cook.id}`, {
      id: `lane:cook:${cook.id}`,
      group: 'people',
      label: cook.name,
      taskIds: [],
    });
  }

  for (const s of attempt.scheduled) {
    const task = byId.get(s.taskId);
    if (!task) continue;

    if (s.cookId) {
      lanes.get(`lane:cook:${s.cookId}`)?.taskIds.push(s.taskId);
    }

    // A task also occupies every instance it was given, so each of those rows shows it.
    for (const slot of s.resources) {
      const kind = kindOf.get(slot.equipmentId);
      if (!kind) continue;
      const lane = laneOf(kind, slot.instance);
      if (!lanes.has(lane.id)) lanes.set(lane.id, lane);
      const row = lanes.get(lane.id)!;
      if (!row.taskIds.includes(s.taskId)) row.taskIds.push(s.taskId);
    }
  }

  const order: Lane['group'][] = ['people', 'heat', 'tools', 'cold'];
  return [...lanes.values()]
    .filter((l) => l.taskIds.length > 0 || l.group === 'people')
    .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || (a.id < b.id ? -1 : 1));
};

// ----------------------------------------------------------------- metrics

const buildMetrics = (
  attempt: ScheduleAttempt,
  plan: MealPlan,
  constraints: Constraints,
  overnight: Set<string>,
): ScheduleMetrics => {
  const byId = new Map(attempt.tasks.map((t) => [t.id, t]));
  const inSession = attempt.scheduled.filter((s) => !overnight.has(s.taskId));

  const activeByCook: Record<string, number> = {};
  const idleByCook: Record<string, number> = {};
  for (const cook of constraints.cooks) activeByCook[cook.id] = 0;

  let passive = 0;
  for (const s of inSession) {
    const task = byId.get(s.taskId);
    if (!task) continue;
    if (task.phase === 'hold') passive += task.durationMin;
    if (s.cookId) activeByCook[s.cookId] = (activeByCook[s.cookId] ?? 0) + task.durationMin;
  }

  const makespan = attempt.inSessionMakespanMin;
  for (const cook of constraints.cooks) {
    idleByCook[cook.id] = Math.max(0, makespan - (activeByCook[cook.id] ?? 0));
  }

  const loads = constraints.cooks.map((c) => activeByCook[c.id] ?? 0);
  const serial = serialMinutes(attempt.tasks.filter((t) => !overnight.has(t.id)));

  /**
   * Urgency comes off the plan's coverage, not off the dishes.
   *
   * Counting every ingredient in every dish answered a different question — "how many
   * things does this session touch" — and reported it as "17 of 17 things that had to go
   * today" beside a tagline correctly saying three of four. The plan is the only thing here
   * that ever saw the pantry, so it is the only thing that can say which were urgent.
   */
  const urgentUsed = plan.coverage.usedUrgentIngredientIds.length;
  const urgentTotal = urgentUsed + plan.coverage.unusedUrgentIngredientIds.length;

  // Peak cold usage: the most chilling tasks overlapping at any one minute.
  const chilling = inSession.filter((s) => byId.get(s.taskId)?.class === 'chill');
  let peakCold = 0;
  for (let t = 0; t <= makespan; t++) {
    const n = chilling.filter((s) => t >= s.startMin && t < s.endMin).length;
    if (n > peakCold) peakCold = n;
  }

  return {
    serialMin: serial,
    makespanMin: makespan,
    minutesSavedByParallelism: Math.max(0, serial - makespan),
    passiveMin: passive,
    activeMinByCook: activeByCook,
    idleMinByCook: idleByCook,
    cookImbalanceMin: loads.length > 1 ? Math.max(...loads) - Math.min(...loads) : 0,
    washCount: attempt.washes.length,
    equipmentChanges: new Set(inSession.flatMap((s) => s.resources.map((r) => r.equipmentId))).size,
    portions: plan.dishes.reduce((n, d) => n + d.servings, 0),
    dishCount: plan.dishes.length,
    beverageCount: plan.dishes.filter((d) => d.kind === 'beverage').length,
    urgentIngredientsUsed: urgentUsed,
    urgentIngredientsTotal: urgentTotal,
    peakColdUsage: peakCold,
  };
};

// --------------------------------------------------------------- rationale

const buildRationale = (
  attempt: ScheduleAttempt,
  graph: TaskGraph,
  metrics: ScheduleMetrics,
): Rationale[] => {
  const byId = new Map(attempt.tasks.map((t) => [t.id, t]));
  const out: Rationale[] = [...attempt.rationale];

  // The biggest passive window, and what got done inside it.
  const holds = attempt.scheduled
    .filter((s) => byId.get(s.taskId)?.phase === 'hold' && !graph.overnight.includes(s.taskId))
    .sort((a, b) => b.endMin - b.startMin - (a.endMin - a.startMin));
  const biggest = holds[0];
  if (biggest) {
    const task = byId.get(biggest.taskId)!;
    const inside = attempt.scheduled.filter(
      (s) => s.cookId && s.startMin >= biggest.startMin && s.endMin <= biggest.endMin,
    );
    out.push({
      type: 'passive-first',
      taskIds: [biggest.taskId, ...inside.map((s) => s.taskId).slice(0, 4)],
      explanation:
        `${task.name} runs for ${biggest.endMin - biggest.startMin} minutes without anyone watching it, ` +
        `so ${inside.length} other task${inside.length === 1 ? '' : 's'} fit inside that window.`,
      minutes: biggest.endMin - biggest.startMin,
    });
  }

  const critical = attempt.scheduled.filter((s) => s.isCritical && !graph.overnight.includes(s.taskId));
  if (critical.length > 0) {
    out.push({
      type: 'critical-path',
      taskIds: critical.map((s) => s.taskId),
      explanation:
        `${critical.length} task${critical.length === 1 ? '' : 's'} sit on the critical path. ` +
        `Every minute one of them slips is a minute later you finish.`,
      minutes: metrics.makespanMin,
    });
  }

  if (metrics.minutesSavedByParallelism > 0) {
    out.push({
      type: 'idle-fill',
      taskIds: [],
      explanation:
        `Doing this one thing at a time would take ${metrics.serialMin} minutes. ` +
        `Overlapping the parts that do not need you brings it to ${metrics.makespanMin}.`,
      minutes: metrics.minutesSavedByParallelism,
    });
  }

  if (metrics.peakColdUsage > 1) {
    out.push({
      type: 'cold-capacity',
      taskIds: [],
      explanation: `${metrics.peakColdUsage} things need cold space at once, so chilling is staggered.`,
      minutes: metrics.peakColdUsage,
    });
  }

  const routed = attempt.scheduled.filter((s) => {
    const task = byId.get(s.taskId);
    return task && task.minSkill !== 'beginner' && s.cookId;
  });
  if (routed.length > 0) {
    out.push({
      type: 'skill-routing',
      taskIds: routed.map((s) => s.taskId).slice(0, 6),
      explanation: `${routed.length} task${routed.length === 1 ? '' : 's'} went to whoever is set up to do them.`,
    });
  }

  return out;
};

// ---------------------------------------------------------- the ladder

type RungOutcome = {
  plan: MealPlan;
  removedDishIds: string[];
  note: string;
  /** True when this rung still has more to give and should be tried again before moving on. */
  canRepeat: boolean;
};

/**
 * Apply one rung, or return null if it has nothing to give.
 *
 * Rungs cut the smallest thing that helps, not the whole category. Going three minutes over
 * budget should cost you one drink, not both of them — a ladder that jumps from "nothing
 * optional to remove" straight to "no beverages at all" is not degrading gracefully, it is
 * overreacting.
 */
const applyRung = (
  rung: (typeof RUNGS)[number],
  plan: MealPlan,
): RungOutcome | null => {
  switch (rung) {
    case 'drop-optional-steps': {
      let dropped = 0;
      const dishes = plan.dishes.map((d) => {
        const steps = d.steps.filter((s) => !s.optional);
        dropped += d.steps.length - steps.length;
        return { ...d, steps };
      });
      return dropped > 0
        ? {
            plan: { ...plan, dishes },
            removedDishIds: [],
            note: `Dropped ${dropped} garnish or flourish.`,
            canRepeat: false,
          }
        : null;
    }
    case 'drop-beverages': {
      const drinks = plan.dishes.filter((d) => d.kind === 'beverage');
      if (drinks.length === 0) return null;
      // The one that costs the most hands-on time goes first: it buys the most minutes.
      const handsOn = (d: Dish) => d.steps.reduce((n, s) => n + s.activeMin + s.finishMin, 0);
      const worst = [...drinks].sort((a, b) => handsOn(b) - handsOn(a) || (a.id < b.id ? -1 : 1))[0]!;
      return {
        plan: { ...plan, dishes: plan.dishes.filter((d) => d.id !== worst.id) },
        removedDishIds: [worst.id],
        note:
          `Dropped the ${worst.name.toLowerCase()} — batch drinks are mostly waiting, ` +
          `so they cost the least to lose.`,
        canRepeat: drinks.length > 1,
      };
    }
    case 'substitute-shorter-dish': {
      // A real substitution needs a candidate pool, which arrives with plan generation.
      // Until then this rung is honest about having nothing to offer.
      return null;
    }
    case 'reduce-servings': {
      const target = [...plan.dishes].sort((a, b) => a.servings - b.servings).at(-1);
      if (!target || target.servings <= 2) return null;
      const servings = Math.max(2, Math.floor(target.servings / 2));
      return {
        plan: {
          ...plan,
          dishes: plan.dishes.map((d) => (d.id === target.id ? { ...d, servings } : d)),
        },
        removedDishIds: [],
        note: `Halved the ${target.name.toLowerCase()} to ${servings} portions.`,
        canRepeat: false,
      };
    }
    case 'drop-dish': {
      if (plan.dishes.length <= 1) return null;
      // The dish that goes is the one using fewest ingredients that had to go today.
      const worst = [...plan.dishes].sort(
        (a, b) => a.ingredients.length - b.ingredients.length || (a.id < b.id ? -1 : 1),
      )[0]!;
      return {
        plan: { ...plan, dishes: plan.dishes.filter((d) => d.id !== worst.id) },
        removedDishIds: [worst.id],
        note: `Dropped the ${worst.name.toLowerCase()} entirely — it was the least this pantry needed.`,
        canRepeat: plan.dishes.length > 2,
      };
    }
  }
};

// ------------------------------------------------------------------ entry

export const compileSchedule = (options: CompileOptions): EngineResult => {
  const { constraints, originMin = 0 } = options;

  let plan = options.plan;
  const degradations: DegradationEvent[] = [];
  let best: { attempt: ScheduleAttempt; graph: TaskGraph } | null = null;
  let rungIndex = 0;
  let order = 1;

  for (;;) {
    const compiled = compileTaskGraph(plan, constraints);
    if (!compiled.ok) return { ok: false, reason: compiled.reason };

    const graph = compiled.graph;
    const attempt = scheduleTasks({
      constraints,
      tasks: graph.tasks,
      overnight: new Set(graph.overnight),
      originMin,
    });

    // Credit the previous rung with what it actually saved, now that the reschedule is in.
    const previousMakespan = best?.attempt.inSessionMakespanMin;
    const lastDegradation = degradations[degradations.length - 1];
    if (lastDegradation && previousMakespan !== undefined) {
      lastDegradation.minutesSaved = Math.max(0, previousMakespan - attempt.inSessionMakespanMin);
    }
    best = { attempt, graph };

    if (attempt.inSessionMakespanMin <= constraints.timeBudgetMin) break;
    if (rungIndex >= RUNGS.length) break;

    // Climb one rung and try again.
    let applied: ReturnType<typeof applyRung> = null;
    while (rungIndex < RUNGS.length && !applied) {
      applied = applyRung(RUNGS[rungIndex]!, plan);
      if (!applied) rungIndex++;
    }
    if (!applied) break;

    degradations.push({
      rung: RUNGS[rungIndex]!,
      order: order++,
      removedTaskIds: [],
      removedDishIds: applied.removedDishIds,
      reason: applied.note,
      // Filled in on the next pass, once the reschedule shows what it bought.
      minutesSaved: 0,
    });
    plan = applied.plan;
    // A rung with more to give is tried again before the ladder moves on to a harsher one.
    if (!applied.canRepeat) rungIndex++;
  }

  const { attempt, graph } = best!;
  const overnight = new Set(graph.overnight);
  const metrics = buildMetrics(attempt, plan, constraints, overnight);
  const feasible = attempt.inSessionMakespanMin <= constraints.timeBudgetMin;

  const warnings: ScheduleWarning[] = [...attempt.warnings];
  if (!feasible) {
    warnings.push({
      severity: 'error',
      code: 'does-not-fit',
      message:
        `Even after everything that could be given up, this needs ${attempt.inSessionMakespanMin} minutes ` +
        `and you have ${constraints.timeBudgetMin}. Add ${attempt.inSessionMakespanMin - constraints.timeBudgetMin} minutes, or take something out.`,
      taskIds: [],
    });
  }

  const taskIndex: Record<string, Task> = {};
  for (const t of attempt.tasks) taskIndex[t.id] = t;

  const schedule: Schedule = {
    id: makeId('sched', plan.id, String(attempt.inSessionMakespanMin)),
    planId: plan.id,
    inputHash: contentHash({ plan, constraints, originMin }),
    feasible,
    makespanMin: attempt.inSessionMakespanMin,
    timeBudgetMin: constraints.timeBudgetMin,
    originMin,
    scheduled: attempt.scheduled,
    tasks: taskIndex,
    dishNames: graph.dishNames,
    lanes: buildLanes(attempt, constraints),
    criticalPath: attempt.scheduled.filter((s) => s.isCritical).map((s) => s.taskId),
    rationale: [
      ...buildRationale(attempt, graph, metrics),
      ...degradations.map(
        (d): Rationale => ({
          type: 'degradation',
          taskIds: [],
          explanation: d.reason,
          minutes: d.minutesSaved,
        }),
      ),
    ],
    degradations,
    metrics,
    warnings,
    constraints,
    overnight: graph.overnight,
  };

  return { ok: true, schedule };
};
