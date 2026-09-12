// @vitest-environment node
/**
 * The demo, compiled the way the browser compiles it.
 *
 * `apps/api/src/demo/demo.test.ts` proves the engine produces the §10 session from the §10
 * fixture. This proves the *client* does — same pantry, but routed through the intake
 * answers and the constraints mapping the UI actually uses, with no test fixture anywhere
 * in the path. The two have drifted apart before; that is exactly what this catches.
 */
import { describe, expect, it } from 'vitest';
import { demoIntake } from './demo';
import { constraintsFrom } from './constraints';
import { compileSession } from './compile';
import { emptyIntake } from './store';

const outcome = compileSession(demoIntake());

describe('compiling the example session in the browser', () => {
  it('compiles', () => {
    expect(outcome.ok, outcome.ok ? '' : outcome.reason).toBe(true);
  });

  it('fits in the hour it was given', () => {
    if (!outcome.ok) return;
    expect(outcome.schedule.feasible).toBe(true);
    expect(outcome.schedule.makespanMin).toBeLessThanOrEqual(60);
  });

  it('cuts nothing and reports no errors', () => {
    if (!outcome.ok) return;
    expect(outcome.schedule.degradations).toEqual([]);
    expect(outcome.schedule.warnings.filter((w) => w.severity === 'error')).toEqual([]);
  });

  it('produces the §10 shape: dishes, a sauce and two drinks', () => {
    if (!outcome.ok) return;
    const kinds = outcome.plan.dishes.map((d) => d.kind);
    expect(kinds.filter((k) => k === 'main' || k === 'side' || k === 'base').length)
      .toBeGreaterThanOrEqual(3);
    expect(kinds).toContain('sauce');
    expect(kinds.filter((k) => k === 'beverage').length).toBeGreaterThanOrEqual(2);
  });

  it('has something to show for the parallelism', () => {
    if (!outcome.ok) return;
    expect(outcome.schedule.metrics.minutesSavedByParallelism).toBeGreaterThan(30);
  });

  it('starts one drink tonight and finishes it tomorrow', () => {
    if (!outcome.ok) return;
    expect(outcome.schedule.overnight.length).toBeGreaterThan(0);
  });

  it('gives both cooks real work', () => {
    if (!outcome.ok) return;
    const loads = Object.values(outcome.schedule.metrics.activeMinByCook);
    expect(loads).toHaveLength(2);
    for (const load of loads) expect(load).toBeGreaterThan(8);
  });

  it('has a chart to draw: lanes, blocks and an explanation', () => {
    if (!outcome.ok) return;
    expect(outcome.schedule.lanes.length).toBeGreaterThan(3);
    expect(outcome.schedule.scheduled.length).toBeGreaterThan(20);
    expect(outcome.schedule.rationale.length).toBeGreaterThan(2);
  });
});

describe('the constraints mapping', () => {
  it('makes the first cook capable and the rest helpers', () => {
    const c = constraintsFrom(demoIntake());
    expect(c.cooks).toHaveLength(2);
    expect(c.cooks[0]!.eligibleFor.length).toBeGreaterThan(c.cooks[1]!.eligibleFor.length);
    expect(c.cooks[1]!.eligibleFor).not.toContain('stovetop');
  });

  it('turns "no drinks" into a style the plan builder already understands', () => {
    const intake = demoIntake();
    intake.wantsBeverages = { value: false, source: 'stated' };
    expect(constraintsFrom(intake).style).toContain('no-drinks');

    const result = compileSession(intake);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.dishes.some((d) => d.kind === 'beverage')).toBe(false);
  });

  it('gives the fridge a capacity, because cooling contends for it', () => {
    const c = constraintsFrom(demoIntake());
    expect(c.equipment.find((e) => e.kind === 'fridge-shelf')?.capacity).toBe(4);
  });
});

/**
 * The controls on the timeline change these four answers and recompile. What they are worth
 * showing for is that the answers genuinely change the session — a compiler that returned
 * the same six dishes whatever you asked it would be a very elaborate picture.
 */
describe('changing your mind', () => {
  const withAnswer = <K extends keyof ReturnType<typeof demoIntake>>(key: K, value: unknown) => {
    const intake = demoIntake();
    (intake as Record<string, unknown>)[key] = { value, source: 'stated' };
    const result = compileSession(intake);
    if (!result.ok) throw new Error(`${String(key)}=${String(value)} must compile: ${result.reason}`);
    return result;
  };

  it('fits the session to the time it is given', () => {
    const half = withAnswer('timeBudgetMin', 30);
    const hour = withAnswer('timeBudgetMin', 60);
    const long = withAnswer('timeBudgetMin', 90);

    expect(half.schedule.makespanMin).toBeLessThanOrEqual(30);
    expect(hour.schedule.makespanMin).toBeLessThanOrEqual(60);
    expect(long.schedule.makespanMin).toBeLessThanOrEqual(90);

    // Less time buys fewer dishes, and more time buys more. Neither is a rounding error.
    expect(half.plan.dishes.length).toBeLessThan(hour.plan.dishes.length);
    expect(long.plan.dishes.length).toBeGreaterThanOrEqual(hour.plan.dishes.length);
  });

  it('knows a second pair of hands is worth more than a second hour', () => {
    const alone = withAnswer('cookCount', 1);
    const pair = withAnswer('cookCount', 2);
    expect(alone.plan.dishes.length).toBeLessThan(pair.plan.dishes.length);
    expect(pair.schedule.metrics.minutesSavedByParallelism)
      .toBeGreaterThan(alone.schedule.metrics.minutesSavedByParallelism);
  });

  it('scales the portions with the servings, and still fits', () => {
    const two = withAnswer('servings', 2);
    const six = withAnswer('servings', 6);
    expect(six.schedule.metrics.portions).toBeGreaterThan(two.schedule.metrics.portions);
    expect(six.schedule.makespanMin).toBeLessThanOrEqual(60);
  });

  it('never cuts food it had already promised, at any of these settings', () => {
    for (const [key, value] of [
      ['timeBudgetMin', 30], ['timeBudgetMin', 45], ['timeBudgetMin', 90],
      ['cookCount', 1], ['cookCount', 3], ['servings', 2], ['servings', 6],
      ['wantsBeverages', false],
    ] as [keyof ReturnType<typeof demoIntake>, unknown][]) {
      const result = withAnswer(key, value);
      expect(result.schedule.degradations, `${String(key)}=${String(value)}`).toEqual([]);
      expect(
        result.schedule.warnings.filter((w) => w.severity === 'error'),
        `${String(key)}=${String(value)}`,
      ).toEqual([]);
      expect(result.plan.dishes.length, `${String(key)}=${String(value)}`).toBeGreaterThan(0);
    }
  });
});

describe('compiling something that cannot work', () => {
  it('says so rather than returning an empty session', () => {
    const result = compileSession(emptyIntake());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/fridge/i);
  });
});
