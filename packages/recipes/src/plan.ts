import {
  DishSchema,
  MealPlanSchema,
  URGENCY_WEIGHT,
  makeId,
  meetsSkill,
  type Constraints,
  type Dish,
  type DishKind,
  type Ingredient,
  type MealPlan,
  type RecipeIR,
} from '@kitchen/domain';
import { compileSchedule } from '@kitchen/scheduler';
import { isStaple } from './staples';
import type { RecipeIndex } from './registry';

/**
 * Plan generation.
 *
 * Deterministic scoring, not a model: the delta makes ranking a deterministic-first stage,
 * and there is nothing here a model would do better. Coverage, urgency and feasibility are
 * arithmetic.
 *
 * The part worth explaining is how a plan is decided to fit. A plan is assembled greedily,
 * best-scoring first, and each candidate is **compiled** before it is kept: the provisional
 * plan goes through the real task-graph compiler and the real scheduler, and the dish stays
 * only if the session still lands inside the budget with nothing degraded.
 *
 * Adding up hands-on minutes was the obvious cheaper alternative and it was wrong in both
 * directions at once. It cannot see the parallelism two cooks and a phase split buy — so it
 * refused a drink the kitchen had twenty idle minutes for — and it cannot see the
 * dependencies that serialise work either, so a plan that added up fine still needed a dish
 * cut at the last moment. A sum of minutes is not a schedule. The arithmetic survives only
 * as a coarse pre-filter, to keep the search from compiling obviously impossible plans.
 */

export type PlanCandidate = {
  recipe: RecipeIR;
  score: number;
  coverage: number;
  matched: string[];
  missing: string[];
  /** Hands-on minutes nobody but a skilled cook can take. */
  skilledMin: number;
  /** Hands-on minutes anyone can take. */
  unskilledMin: number;
};

/** Roughly what the finishing tasks cost per dish, for the pre-filter's rough arithmetic. */
const FINISHING_OVERHEAD_MIN = (kind: DishKind): number => (kind === 'sauce' || kind === 'beverage' ? 5 : 7);

const canAnyoneDo = (constraints: Constraints, taskClass: string, minSkill: string): boolean =>
  constraints.cooks.some(
    (c) =>
      c.eligibleFor.includes(taskClass as never) &&
      meetsSkill(c.skill, minSkill as never),
  );

/**
 * Split a recipe's hands-on minutes into what needs a skilled cook and what does not.
 * "Skilled" here means "not every cook in this kitchen can take it".
 */
export const handsOnSplit = (
  recipe: RecipeIR,
  constraints: Constraints,
): { skilledMin: number; unskilledMin: number } => {
  const leastCapable = [...constraints.cooks].sort((a, b) =>
    a.eligibleFor.length - b.eligibleFor.length,
  )[0];

  let skilled = 0;
  let unskilled = 0;
  for (const step of recipe.steps) {
    const hands = step.activeMin + step.finishMin;
    const helperCanTake =
      leastCapable !== undefined &&
      leastCapable.eligibleFor.includes(step.taskClass) &&
      meetsSkill(leastCapable.skill, step.minSkill);
    if (helperCanTake) unskilled += hands;
    else skilled += hands;
  }
  return { skilledMin: skilled, unskilledMin: unskilled };
};

export const scoreCandidate = (
  recipe: RecipeIR,
  pantry: Ingredient[],
  constraints: Constraints,
): PlanCandidate | null => {
  // A recipe needing equipment this kitchen does not have is not a candidate at all.
  const kinds = new Set(constraints.equipment.filter((e) => e.count > 0).map((e) => e.kind));
  for (const step of recipe.steps) {
    for (const need of step.equipment) {
      if (!kinds.has(need.kind)) return null;
    }
    if (!canAnyoneDo(constraints, step.taskClass, step.minSkill)) return null;
  }

  // Nor is one that breaks a restriction.
  if (recipe.allergens.some((a) => constraints.restrictions.includes(a))) return null;

  const have = new Map(pantry.map((i) => [i.canonicalName, i]));
  const core = recipe.ingredients.filter((i) => !i.optional && !isStaple(i.canonicalName) && i.role !== 'pantry');

  const matched: string[] = [];
  const missing: string[] = [];
  let urgencyScore = 0;

  for (const ing of core) {
    const held = have.get(ing.canonicalName);
    if (held) {
      matched.push(ing.canonicalName);
      urgencyScore += URGENCY_WEIGHT[held.urgency];
    } else {
      missing.push(ing.canonicalName);
    }
  }

  const coverage = core.length === 0 ? 1 : matched.length / core.length;
  // A recipe we cannot mostly make is not worth scoring.
  if (coverage < 0.8) return null;

  const style = constraints.style.length === 0
    ? 0.5
    : recipe.tags.some((t) => constraints.style.includes(t))
      ? 1
      : 0.25;

  const { skilledMin, unskilledMin } = handsOnSplit(recipe, constraints);

  // Coverage is the floor; urgency is what tips one candidate over another; style nudges.
  // Time is a mild penalty here and a hard check when the plan is assembled.
  const score =
    coverage * 10 + urgencyScore * 2 + style * 2 - (skilledMin + unskilledMin) / 30;

  return { recipe, score, coverage, matched, missing, skilledMin, unskilledMin };
};

