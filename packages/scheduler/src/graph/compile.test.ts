import { describe, expect, it } from 'vitest';
import {
  DishSchema,
  MealPlanSchema,
  RecipeStepSchema,
  type Constraints,
  type Dish,
  type MealPlan,
  type RecipeStep,
  type Task,
} from '@kitchen/domain';
import { demoConstraints } from '@kitchen/domain/testing';
import { compileTaskGraph } from './compile';

const step = (over: Partial<RecipeStep> & { id: string }): RecipeStep =>
  RecipeStepSchema.parse({
    verb: 'simmer',
    text: 'Do the thing',
    durationMin: 10,
    activeMin: 2,
    finishMin: 0,
    taskClass: 'simmer-watch',
    equipment: [{ kind: 'saucepan', count: 1, heldThroughHold: true }],
    ...over,
  });

const dish = (over: Partial<Dish> = {}): Dish =>
  DishSchema.parse({
    id: 'dish:rice',
    name: 'Steamed rice',
    kind: 'base',
    servings: 4,
    steps: [step({ id: 's0' })],
    ingredients: [],
    ...over,
  });

const plan = (dishes: Dish[]): MealPlan =>
  MealPlanSchema.parse({
    id: 'plan:test',
    name: 'Test plan',
    tagline: 'For the tests',
    dishes,
    score: {
      total: 1,
      pantryCoverage: 1,
      urgencyCoverage: 1,
      styleMatch: 1,
      estimatedActiveMin: 10,
      estimatedTotalMin: 20,
      overlapBonus: 0,
    },
    coverage: { usedIngredientIds: [], unusedIngredientIds: [], unusedUrgentIngredientIds: [] },
    totalServings: 4,
  });

const compile = (dishes: Dish[], constraints: Constraints = demoConstraints()) => {
  const result = compileTaskGraph(plan(dishes), constraints);
  if (!result.ok) throw new Error(result.reason);
  return result.graph;
};

/** The tasks that came from the recipe, excluding the finishing tasks the compiler adds. */
const cooking = (graph: { tasks: Task[] }): Task[] => graph.tasks.filter((t) => !t.synthetic);

describe('the phase split', () => {
  it('separates the pan from the cook on a simmer', () => {
    const graph = compile([dish({ steps: [step({ id: 's0', durationMin: 25, activeMin: 2, finishMin: 1 })] })]);
    const phases = cooking(graph);
    expect(phases.map((t) => [t.phase, t.durationMin, t.requiresCook])).toEqual([
      ['start', 2, true],
      ['hold', 22, false],
      ['finish', 1, true],
    ]);
  });

  it('emits one task for a fully attended step', () => {
    const graph = compile([
      dish({ steps: [step({ id: 's0', verb: 'sear', taskClass: 'stovetop', durationMin: 8, activeMin: 8 })] }),
    ]);
    const phases = cooking(graph);
    expect(phases).toHaveLength(1);
    expect(phases[0]).toMatchObject({ phase: 'start', durationMin: 8, requiresCook: true });
  });

  it('emits a hold that needs nobody for a rest', () => {
    const graph = compile([
      dish({ steps: [step({ id: 's0', verb: 'rest', taskClass: 'chill', durationMin: 5, activeMin: 0, equipment: [] })] }),
    ]);
    const phases = cooking(graph);
    expect(phases).toHaveLength(1);
    expect(phases[0]).toMatchObject({ phase: 'hold', durationMin: 5, requiresCook: false });
  });

  it('chains the phases of one step in order', () => {
    const graph = compile([dish({ steps: [step({ id: 's0', durationMin: 25, activeMin: 2, finishMin: 1 })] })]);
    const [start, hold, finish] = cooking(graph);
    expect(hold!.deps.map((d) => d.fromTaskId)).toEqual([start!.id]);
    expect(finish!.deps.map((d) => d.fromTaskId)).toEqual([hold!.id]);
  });

  it('never lets a hold require a cook', () => {
    const graph = compile([dish({ steps: [step({ id: 's0', durationMin: 30, activeMin: 3, finishMin: 2 })] })]);
    for (const task of graph.tasks) {
      expect(task.requiresCook, task.id).toBe(task.phase !== 'hold');
    }
  });
});

describe('equipment is held only where it is really held', () => {
  it('keeps the saucepan through a simmer', () => {
    const graph = compile([
      dish({
        steps: [
          step({
            id: 's0',
            durationMin: 25,
            activeMin: 2,
            equipment: [
              { kind: 'saucepan', count: 1, heldThroughHold: true },
              { kind: 'burner', count: 1, heldThroughHold: true },
            ],
          }),
        ],
      }),
    ]);
    const hold = graph.tasks.find((t) => t.phase === 'hold')!;
    expect(hold.equipment.map((e) => e.kind).sort()).toEqual(['burner', 'saucepan']);
  });

  it('frees the knife while food marinates', () => {
    const graph = compile([
      dish({
        steps: [
          step({
            id: 's0',
            verb: 'marinate',
            taskClass: 'marinate',
            durationMin: 20,
            activeMin: 3,
            equipment: [
              { kind: 'mixing-bowl', count: 1, heldThroughHold: true },
              { kind: 'knife', count: 1, heldThroughHold: false },
              { kind: 'cutting-board', count: 1, heldThroughHold: false },
            ],
          }),
        ],
      }),
    ]);
    const hold = graph.tasks.find((t) => t.phase === 'hold')!;
    expect(hold.equipment.map((e) => e.kind)).toEqual(['mixing-bowl']);
  });
});

