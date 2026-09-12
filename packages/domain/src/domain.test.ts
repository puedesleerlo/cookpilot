import { describe, expect, it } from 'vitest';
import {
  ConstraintsSchema,
  ContaminationStateSchema,
  CookSchema,
  DependencySchema,
  DishSchema,
  EquipmentSchema,
  IngredientSchema,
  TaskSchema,
  TimeWindowSchema,
  allergenOf,
  canonicalJson,
  contentHash,
  makeId,
  meetsSkill,
  slug,
} from './index';
import { aCook, aDish, aHelper, aTask, anIngredient, demoConstraints, someEquipment } from './testing';

describe('identity is deterministic', () => {
  it('slugifies to url-fragment-safe segments', () => {
    expect(slug('Bok Choy & Garlic')).toBe('bok-choy-garlic');
    expect(slug('  Crème   Fraîche  ')).toBe('creme-fraiche');
    expect(slug('!!!')).toBe('x');
  });

  it('returns the identical string for identical components', () => {
    expect(makeId('task', 'Salmon', 'sear', 'start')).toBe('task:salmon:sear:start');
    expect(makeId('task', 'Salmon', 'sear', 'start')).toBe(makeId('task', 'Salmon', 'sear', 'start'));
  });

  it('hashes content independently of key order', () => {
    expect(contentHash({ a: 1, b: [2, 3] })).toBe(contentHash({ b: [2, 3], a: 1 }));
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }));
  });

  it('omits undefined fields from the canonical form', () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe('every factory is valid by default and accepts overrides', () => {
  const cases: [string, () => unknown, { safeParse: (v: unknown) => { success: boolean } }][] = [
    ['ingredient', anIngredient, IngredientSchema],
    ['cook', aCook, CookSchema],
    ['helper', aHelper, CookSchema],
    ['equipment', someEquipment, EquipmentSchema],
    ['task', aTask, TaskSchema],
    ['dish', aDish, DishSchema],
    ['constraints', demoConstraints, ConstraintsSchema],
  ];

  it.each(cases)('%s parses with no arguments', (_name, factory, schema) => {
    expect(schema.safeParse(factory()).success).toBe(true);
  });

  it('applies an override and stays valid', () => {
    const t = aTask({ durationMin: 12 });
    expect(t.durationMin).toBe(12);
    expect(TaskSchema.safeParse(t).success).toBe(true);
  });
});

describe('task invariants', () => {
  it('rejects a negative duration and names the field', () => {
    const result = TaskSchema.safeParse({ ...aTask(), durationMin: -3 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('durationMin'))).toBe(true);
    }
  });

  it('forbids a hold phase from consuming a cook', () => {
    expect(TaskSchema.safeParse({ ...aTask(), phase: 'hold', requiresCook: true }).success).toBe(false);
  });

  it('requires a cook for start and finish phases', () => {
    expect(TaskSchema.safeParse({ ...aTask(), phase: 'start', requiresCook: false }).success).toBe(false);
    expect(TaskSchema.safeParse({ ...aTask(), phase: 'finish', requiresCook: false }).success).toBe(false);
  });

  it('accepts a hold phase that consumes only equipment', () => {
    const hold = aTask({ name: 'Rice cooks', phase: 'hold', requiresCook: false, durationMin: 24 });
    expect(hold.requiresCook).toBe(false);
    expect(hold.durationMin).toBe(24);
  });
});

describe('dependencies express quality and safety windows', () => {
  it('accepts a minimum resting delay', () => {
    const d = DependencySchema.parse({ fromTaskId: 'task:salmon:sear:finish', minDelayMin: 3 });
    expect(d.minDelayMin).toBe(3);
    expect(d.type).toBe('finish-to-start');
  });

  it('accepts a maximum delay for chilling within two hours', () => {
    const d = DependencySchema.parse({ fromTaskId: 'task:rice:cook:finish', maxDelayMin: 120 });
    expect(d.maxDelayMin).toBe(120);
  });

  it('rejects a minimum that exceeds the maximum', () => {
    const r = DependencySchema.safeParse({ fromTaskId: 'x', minDelayMin: 10, maxDelayMin: 5 });
    expect(r.success).toBe(false);
  });
});

describe('equipment carries capacity and contamination', () => {
  it('counts interchangeable instances in one entry', () => {
    const burners = someEquipment({ kind: 'burner', count: 2 });
    expect(burners.count).toBe(2);
  });

  it('models cold storage with finite capacity', () => {
    const fridge = someEquipment({ kind: 'fridge-shelf', count: 1, capacity: 4 });
    expect(fridge.capacity).toBe(4);
  });

  it('accepts an allergen-qualified state and exposes the allergen', () => {
    const parsed = ContaminationStateSchema.parse('allergen:peanut');
    expect(allergenOf(parsed)).toBe('peanut');
  });

  it('rejects an unknown contamination state', () => {
    expect(ContaminationStateSchema.safeParse('sticky').success).toBe(false);
    expect(ContaminationStateSchema.safeParse('allergen:').success).toBe(false);
  });
});

describe('cook capability', () => {
  it('lets eligibility narrow what skill would otherwise allow', () => {
    const wary = aCook({ skill: 'confident', eligibleFor: ['knife-work', 'mix', 'portion'] });
    expect(meetsSkill(wary.skill, 'intermediate')).toBe(true);
    expect(wary.eligibleFor).not.toContain('raw-protein');
  });

  it('keeps a helper away from heat and raw protein by default', () => {
    const kid = aHelper();
    expect(kid.eligibleFor).not.toContain('stovetop');
    expect(kid.eligibleFor).not.toContain('raw-protein');
    expect(kid.eligibleFor).toContain('portion');
    expect(kid.eligibleFor).toContain('label');
  });

  it('expresses a cook leaving as a bounded availability window', () => {
    const leaver = aCook({ available: [{ startMin: 0, endMin: 18 }] });
    expect(leaver.available[0]).toEqual({ startMin: 0, endMin: 18 });
  });

  it('rejects a window that ends before it starts', () => {
    expect(TimeWindowSchema.safeParse({ startMin: 30, endMin: 10 }).success).toBe(false);
  });
});

describe('the demo kitchen', () => {
  it('matches the §10 scenario', () => {
    const c = demoConstraints();
    expect(c.timeBudgetMin).toBe(60);
    expect(c.servings).toBe(4);
    expect(c.cooks).toHaveLength(2);
    expect(c.equipment.find((e) => e.kind === 'burner')?.count).toBe(2);
    expect(c.equipment.find((e) => e.kind === 'oven-rack')).toBeUndefined();
    expect(c.fridgeCapacity).toBe(4);
  });
});