/**
 * The slots a session is filled in, in order.
 *
 * Deliberately interleaved rather than grouped by kind. Taking both mains before looking at
 * drinks meant the budget was gone by the time it got there, and the plan came out as two
 * mains and a dressing — technically the highest-scoring recipes, and not a session anyone
 * would call finished. A second main is a nice-to-have; a drink and a sauce are part of the
 * shape, so they get a look first.
 */
const SLOT_ORDER: DishKind[] = ['base', 'main', 'sauce', 'beverage', 'side', 'beverage', 'main'];

export type BuildPlanOptions = {
  index: RecipeIndex;
  pantry: Ingredient[];
  constraints: Constraints;
  /**
   * How far past the kitchen's raw hands-on capacity a candidate may look on paper before it
   * is not even worth compiling. Deliberately generous — this is a bound on the search, not
   * a judgement about fit; the scheduler makes that.
   */
  slackFactor?: number;
  name?: string;
};

/** One candidate, as the dish the compiler will actually be handed. */
const toDish = (c: PlanCandidate, servings: number): Dish =>
  DishSchema.parse({
    id: c.recipe.id,
    name: c.recipe.title,
    kind: c.recipe.kind,
    servings,
    steps: c.recipe.steps,
    ingredients: c.recipe.ingredients,
    allergens: c.recipe.allergens,
    overnight: c.recipe.overnight,
    keepsDays: c.recipe.keepsDays,
    ...(c.recipe.source
      ? { attribution: { siteName: c.recipe.source.siteName, url: c.recipe.source.url } }
      : {}),
  });

/**
 * Assemble a set of candidates into a plan.
 *
 * Used for the provisional plans tried during assembly as well as the one returned, so what
 * is compiled during the search is exactly what comes out of it.
 */
const assemble = (
  chosen: PlanCandidate[],
  pantry: Ingredient[],
  constraints: Constraints,
  name?: string,
): MealPlan => {
  const dishes = chosen.map((c) => toDish(c, constraints.servings));

  const used = new Set(chosen.flatMap((c) => c.matched));
  const unused = pantry.filter((i) => !used.has(i.canonicalName));
  const urgentTotal = pantry.filter((i) => i.urgency === 'use-today');
  const urgentUsed = urgentTotal.filter((i) => used.has(i.canonicalName));
  const handsOn = chosen.reduce(
    (n, c) => n + c.skilledMin + c.unskilledMin + FINISHING_OVERHEAD_MIN(c.recipe.kind),
    0,
  );

  return MealPlanSchema.parse({
    id: makeId('plan', name ?? 'session', String(dishes.length)),
    name: name ?? 'Sunday session',
    tagline: describe(dishes, urgentUsed.length, urgentTotal.length),
    dishes,
    score: {
      total: chosen.reduce((n, c) => n + c.score, 0),
      pantryCoverage: pantry.length === 0 ? 0 : used.size / pantry.length,
      urgencyCoverage: urgentTotal.length === 0 ? 1 : urgentUsed.length / urgentTotal.length,
      styleMatch:
        chosen.length === 0
          ? 0
          : chosen.filter((c) => c.recipe.tags.some((t) => constraints.style.includes(t))).length /
            chosen.length,
      estimatedActiveMin: Math.round(handsOn),
      estimatedTotalMin: chosen.reduce(
        (n, c) => n + c.recipe.steps.reduce((m, s) => m + s.durationMin, 0),
        0,
      ),
      overlapBonus: 0,
    },
    coverage: {
      usedIngredientIds: [...used],
      unusedIngredientIds: unused.map((i) => i.canonicalName),
      usedUrgentIngredientIds: urgentUsed.map((i) => i.canonicalName),
      unusedUrgentIngredientIds: unused
        .filter((i) => i.urgency === 'use-today')
        .map((i) => i.canonicalName),
      assumedPantryIds: [],
    },
    totalServings: dishes.length * constraints.servings,
  });
};

