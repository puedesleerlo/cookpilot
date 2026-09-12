import {
  COLD_STORAGE_EQUIPMENT,
  makeId,
  meetsSkill,
  type ContaminationState,
  type Constraints,
  type Cook,
  type Equipment,
  type EquipmentKind,
  type Rationale,
  type ScheduleWarning,
  type ScheduledTask,
  type Task,
} from '@kitchen/domain';
import { computeCpm, type CpmResult } from './cpm';
import { describeWash, leavesOf, needOf, needsWash, washMinutes } from './contamination';

/**
 * Resource-constrained scheduling.
 *
 * A serial generation scheme: repeatedly take the highest-priority task whose predecessors
 * are done, and start it at the first minute every resource it needs is free.
 *
 * Priority is minimum slack first — a task with no slack costs the session a minute for
 * every minute it waits — then longest remaining path, then task id. That last tie-break is
 * not cosmetic: without it, two runs could order two identical-looking tasks differently and
 * the "same input, same output" guarantee would quietly fail.
 */

export type ResourceSlotKey = string;

export type ScheduleAttempt = {
  scheduled: ScheduledTask[];
  tasks: Task[];
  makespanMin: number;
  /** Finish time counting only work inside the session. */
  inSessionMakespanMin: number;
  washes: Task[];
  rationale: Rationale[];
  warnings: ScheduleWarning[];
  cpm: CpmResult;
};

type Instance = {
  key: ResourceSlotKey;
  equipmentId: string;
  kind: EquipmentKind;
  instance: number;
  /** Sorted, non-overlapping busy intervals. */
  busy: { from: number; to: number }[];
  state: ContaminationState;
  /** When `state` was set, so we know which use came last. */
  stateAt: number;
};

const buildInstances = (equipment: Equipment[]): Instance[] => {
  const out: Instance[] = [];
  for (const e of [...equipment].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    // Cold storage counts shelves times capacity: a shelf that holds four containers is
    // four slots, because that is what actually competes.
    const slots = COLD_STORAGE_EQUIPMENT.has(e.kind) ? e.count * (e.capacity ?? 1) : e.count;
    for (let i = 0; i < slots; i++) {
      out.push({
        key: `${e.id}#${i}`,
        equipmentId: e.id,
        kind: e.kind,
        instance: i,
        busy: [],
        state: e.contaminationState,
        stateAt: -1,
      });
    }
  }
  return out;
};

const free = (busy: { from: number; to: number }[], from: number, to: number): boolean =>
  busy.every((b) => to <= b.from || from >= b.to);

const occupy = (inst: Instance, from: number, to: number): void => {
  inst.busy.push({ from, to });
  inst.busy.sort((a, b) => a.from - b.from);
};

const availableFor = (cook: Cook, from: number, to: number): boolean =>
  cook.available.some((w) => from >= w.startMin && to <= w.endMin);

/**
 * Work on the far side of an overnight tail is not part of this session's clock.
 *
 * Straining the cold brew happens tomorrow morning. Checking it against today's
 * availability windows meant nobody could ever be assigned it, and the task failed
 * placement -- which then cascaded into the degradation ladder cutting a drink to solve a
 * problem that was really "this cook has gone to bed".
 */
const availableForTask = (cook: Cook, from: number, to: number, isOvernight: boolean): boolean =>
  isOvernight || availableFor(cook, from, to);

// ---------------------------------------------------------------- washing

type PendingWash = { task: Task; instanceKey: ResourceSlotKey };

const makeWashTask = (
  forTask: Task,
  inst: Instance,
  order: number,
): Task => ({
  id: makeId('task', 'wash', inst.key, String(order)),
  dishId: forTask.dishId,
  name: describeWash(inst.kind, inst.state),
  class: 'wash-up',
  phase: 'start',
  durationMin: washMinutes(inst.kind, inst.state),
  requiresCook: true,
  equipment: [{ kind: inst.kind, count: 1, heldThroughHold: false }],
  ingredients: [],
  deps: [],
  safety: [],
  effort: 2,
  minSkill: 'beginner',
  optional: false,
  synthetic: true,
});