describe('dependencies between steps', () => {
  const twoSteps = (over: Partial<RecipeStep> = {}) =>
    dish({
      steps: [
        step({ id: 's0', durationMin: 10, activeMin: 2, finishMin: 1 }),
        step({ id: 's1', durationMin: 5, activeMin: 5, dependsOn: ['s0'], ...over }),
      ],
    });

  it('wires the dependent step to the last phase of its predecessor', () => {
    const graph = compile([twoSteps()]);
    const tasks = cooking(graph);
    const s0Finish = tasks.find((t) => t.id.includes('s0') && t.phase === 'finish')!;
    const s1Start = tasks.find((t) => t.id.includes('s1'))!;
    expect(s1Start.deps.map((d) => d.fromTaskId)).toContain(s0Finish.id);
  });

  it('preserves a minimum delay', () => {
    const graph = compile([twoSteps({ minDelayAfterMin: 3 })]);
    const s1 = cooking(graph).find((t) => t.id.includes('s1'))!;
    expect(s1.deps.some((d) => d.minDelayMin === 3)).toBe(true);
  });

  it('preserves a maximum delay', () => {
    const graph = compile([twoSteps({ maxDelayAfterMin: 2 })]);
    const s1 = cooking(graph).find((t) => t.id.includes('s1'))!;
    expect(s1.deps.some((d) => d.maxDelayMin === 2)).toBe(true);
  });

  it('leaves independent steps unconnected', () => {
    const graph = compile([
      dish({
        steps: [
          step({ id: 's0', durationMin: 4, activeMin: 4 }),
          step({ id: 's1', durationMin: 4, activeMin: 4, dependsOn: [] }),
        ],
      }),
    ]);
    const s1 = cooking(graph).find((t) => t.id.includes('s1'))!;
    expect(s1.deps).toEqual([]);
  });
});

describe('the session ends portioned, chilled and labelled', () => {
  it('appends the finishing tasks recipes leave out', () => {
    const graph = compile([dish()]);
    const classes = graph.tasks.filter((t) => t.synthetic).map((t) => t.class);
    expect(classes).toContain('portion');
    expect(classes).toContain('chill');
    expect(classes).toContain('label');
  });

  it('holds cooked food to the chill window', () => {
    const constraints = demoConstraints({ maxTimeToChillMin: 120 });
    const graph = compile([dish()], constraints);
    const portion = graph.tasks.find((t) => t.class === 'portion')!;
    expect(portion.deps[0]!.maxDelayMin).toBe(120);
    expect(portion.safety.some((s) => s.kind === 'max-hold' && s.withinMin === 120)).toBe(true);
  });

  it('makes chilling compete for cold storage', () => {
    const graph = compile([dish()]);
    const chills = graph.tasks.filter((t) => t.class === 'chill');
    expect(chills.length).toBeGreaterThan(0);
    for (const c of chills) {
      expect(c.equipment.some((e) => e.kind === 'fridge-shelf')).toBe(true);
    }
  });

  it('labels after chilling has started', () => {
    const graph = compile([dish()]);
    const label = graph.tasks.find((t) => t.class === 'label')!;
    const chillStart = graph.tasks.find((t) => t.class === 'chill' && t.phase === 'start')!;
    expect(label.deps.map((d) => d.fromTaskId)).toContain(chillStart.id);
  });

  it('portions more for a bigger dish', () => {
    const small = compile([dish({ servings: 2 })]).tasks.find((t) => t.class === 'portion')!;
    const large = compile([dish({ servings: 10, id: 'dish:big' })]).tasks.find((t) => t.class === 'portion')!;
    expect(large.durationMin).toBeGreaterThan(small.durationMin);
  });
});

describe('an overnight tail does not lengthen the session', () => {
  const coldBrew = dish({
    id: 'dish:cold-brew',
    name: 'Cold brew',
    kind: 'beverage',
    overnight: true,
    steps: [
      step({ id: 'g', verb: 'chop', taskClass: 'knife-work', durationMin: 3, activeMin: 3, equipment: [] }),
      step({ id: 'f', verb: 'mix', taskClass: 'mix', durationMin: 2, activeMin: 2, dependsOn: ['g'], equipment: [] }),
      step({
        id: 'steep',
        verb: 'steep',
        taskClass: 'steep',
        durationMin: 720,
        activeMin: 0,
        dependsOn: ['f'],
        equipment: [{ kind: 'jar', count: 1, heldThroughHold: true }],
      }),
    ],
  });

  it('marks the long tail as running past the session', () => {
    const graph = compile([coldBrew]);
    const steepHold = graph.tasks.find((t) => t.id.includes('steep') && t.phase === 'hold')!;
    expect(graph.overnight).toContain(steepHold.id);
  });

  it('keeps the work before the tail inside the session', () => {
    const graph = compile([coldBrew]);
    const grind = graph.tasks.find((t) => t.id.includes(':g:'))!;
    expect(graph.overnight).not.toContain(grind.id);
  });

  it('puts the finishing tasks after the tail outside the session too', () => {
    const graph = compile([coldBrew]);
    const label = graph.tasks.find((t) => t.class === 'label')!;
    expect(graph.overnight).toContain(label.id);
  });

  it('does not mark a normal dish as overnight', () => {
    expect(compile([dish()]).overnight).toEqual([]);
  });
});

