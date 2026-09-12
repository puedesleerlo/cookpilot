import {
  CATEGORY_CONTAMINATION,
  passiveMinOf,
  taskId as makeTaskId,
  type Constraints,
  type Dependency,
  type Dish,
  type EquipmentRequirement,
  type MealPlan,
  type RecipeStep,
  type SafetyConstraint,
  type Task,
} from '@kitchen/domain';

/**
 * The task graph compiler.
 *
 * Two ideas do all the work here.
 *
 * The first is the phase split. A recipe step is not a schedulable unit: "simmer the rice
 * for 25 minutes" occupies a saucepan for 25 minutes and a cook for 2. Splitting each step
 * into START (hands + equipment), HOLD (equipment only) and FINISH (hands again) is what
 * makes that expressible, and it is where every minute of parallelism comes from.
 *
 * The second is that recipes stop too early. A session is not over when the food is cooked
 * — it is over when it is portioned, chilled and labelled, and cooked food has to reach
 * refrigeration inside a window. Those are real tasks with real durations competing for
 * real cold space. Leaving them out makes the finish time a lie.
 */

export type TaskGraph = {
  tasks: Task[];
  /** Task ids whose duration runs past the session, e.g. a twelve-hour steep. */
  overnight: string[];
  dishNames: Record<string, string>;
  warnings: string[];
};

export type CompileError = { ok: false; reason: string };
export type CompileOk = { ok: true; graph: TaskGraph };
export type CompileResult = CompileOk | CompileError;

/** A steep or chill longer than this is a tail that outlives the session. */
const OVERNIGHT_TAIL_MIN = 180;

const req = (r: EquipmentRequirement): EquipmentRequirement => ({ ...r });

const heldThrough = (equipment: EquipmentRequirement[]): EquipmentRequirement[] =>
  equipment.filter((e) => e.heldThroughHold).map(req);

// ------------------------------------------------------------------- safety

/** What a step leaves on the surface it touched, from the ingredients it handled. */
const contaminationFrom = (
  step: RecipeStep,
  dish: Dish,
): SafetyConstraint[] => {
  const categories = step.ingredientRefs
    .map((name) => dish.ingredients.find((i) => i.canonicalName === name)?.category)
    .filter((c): c is NonNullable<typeof c> => c !== undefined);

  const out: SafetyConstraint[] = [];

  if (step.taskClass === 'raw-protein' || categories.includes('protein-raw')) {
    // Fish and egg leave different residues from meat, and the wash table distinguishes them.
    const leaves = step.ingredientRefs.some((n) => /salmon|fish|prawn|shrimp|cod|tuna/i.test(n))
      ? ('raw-fish' as const)
      : step.ingredientRefs.some((n) => /\begg/i.test(n))
        ? ('raw-egg' as const)
        : (CATEGORY_CONTAMINATION['protein-raw'] ?? ('raw-meat' as const));
    out.push({
      kind: 'raw-protein',
      leaves,
      note: 'Anything this touches needs washing before it meets food that will not be cooked.',
    });
  }

  if (step.taskClass === 'stovetop' || step.taskClass === 'oven' || step.taskClass === 'boil-water') {
    out.push({ kind: 'hot-surface', note: 'Hot pan, hot handle.' });
  }
  if (step.taskClass === 'knife-work') {
    out.push({ kind: 'sharp', note: 'Sharp knife.' });
  }
  if (step.taskClass === 'garnish' || step.taskClass === 'assemble' || step.taskClass === 'portion') {
    out.push({
      kind: 'ready-to-eat',
      note: 'This food is not cooked after this point, so the surface must be clean.',
    });
  }

  return out;
};

// -------------------------------------------------------------- expansion

type ExpandedStep = { first: string; last: string; tasks: Task[] };

/**
 * One step becomes up to three tasks. A phase is emitted only where there is time in it,
 * so a fully attended sear is one task and a rest is one task that needs nobody.
 */