/**
 * Does this set of dishes actually compile into a session that fits?
 *
 * The scheduler is the authority. "Fits" means all of: the graph compiled, the schedule is
 * feasible, it lands inside the time budget, the degradation ladder never had to run, and no
 * task was left unplaced. Anything less and the dish that was just added is what caused it.
 */
const compiles = (chosen: PlanCandidate[], pantry: Ingredient[], constraints: Constraints): boolean => {
  const result = compileSchedule({ plan: assemble(chosen, pantry, constraints), constraints });
  if (!result.ok) return false;
  const s = result.schedule;
  return (
    s.feasible &&
    s.makespanMin <= constraints.timeBudgetMin &&
    s.degradations.length === 0 &&
    !s.warnings.some((w) => w.severity === 'error')
  );
};

/**
 * Build a plan, or say that there is not one.
 *
 * Null rather than an empty plan, because a `MealPlan` with no dishes is not a thing the
 * rest of the system can hold: the schema requires at least one, so returning "nothing"
 * used to mean throwing a validation error out of a pure function, three layers below
 * anyone who could do something about it. One ingredient and an ordinary kitchen was enough
 * to trigger it, and what the user got was a blank screen.
 */
export const buildPlan = (options: BuildPlanOptions): MealPlan | null => {
  const { index, pantry, constraints, slackFactor = 1.4 } = options;

  const scored = index.all
    .map((r) => scoreCandidate(r, pantry, constraints))
    .filter((c): c is PlanCandidate => c !== null)
    .sort((a, b) => b.score - a.score || (a.recipe.id < b.recipe.id ? -1 : 1));

  const skilledCooks = constraints.cooks.filter(
    (c) => c.skill !== 'beginner' || c.eligibleFor.includes('stovetop'),
  ).length || 1;
  const allCooks = constraints.cooks.length || 1;

  // Two loose ceilings, because two things can bind: the skilled cook's hands, and everyone's.
  const skilledCeiling = constraints.timeBudgetMin * skilledCooks * slackFactor;
  const totalCeiling = constraints.timeBudgetMin * allCooks * slackFactor;

  const chosen: PlanCandidate[] = [];
  let skilledUsed = 0;
  let totalUsed = 0;

  /** Cheap arithmetic, only to keep hopeless candidates out of the compiler. */
  const plausible = (c: PlanCandidate): boolean =>
    skilledUsed + c.skilledMin <= skilledCeiling &&
    totalUsed + c.skilledMin + c.unskilledMin + FINISHING_OVERHEAD_MIN(c.recipe.kind) <= totalCeiling;

  const take = (c: PlanCandidate): void => {
    chosen.push(c);
    skilledUsed += c.skilledMin;
    totalUsed += c.skilledMin + c.unskilledMin + FINISHING_OVERHEAD_MIN(c.recipe.kind);
  };

  const wantsDrinks = !constraints.style.includes('no-drinks');

  for (const kind of SLOT_ORDER) {
    if (kind === 'beverage' && !wantsDrinks) continue;

    const pool = scored.filter((c) => c.recipe.kind === kind && !chosen.includes(c));

    // For the first drink prefer an overnight one: it is almost entirely waiting, so it
    // costs the session nearly nothing and is ready the next morning.
    const ordered =
      kind === 'beverage' && !chosen.some((c) => c.recipe.overnight)
        ? [...pool].sort((a, b) => Number(b.recipe.overnight) - Number(a.recipe.overnight) || b.score - a.score)
        : pool;

    const pick = ordered.find((c) => plausible(c) && compiles([...chosen, c], pantry, constraints));
    if (pick) take(pick);
  }

  // A plan with nothing in it helps nobody; take the best thing there is.
  if (chosen.length === 0 && scored.length > 0) take(scored[0]!);
  if (chosen.length === 0) return null;

  return assemble(chosen, pantry, constraints, options.name);
};

const describe = (dishes: Dish[], urgentUsed: number, urgentTotal: number): string => {
  const mains = dishes.filter((d) => d.kind === 'main' || d.kind === 'side' || d.kind === 'base').length;
  const drinks = dishes.filter((d) => d.kind === 'beverage').length;
  const parts = [
    `${mains} dish${mains === 1 ? '' : 'es'}`,
    dishes.some((d) => d.kind === 'sauce') ? 'a sauce' : null,
    drinks > 0 ? `${drinks} drink${drinks === 1 ? '' : 's'}` : null,
  ].filter(Boolean);
  const urgency =
    urgentTotal === 0
      ? ''
      : urgentUsed === urgentTotal
        ? ' Uses everything that had to go today.'
        : ` Uses ${urgentUsed} of the ${urgentTotal} things that had to go today.`;
  return `${parts.join(', ')}.${urgency}`;
};
