// @vitest-environment node
/**
 * The §10 demo scenario, compiled end to end.
 *
 * The acceptance test for the whole engine: the pantry, the kitchen and the budget from the
 * brief, against the bundled seed packs, with no network and no model.
 */
import { describe, expect, it } from 'vitest';
import { IngredientSchema, ingredientId, resolveIngredient, type Ingredient } from '@kitchen/domain';
import { demoConstraints } from '@kitchen/domain/testing';
import { buildIndex, buildPlan, loadSeedPacks } from '@kitchen/recipes';
import { compileSchedule } from '@kitchen/scheduler';

/** The §10 pantry, verbatim. */
const DEMO_PANTRY: [string, Ingredient['urgency']][] = [
  ['jasmine rice', 'not-urgent'], ['ground beef', 'use-soon'], ['chicken breast', 'use-today'],
  ['salmon', 'use-today'], ['tomatoes', 'use-soon'], ['eggs', 'not-urgent'],
  ['mushrooms', 'use-soon'], ['bok choy', 'use-today'], ['bell peppers', 'not-urgent'],
  ['garlic', 'not-urgent'], ['ginger', 'not-urgent'], ['soy sauce', 'not-urgent'],
  ['cooking wine', 'not-urgent'], ['sesame oil', 'not-urgent'], ['lemons', 'use-soon'],
  ['mint', 'use-today'], ['coffee beans', 'not-urgent'],
];

const pantry: Ingredient[] = DEMO_PANTRY.map(([name, urgency]) => {
  const r = resolveIngredient(name);
  return IngredientSchema.parse({
    id: ingredientId(r.canonicalName), name, canonicalName: r.canonicalName,
    urgency, category: r.category, allergens: r.allergens,
  });
});

const constraints = demoConstraints();
const index = buildIndex(loadSeedPacks().packs);
const plan = buildPlan({ index, pantry, constraints });
if (!plan) throw new Error('the §10 pantry must produce a plan');
const result = compileSchedule({ plan, constraints });

describe('the §10 demo scenario', () => {
  it('builds a plan from the pantry', () => {
    expect(plan.dishes.length).toBeGreaterThanOrEqual(4);
  });

  it('compiles', () => {
    expect(result.ok).toBe(true);
  });

  it('fits inside the hour', () => {
    if (!result.ok) return;
    expect(result.schedule.feasible).toBe(true);
    expect(result.schedule.makespanMin).toBeLessThanOrEqual(60);
  });

  it('needs no degradation, because the plan was budgeted', () => {
    if (!result.ok) return;
    expect(result.schedule.degradations).toEqual([]);
  });

  it('produces dishes, a sauce and drinks', () => {
    const kinds = plan.dishes.map((d) => d.kind);
    expect(kinds.filter((k) => k === 'main' || k === 'side' || k === 'base').length).toBeGreaterThanOrEqual(3);
    expect(kinds).toContain('sauce');
    expect(kinds.filter((k) => k === 'beverage').length).toBeGreaterThanOrEqual(2);
  });

  it('includes one drink that starts tonight and finishes tomorrow', () => {
    if (!result.ok) return;
    expect(plan.dishes.some((d) => d.overnight)).toBe(true);
    expect(result.schedule.overnight.length).toBeGreaterThan(0);
  });

  it('uses what had to go today', () => {
    expect(plan.score.urgencyCoverage).toBeGreaterThan(0.5);
  });

  it('finds real parallelism', () => {
    if (!result.ok) return;
    expect(result.schedule.metrics.minutesSavedByParallelism).toBeGreaterThan(30);
  });

  it('shares the work between both cooks', () => {
    if (!result.ok) return;
    const loads = Object.values(result.schedule.metrics.activeMinByCook);
    expect(loads).toHaveLength(2);
    for (const load of loads) expect(load).toBeGreaterThan(8);
  });

  it('never hands the helper raw chicken or a hot pan', () => {
    if (!result.ok) return;
    const helper = constraints.cooks.find((c) => c.skill === 'beginner')!;
    for (const s of result.schedule.scheduled) {
      if (s.cookId !== helper.id) continue;
      const task = result.schedule.tasks[s.taskId]!;
      expect(helper.eligibleFor, `${task.name} (${task.class})`).toContain(task.class);
    }
  });

  it('portions, chills and labels every dish', () => {
    if (!result.ok) return;
    const classes = Object.values(result.schedule.tasks).map((t) => t.class);
    expect(classes.filter((c) => c === 'portion')).toHaveLength(plan.dishes.length);
    expect(classes.filter((c) => c === 'label')).toHaveLength(plan.dishes.length);
  });

  it('explains itself, referencing only real tasks', () => {
    if (!result.ok) return;
    expect(result.schedule.rationale.length).toBeGreaterThan(2);
    for (const r of result.schedule.rationale) {
      for (const id of r.taskIds) expect(result.schedule.tasks[id], id).toBeDefined();
    }
  });

  it('raises no errors', () => {
    if (!result.ok) return;
    expect(result.schedule.warnings.filter((w) => w.severity === 'error')).toEqual([]);
  });

  it('never over-allocates a resource', () => {
    if (!result.ok) return;
    const s = result.schedule;
    const counts = new Map(constraints.equipment.map((e) => [e.id, e.count * (e.capacity ?? 1)]));
    for (let t = 0; t <= s.makespanMin; t++) {
      const inUse = new Map<string, number>();
      for (const sc of s.scheduled) {
        if (t < sc.startMin || t >= sc.endMin) continue;
        for (const r of sc.resources) inUse.set(r.equipmentId, (inUse.get(r.equipmentId) ?? 0) + 1);
      }
      for (const [id, n] of inUse) {
        expect(n, `${id} over-allocated at minute ${t}`).toBeLessThanOrEqual(counts.get(id) ?? 0);
      }
    }
  });

  it('never gives a cook two things at once', () => {
    if (!result.ok) return;
    for (const cook of constraints.cooks) {
      const mine = result.schedule.scheduled
        .filter((s) => s.cookId === cook.id)
        .sort((a, b) => a.startMin - b.startMin);
      for (let i = 1; i < mine.length; i++) {
        expect(mine[i]!.startMin, `${cook.name} double-booked`).toBeGreaterThanOrEqual(mine[i - 1]!.endMin);
      }
    }
  });

  it('is deterministic across a hundred runs', () => {
    const first = JSON.stringify(compileSchedule({ plan, constraints }));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(compileSchedule({ plan, constraints })) === first, `run ${i} diverged`).toBe(true);
    }
  }, 60_000);

  it('reports', () => {
    if (!result.ok) return;
    const s = result.schedule;
    console.log(`\nPLAN: ${plan.dishes.map((d) => d.name).join(', ')}`);
    console.log(`tagline: ${plan.tagline}`);
    console.log(`makespan ${s.makespanMin}/${s.timeBudgetMin} min | saved ${s.metrics.minutesSavedByParallelism} | washes ${s.metrics.washCount} | overnight ${s.overnight.length}`);
    console.log(`cooks ${JSON.stringify(s.metrics.activeMinByCook)}`);
    console.log('ERRORS:', JSON.stringify(s.warnings.filter((w) => w.severity === 'error')).slice(0, 500));
    expect(true).toBe(true);
  });
});