const expandStep = (step: RecipeStep, dish: Dish): ExpandedStep => {
  const passive = passiveMinOf(step);
  const safety = contaminationFrom(step, dish);
  const tasks: Task[] = [];

  const base = {
    dishId: dish.id,
    class: step.taskClass,
    ingredients: step.ingredientRefs,
    effort: step.effort,
    minSkill: step.minSkill,
    optional: step.optional,
    synthetic: false,
  };

  const pushTask = (
    phase: 'start' | 'hold' | 'finish',
    durationMin: number,
    equipment: EquipmentRequirement[],
    name: string,
    deps: Dependency[],
  ): string => {
    const id = makeTaskId(dish.id, step.id, phase);
    tasks.push({
      ...base,
      id,
      name,
      phase,
      durationMin,
      requiresCook: phase !== 'hold',
      equipment,
      deps,
      // A HOLD is nobody's problem, so the safety notes belong on the attended phases.
      safety: phase === 'hold' ? [] : safety,
    });
    return id;
  };

  let previous: string | null = null;

  if (step.activeMin > 0) {
    previous = pushTask('start', step.activeMin, step.equipment.map(req), step.text, []);
  }

  if (passive > 0) {
    const name = step.activeMin > 0 ? `${step.text} — unattended` : step.text;
    previous = pushTask(
      'hold',
      passive,
      // Only what is genuinely held. The knife that chopped the aromatics is free now.
      heldThrough(step.equipment),
      name,
      previous ? [{ fromTaskId: previous, type: 'finish-to-start' }] : [],
    );
  }

  if (step.finishMin > 0) {
    previous = pushTask(
      'finish',
      step.finishMin,
      step.equipment.map(req),
      `${step.text} — finish`,
      previous ? [{ fromTaskId: previous, type: 'finish-to-start' }] : [],
    );
  }

  // A zero-duration step would emit nothing; give it a minimal attended task so its
  // dependencies still have something to hang from.
  if (tasks.length === 0) {
    previous = pushTask('start', 1, step.equipment.map(req), step.text, []);
  }

  return { first: tasks[0]!.id, last: previous!, tasks };
};

// ------------------------------------------------------------- finishing

/**
 * What recipes leave out. A dish is not done when it is cooked — it is done when it is in a
 * labelled container in the fridge, and the clock on getting it there is a food-safety
 * constraint rather than a preference.
 */
const finishingTasks = (
  dish: Dish,
  lastCookingTaskId: string,
  constraints: Constraints,
): Task[] => {
  /**
   * A sauce is already in the jar it was made in and a drink is already in the pitcher —
   * "portioning" them is screwing a lid on. Charging those the same four minutes as
   * dividing a stir-fry into containers added roughly twelve minutes of imaginary work to
   * a six-dish session, which the degradation ladder then "fixed" by cutting real food.
   */
  const decanted = dish.kind === 'sauce' || dish.kind === 'beverage';
  const portions = Math.max(1, Math.ceil(dish.servings / 2));
  const portionMin = decanted ? 2 : Math.max(2, Math.min(8, portions * 2));

  const portionId = makeTaskId(dish.id, 'finishing', 'portion');
  const chillStartId = makeTaskId(dish.id, 'finishing', 'chill-start');
  const chillHoldId = makeTaskId(dish.id, 'finishing', 'chill-hold');
  const labelId = makeTaskId(dish.id, 'finishing', 'label');

  return [
    {
      id: portionId,
      dishId: dish.id,
      name: `Portion the ${dish.name.toLowerCase()} into containers`,
      class: 'portion',
      phase: 'start',
      durationMin: portionMin,
      requiresCook: true,
      // Shallow containers cool faster; that is why this is a real task and not a rounding error.
      equipment: [{ kind: 'storage-container', count: 1, heldThroughHold: false }],
      ingredients: [],
      deps: [
        {
          fromTaskId: lastCookingTaskId,
          type: 'finish-to-start',
          maxDelayMin: constraints.maxTimeToChillMin,
          reason: `Cooked food has to be cold within ${constraints.maxTimeToChillMin} minutes.`,
        },
      ],
      safety: [
        { kind: 'ready-to-eat', note: 'Cooked food on a clean surface only.' },
        {
          kind: 'max-hold',
          withinMin: constraints.maxTimeToChillMin,
          note: `Into the fridge within ${constraints.maxTimeToChillMin} minutes of coming off the heat.`,
        },
      ],
      effort: 1,
      minSkill: 'beginner',
      optional: false,
      synthetic: true,
    },
    {
      id: chillStartId,
      dishId: dish.id,
      name: `Get the ${dish.name.toLowerCase()} into the fridge`,
      class: 'chill',
      phase: 'start',
      durationMin: 2,
      requiresCook: true,
      equipment: [{ kind: 'fridge-shelf', count: 1, heldThroughHold: true }],
      ingredients: [],
      deps: [{ fromTaskId: portionId, type: 'finish-to-start', maxDelayMin: 10 }],
      safety: [],
      effort: 1,
      minSkill: 'beginner',
      optional: false,
      synthetic: true,
    },
    {
      id: chillHoldId,
      dishId: dish.id,
      name: `${dish.name} chills`,
      class: 'chill',
      phase: 'hold',
      durationMin: 20,
      requiresCook: false,
      // Cold storage is finite, so chilling competes with the batch drinks for shelf space.
      equipment: [{ kind: 'fridge-shelf', count: 1, heldThroughHold: true }],
      ingredients: [],
      deps: [{ fromTaskId: chillStartId, type: 'finish-to-start' }],
      safety: [],
      effort: 1,
      minSkill: 'beginner',
      optional: false,
      synthetic: true,
    },
    {
      id: labelId,
      dishId: dish.id,
      name: `Label the ${dish.name.toLowerCase()} with what and when`,
      class: 'label',
      phase: 'start',
      // A marker pen on a lid. Two minutes each was twelve minutes of fiction per session.
      durationMin: 1,
      requiresCook: true,
      equipment: [],
      ingredients: [],
      deps: [{ fromTaskId: chillStartId, type: 'finish-to-start' }],
      safety: [],
      effort: 1,
      minSkill: 'beginner',
      optional: false,
      synthetic: true,
    },
  ];
};