// ---------------------------------------------------------------- the SGS

/**
 * Priority rules for the generation scheme.
 *
 * One greedy rule is fragile: shaving a minute off an unrelated task changes the slack
 * ordering and can produce a materially worse schedule. Shortening the label task from two
 * minutes to one made the demo session *ten minutes longer* under min-slack alone, which is
 * not a bug in the rule so much as the nature of greedy scheduling.
 *
 * Running every rule and keeping the best costs a handful of passes over a few dozen tasks
 * and removes that fragility entirely. It stays deterministic: the rules are fixed, the
 * order is fixed, and ties are broken on makespan then rule index.
 */
export const PRIORITY_RULES = [
  'min-slack',
  'longest-path',
  'most-successors',
  'shortest-first',
  'earliest-due',
] as const;

export type PriorityRule = (typeof PRIORITY_RULES)[number];

export type ScheduleOptions = {
  constraints: Constraints;
  tasks: Task[];
  /** Which rule to order by. Omit to try them all and keep the best. */
  rule?: PriorityRule;
  /** Task ids whose time runs past the session and must not count toward the finish. */
  overnight: Set<string>;
  /** Minute the schedule starts from. Non-zero only on recompilation. */
  originMin?: number;
  /** Tasks already done or running, frozen in place. */
  frozen?: ScheduledTask[];
};

/**
 * Run every priority rule and keep the schedule that finishes soonest; on a tie, the fewest
 * washes, then the fairest split, then the earliest rule in the list.
 */
export const scheduleTasks = (options: ScheduleOptions): ScheduleAttempt => {
  if (options.rule) return scheduleWithRule(options, options.rule);

  let best: ScheduleAttempt | null = null;
  let bestScore: [number, number, number, number] | null = null;

  PRIORITY_RULES.forEach((rule, index) => {
    const attempt = scheduleWithRule(options, rule);
    const errors = attempt.warnings.filter((w) => w.severity === 'error').length;
    const loads = [...new Set(attempt.scheduled.map((s) => s.cookId).filter(Boolean))].map((id) =>
      attempt.scheduled
        .filter((s) => s.cookId === id)
        .reduce((n, s) => n + (s.endMin - s.startMin), 0),
    );
    const imbalance = loads.length > 1 ? Math.max(...loads) - Math.min(...loads) : 0;
    const score: [number, number, number, number] = [
      errors,
      attempt.inSessionMakespanMin,
      attempt.washes.length,
      imbalance,
    ];
    if (!bestScore || compareScores(score, bestScore) < 0) {
      best = attempt;
      bestScore = score;
    }
    void index;
  });

  return best!;
};

const compareScores = (a: readonly number[], b: readonly number[]): number => {
  for (let i = 0; i < a.length; i++) {
    if (a[i]! !== b[i]!) return a[i]! - b[i]!;
  }
  return 0;
};