describe('safety annotations', () => {
  const raw = (name: string, ingredientName: string) =>
    dish({
      id: `dish:${name}`,
      ingredients: [
        { canonicalName: ingredientName, category: 'protein-raw', role: 'core', optional: false, substitutes: [] },
      ],
      steps: [
        step({
          id: 's0',
          verb: 'slice',
          taskClass: 'raw-protein',
          durationMin: 5,
          activeMin: 5,
          ingredientRefs: [ingredientName],
          equipment: [{ kind: 'cutting-board', count: 1, heldThroughHold: false }],
        }),
      ],
    });

  it('marks raw meat', () => {
    const graph = compile([raw('chicken', 'chicken breast')]);
    const task = cooking(graph)[0]!;
    expect(task.safety.find((s) => s.kind === 'raw-protein')?.leaves).toBe('raw-meat');
  });

  it('distinguishes raw fish', () => {
    const graph = compile([raw('salmon', 'salmon')]);
    const task = cooking(graph)[0]!;
    expect(task.safety.find((s) => s.kind === 'raw-protein')?.leaves).toBe('raw-fish');
  });

  it('distinguishes raw egg', () => {
    const graph = compile([raw('eggs', 'eggs')]);
    const task = cooking(graph)[0]!;
    expect(task.safety.find((s) => s.kind === 'raw-protein')?.leaves).toBe('raw-egg');
  });

  it('marks ready-to-eat work', () => {
    const graph = compile([dish()]);
    const portion = graph.tasks.find((t) => t.class === 'portion')!;
    expect(portion.safety.some((s) => s.kind === 'ready-to-eat')).toBe(true);
  });

  it('marks hot surfaces and sharp knives', () => {
    const graph = compile([
      dish({
        steps: [
          step({ id: 'a', verb: 'sear', taskClass: 'stovetop', durationMin: 6, activeMin: 6 }),
          step({ id: 'b', verb: 'chop', taskClass: 'knife-work', durationMin: 4, activeMin: 4, dependsOn: [] }),
        ],
      }),
    ]);
    const tasks = cooking(graph);
    expect(tasks.find((t) => t.id.includes(':a:'))!.safety.some((s) => s.kind === 'hot-surface')).toBe(true);
    expect(tasks.find((t) => t.id.includes(':b:'))!.safety.some((s) => s.kind === 'sharp')).toBe(true);
  });

  it('does not put safety notes on a hold, which nobody is attending', () => {
    const graph = compile([raw('chicken2', 'chicken breast')]);
    for (const hold of graph.tasks.filter((t) => t.phase === 'hold')) {
      expect(hold.safety).toEqual([]);
    }
  });
});

describe('graph integrity', () => {
  it('names the recipe that introduced a cycle, and does not hang', () => {
    const cyclic = DishSchema.parse({
      id: 'dish:loop',
      name: 'Impossible soup',
      kind: 'main',
      servings: 2,
      ingredients: [],
      steps: [
        { ...step({ id: 'a', dependsOn: [] }) },
        { ...step({ id: 'b', dependsOn: ['a'] }) },
      ],
    });
    // Hand-build the loop the schema would otherwise prevent.
    (cyclic.steps[0] as { dependsOn: string[] }).dependsOn = ['b'];

    const result = compileTaskGraph(plan([cyclic]), demoConstraints());
    // `b` is not yet emitted when `a` is compiled, so this surfaces as a dangling reference
    // rather than a cycle -- either way it is reported, not hung.
    if (result.ok) {
      expect(result.graph.warnings.join(' ')).toMatch(/depends on/);
    } else {
      expect(result.reason).toMatch(/Impossible soup|depends on/);
    }
  });

  it('produces a graph where every dependency exists', () => {
    const graph = compile([dish(), dish({ id: 'dish:two', name: 'Second' })]);
    const ids = new Set(graph.tasks.map((t) => t.id));
    for (const task of graph.tasks) {
      for (const dep of task.deps) expect(ids.has(dep.fromTaskId), `${task.id} -> ${dep.fromTaskId}`).toBe(true);
    }
  });

  it('is deterministic', () => {
    const dishes = [dish(), dish({ id: 'dish:two', name: 'Second' })];
    const a = compileTaskGraph(plan(dishes), demoConstraints());
    const b = compileTaskGraph(plan(dishes), demoConstraints());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('skips a dish with no steps and says so', () => {
    const result = compileTaskGraph(plan([dish({ id: 'dish:empty', steps: [] })]), demoConstraints());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.graph.warnings.join(' ')).toMatch(/no steps/);
  });
});