// --------------------------------------------------------------- acyclicity

const findCycle = (tasks: Task[]): string[] | null => {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const state = new Map<string, 'visiting' | 'done'>();
  const stack: string[] = [];

  const visit = (id: string): string[] | null => {
    const mark = state.get(id);
    if (mark === 'done') return null;
    if (mark === 'visiting') return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, 'visiting');
    stack.push(id);
    for (const dep of byId.get(id)?.deps ?? []) {
      const cycle = visit(dep.fromTaskId);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(id, 'done');
    return null;
  };

  for (const task of tasks) {
    const cycle = visit(task.id);
    if (cycle) return cycle;
  }
  return null;
};

// ----------------------------------------------------------------- compile

export const compileTaskGraph = (plan: MealPlan, constraints: Constraints): CompileResult => {
  const tasks: Task[] = [];
  const overnight: string[] = [];
  const dishNames: Record<string, string> = {};
  const warnings: string[] = [];

  for (const dish of plan.dishes) {
    dishNames[dish.id] = dish.name;

    const stepOutputs = new Map<string, ExpandedStep>();
    const steps = dish.steps;
    /**
     * Once a dish crosses its overnight tail, everything after it is tomorrow — not just
     * the long wait itself. Straining the cold brew is a next-morning job, and scheduling
     * it against today's clock meant no cook was available and the task failed placement,
     * which cascaded into its finishing tasks being unschedulable too.
     */
    let pastTheTail = false;
    if (steps.length === 0) {
      warnings.push(`${dish.name} has no steps and was skipped.`);
      continue;
    }

    for (const step of steps) {
      const expanded = expandStep(step, dish);

      // Wire this step's first task to the last task of everything it depends on.
      const incoming: Dependency[] = [];
      for (const depId of step.dependsOn) {
        const upstream = stepOutputs.get(depId);
        if (!upstream) {
          warnings.push(`${dish.name}: step ${step.id} depends on ${depId}, which is not earlier in the recipe.`);
          continue;
        }
        incoming.push({
          fromTaskId: upstream.last,
          type: 'finish-to-start',
          ...(step.minDelayAfterMin !== undefined ? { minDelayMin: step.minDelayAfterMin } : {}),
          ...(step.maxDelayAfterMin !== undefined ? { maxDelayMin: step.maxDelayAfterMin } : {}),
          ...(step.note ? { reason: step.note } : {}),
        });
      }

      if (incoming.length > 0) {
        const first = expanded.tasks.find((t) => t.id === expanded.first)!;
        first.deps = [...first.deps, ...incoming];
      }

      // A long unattended tail on an overnight recipe outlives the session, and so does
      // everything downstream of it.
      if (dish.overnight && passiveMinOf(step) >= OVERNIGHT_TAIL_MIN) {
        for (const t of expanded.tasks) if (t.phase === 'hold') overnight.push(t.id);
        pastTheTail = true;
      } else if (pastTheTail) {
        for (const t of expanded.tasks) overnight.push(t.id);
      }

      stepOutputs.set(step.id, expanded);
      tasks.push(...expanded.tasks);
    }

    const lastStep = steps[steps.length - 1]!;
    const lastExpanded = stepOutputs.get(lastStep.id);
    if (!lastExpanded) continue;

    const finishing = finishingTasks(dish, lastExpanded.last, constraints);
    if (pastTheTail) for (const t of finishing) overnight.push(t.id);
    tasks.push(...finishing);
  }

  const cycle = findCycle(tasks);
  if (cycle) {
    const dishId = tasks.find((t) => t.id === cycle[0])?.dishId ?? 'unknown';
    return {
      ok: false,
      reason: `${dishNames[dishId] ?? dishId} has steps that depend on each other in a loop: ${cycle.join(' -> ')}`,
    };
  }

  const known = new Set(tasks.map((t) => t.id));
  for (const task of tasks) {
    for (const dep of task.deps) {
      if (!known.has(dep.fromTaskId)) {
        return { ok: false, reason: `${task.id} depends on ${dep.fromTaskId}, which is not in the graph` };
      }
    }
  }

  return { ok: true, graph: { tasks, overnight: [...new Set(overnight)], dishNames, warnings } };
};