const scheduleWithRule = (options: ScheduleOptions, rule: PriorityRule): ScheduleAttempt => {
  const { constraints, overnight, originMin = 0, frozen = [] } = options;
  const cpm = computeCpm(options.tasks);

  const successorCount = new Map<string, number>();
  for (const task of options.tasks) {
    for (const dep of task.deps) {
      successorCount.set(dep.fromTaskId, (successorCount.get(dep.fromTaskId) ?? 0) + 1);
    }
  }

  const byId = new Map(options.tasks.map((t) => [t.id, t]));
  const instances = buildInstances(constraints.equipment);
  const cooks = [...constraints.cooks].sort((a, b) => (a.id < b.id ? -1 : 1));
  const cookBusy = new Map<string, { from: number; to: number }[]>(cooks.map((c) => [c.id, []]));
  const cookLoad = new Map<string, number>(cooks.map((c) => [c.id, 0]));

  const scheduled = new Map<string, ScheduledTask>();
  const finishOf = new Map<string, number>();
  const washes: Task[] = [];
  const rationale: Rationale[] = [];
  const warnings: ScheduleWarning[] = [];
  let washOrder = 0;

  for (const f of frozen) {
    scheduled.set(f.taskId, f);
    finishOf.set(f.taskId, f.endMin);
    const task = byId.get(f.taskId);
    if (task?.requiresCook && f.cookId) {
      cookBusy.get(f.cookId)?.push({ from: f.startMin, to: f.endMin });
      cookLoad.set(f.cookId, (cookLoad.get(f.cookId) ?? 0) + task.durationMin);
    }
    for (const slot of f.resources) {
      const inst = instances.find((i) => i.equipmentId === slot.equipmentId && i.instance === slot.instance);
      if (inst) occupy(inst, f.startMin, f.endMin);
    }
  }

  /** The chosen rule, always finishing on task id so two runs cannot disagree. */
  const priority = (a: Task, b: Task): number => {
    const na = cpm.nodes.get(a.id)!;
    const nb = cpm.nodes.get(b.id)!;
    const byId2 = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    switch (rule) {
      case 'min-slack':
        return na.slackMin - nb.slackMin || nb.remainingPathMin - na.remainingPathMin || byId2;
      case 'longest-path':
        return nb.remainingPathMin - na.remainingPathMin || na.slackMin - nb.slackMin || byId2;
      case 'most-successors':
        return (
          (successorCount.get(b.id) ?? 0) - (successorCount.get(a.id) ?? 0) ||
          na.slackMin - nb.slackMin ||
          byId2
        );
      case 'shortest-first':
        return a.durationMin - b.durationMin || na.slackMin - nb.slackMin || byId2;
      case 'earliest-due':
        return na.latestFinish - nb.latestFinish || nb.remainingPathMin - na.remainingPathMin || byId2;
    }
  };

  const remaining = options.tasks.filter((t) => !scheduled.has(t.id));

  while (remaining.length > 0) {
    const ready = remaining
      .filter((t) => t.deps.every((d) => scheduled.has(d.fromTaskId) || !byId.has(d.fromTaskId)))
      .sort(priority);

    if (ready.length === 0) {
      // Everything left depends on something unscheduled: a cycle the compiler missed, or
      // a dangling edge. Report rather than loop forever.
      warnings.push({
        severity: 'error',
        code: 'unschedulable',
        message: `${remaining.length} task(s) could not be scheduled because their dependencies never completed.`,
        taskIds: remaining.map((t) => t.id).slice(0, 10),
      });
      break;
    }

    const task = ready[0]!;

    // Earliest the dependencies allow.
    let earliest = originMin;
    for (const dep of task.deps) {
      const from = scheduled.get(dep.fromTaskId);
      if (!from) continue;
      const base = dep.type === 'start-to-start' ? from.startMin : from.endMin;
      earliest = Math.max(earliest, base + (dep.minDelayMin ?? 0));
    }

    const placement = place(task, earliest);
    if (!placement) {
      warnings.push({
        severity: 'error',
        code: 'no-placement',
        message: `Could not place "${task.name}" — no cook is eligible, or the kitchen has nothing it needs.`,
        taskIds: [task.id],
      });
      remaining.splice(remaining.indexOf(task), 1);
      continue;
    }

    // Insert any washes this placement required, before the task itself.
    for (const pending of placement.washes) {
      washes.push(pending.task);
      const inst = instances.find((i) => i.key === pending.instanceKey)!;
      const washStart = placement.washStart.get(pending.instanceKey)!;
      const washEnd = washStart + pending.task.durationMin;
      occupy(inst, washStart, washEnd);
      inst.state = 'clean';
      inst.stateAt = washEnd;
      cookBusy.get(placement.washCook.get(pending.instanceKey)!)!.push({ from: washStart, to: washEnd });
      cookLoad.set(
        placement.washCook.get(pending.instanceKey)!,
        (cookLoad.get(placement.washCook.get(pending.instanceKey)!) ?? 0) + pending.task.durationMin,
      );
      scheduled.set(pending.task.id, {
        taskId: pending.task.id,
        startMin: washStart,
        endMin: washEnd,
        cookId: placement.washCook.get(pending.instanceKey)!,
        resources: [{ equipmentId: inst.equipmentId, instance: inst.instance }],
        isCritical: false,
        slackMin: 0,
      });
      rationale.push({
        type: 'wash-inserted',
        taskIds: [pending.task.id, task.id],
        explanation: pending.task.name,
        minutes: pending.task.durationMin,
      });
    }

    const { start, end, cookId, used } = placement;

    for (const inst of used) {
      occupy(inst, start, end);
      const leaves = leavesOf(task);
      if (leaves !== 'clean' || inst.stateAt < end) {
        inst.state = leaves;
        inst.stateAt = end;
      }
    }
    if (cookId) {
      cookBusy.get(cookId)!.push({ from: start, to: end });
      cookLoad.set(cookId, (cookLoad.get(cookId) ?? 0) + task.durationMin);
    }

    const node = cpm.nodes.get(task.id)!;
    scheduled.set(task.id, {
      taskId: task.id,
      startMin: start,
      endMin: end,
      ...(cookId ? { cookId } : {}),
      resources: used.map((i) => ({ equipmentId: i.equipmentId, instance: i.instance })),
      isCritical: node.slackMin === 0,
      slackMin: node.slackMin,
    });
    finishOf.set(task.id, end);
    remaining.splice(remaining.indexOf(task), 1);

    // A maximum delay that could not be met is a safety or quality breach, and the user
    // needs to know rather than find out later.
    for (const dep of task.deps) {
      if (dep.maxDelayMin === undefined) continue;
      const from = scheduled.get(dep.fromTaskId);
      if (!from) continue;
      const gap = start - from.endMin;
      if (gap > dep.maxDelayMin) {
        warnings.push({
          severity: 'warning',
          code: 'max-delay-breached',
          message:
            dep.reason ??
            `"${task.name}" started ${gap - dep.maxDelayMin} min later than it should have after "${byId.get(dep.fromTaskId)?.name ?? dep.fromTaskId}".`,
          taskIds: [dep.fromTaskId, task.id],
        });
      }
    }
  }

  /**
   * Find the earliest minute this task can run: every resource free, a cook free and
   * eligible, and any washes its surfaces need inserted first.
   */
  function place(
    task: Task,
    earliest: number,
  ):
    | {
        start: number;
        end: number;
        cookId?: string;
        used: Instance[];
        washes: PendingWash[];
        washStart: Map<ResourceSlotKey, number>;
        washCook: Map<ResourceSlotKey, string>;
      }
    | null {
    const beyondSession = overnight.has(task.id);
    const eligibleCooks = task.requiresCook
      ? cooks.filter(
          (c) => c.eligibleFor.includes(task.class) && meetsSkill(c.skill, task.minSkill),
        )
      : [];
    if (task.requiresCook && eligibleCooks.length === 0) return null;

    const need = needOf(task);

    // Candidate instances per requirement, preferring ones that need no wash — that is how
    // "cook the beef before the mushrooms" falls out without a special case.
    const requirements = task.equipment;
    for (const r of requirements) {
      if (!instances.some((i) => i.kind === r.kind)) return null;
    }

    for (let t = earliest; t < earliest + 24 * 60; t++) {
      const end = t + task.durationMin;
      const chosen: Instance[] = [];
      const washes: PendingWash[] = [];
      const washStart = new Map<ResourceSlotKey, number>();
      const washCook = new Map<ResourceSlotKey, string>();
      /**
       * Washes decided so far *in this attempt*. A task needing two dirty surfaces used to
       * hand both washes to the same cook at the same minute, because each lookup only saw
       * `cookBusy`, which is not written until the placement is committed.
       */
      const claimed = new Map<string, { from: number; to: number }[]>();
      let ok = true;

      for (const r of requirements) {
        const pool = instances
          .filter((i) => i.kind === r.kind && !chosen.includes(i))
          // Prefer an instance that needs no wash; then the lowest key, for determinism.
          .sort((a, b) => {
            const aw = needsWash(a.state, need, a.kind) ? 1 : 0;
            const bw = needsWash(b.state, need, b.kind) ? 1 : 0;
            return aw - bw || (a.key < b.key ? -1 : 1);
          });

        let picked: Instance | null = null;
        for (const inst of pool) {
          const dirty = needsWash(inst.state, need, inst.kind);
          const washMin = dirty ? washMinutes(inst.kind, inst.state) : 0;
          const from = dirty ? t - washMin : t;
          if (from < originMin) continue;
          if (!free(inst.busy, from, end)) continue;
          picked = inst;
          if (dirty) {
            const washer = eligibleCooks.length > 0 ? eligibleCooks : cooks;
            const washerId = washer.find((c) => {
              const busy = [...(cookBusy.get(c.id) ?? []), ...(claimed.get(c.id) ?? [])];
              return (
                c.eligibleFor.includes('wash-up') &&
                free(busy, from, t) &&
                availableForTask(c, from, t, beyondSession)
              );
            })?.id;
            if (!washerId) {
              picked = null;
              continue;
            }
            washes.push({ task: makeWashTask(task, inst, washOrder++), instanceKey: inst.key });
            washStart.set(inst.key, from);
            washCook.set(inst.key, washerId);
            claimed.set(washerId, [...(claimed.get(washerId) ?? []), { from, to: t }]);
          }
          break;
        }

        if (!picked) {
          ok = false;
          break;
        }
        chosen.push(picked);
      }

      if (!ok) continue;

      if (!task.requiresCook) {
        return { start: t, end, used: chosen, washes, washStart, washCook };
      }

      // Prefer the least-loaded eligible cook who is free — earliest finish, then fairness.
      const candidate = eligibleCooks
        .filter(
          (c) =>
            free([...(cookBusy.get(c.id) ?? []), ...(claimed.get(c.id) ?? [])], t, end) &&
            availableForTask(c, t, end, beyondSession),
        )
        .sort((a, b) => (cookLoad.get(a.id) ?? 0) - (cookLoad.get(b.id) ?? 0) || (a.id < b.id ? -1 : 1))[0];

      if (!candidate) continue;
      return { start: t, end, cookId: candidate.id, used: chosen, washes, washStart, washCook };
    }

    return null;
  }

  const all = [...scheduled.values()];
  const makespanMin = Math.max(originMin, ...all.map((s) => s.endMin), originMin);

  /**
   * The session is over when the last pair of hands is free, not when the last molecule is
   * cold. A dish chilling in the fridge is not you still cooking — you have walked away.
   *
   * This matters more than it sounds: every dish ends with a twenty-minute chill, so
   * counting passive tails put every session twenty-plus minutes over budget and sent the
   * degradation ladder cutting food to solve a problem that did not exist.
   *
   * Passive time in the MIDDLE still counts, because attended work after it pushes the
   * finish out. Only the tail is free.
   */
  const attended = all.filter((s) => {
    if (overnight.has(s.taskId)) return false;
    return byId.get(s.taskId)?.requiresCook === true;
  });
  const inSessionMakespanMin = Math.max(originMin, ...attended.map((s) => s.endMin), originMin);

  return {
    scheduled: all.sort((a, b) => a.startMin - b.startMin || (a.taskId < b.taskId ? -1 : 1)),
    tasks: [...options.tasks, ...washes],
    makespanMin,
    inSessionMakespanMin,
    washes,
    rationale,
    warnings,
    cpm,
  };
};
