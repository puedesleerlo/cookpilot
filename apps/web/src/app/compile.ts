import {
  IngredientSchema,
  defaultUrgency,
  ingredientId,
  portionTarget,
  resolveIngredient,
  type Constraints,
  type Ingredient,
  type MealPlan,
  type Schedule,
} from '@kitchen/domain';
import type { CookResponse } from '@kitchen/contracts';
import { buildIndex, buildPlan, loadSeedPacks, planFromRecipes } from '@kitchen/recipes';
import { compileSchedule } from '@kitchen/scheduler';
import { constraintsFrom } from './constraints';
import type { IntakeAnswers } from './store';

/**
 * Compiling, in the browser.
 *
 * There is no network call here and that is on purpose. The recipe registry is bundled,
 * the plan builder and the scheduler are pure, and so the demo works on a plane, on a
 * conference wifi, and on the first load before anything has warmed up. The API exists for
 * the things that genuinely need a server — ingestion, search, sessions shared between
 * phones — not for arithmetic the device can do in four milliseconds.
 */

export type CompileOutcome =
  | { ok: true; plan: MealPlan; schedule: Schedule; constraints: Constraints }
  | { ok: false; reason: string; plan?: MealPlan };

/** Built once: parsing five packs on every compile would be the slowest thing here. */
let cached: ReturnType<typeof buildIndex> | null = null;
const index = (): ReturnType<typeof buildIndex> => {
  cached ??= buildIndex(loadSeedPacks().packs);
  return cached;
};

export const compileSession = (intake: IntakeAnswers): CompileOutcome => {
  if (intake.pantry.length === 0) {
    return { ok: false, reason: 'There is nothing in the fridge yet.' };
  }

  /*
   * Nothing below this line may throw into the render.
   *
   * The compiler is pure and well tested, and it is still the only piece of this app that
   * runs unbounded logic over user input — so the one outcome it must never have is a blank
   * screen. Anything unexpected becomes a sentence someone can act on.
   */
  try {
    const constraints = constraintsFrom(intake);
    const plan = buildPlan({ index: index(), pantry: intake.pantry, constraints });

    if (!plan) {
      return {
        ok: false,
        reason:
          'Nothing in the registry can be made from this fridge and this kitchen. A couple more ingredients — or turning something back on in the kitchen — is usually enough.',
      };
    }

    const result = compileSchedule({ plan, constraints });
    if (!result.ok) return { ok: false, reason: result.reason, plan };

    return { ok: true, plan, schedule: result.schedule, constraints };
  } catch (error) {
    return {
      ok: false,
      reason: `The compiler could not finish with this fridge: ${
        error instanceof Error ? error.message : 'an unexpected problem'
      }`,
    };
  }
};

// --------------------------------------------------------------- the pipeline

/**
 * What the pipeline heard, as the answers the rest of the app already understands.
 *
 * The spoken intake and the typed form converge here deliberately: past this point nothing
 * knows or cares which one the user used, so there is exactly one code path from a fridge
 * to a schedule rather than two that can drift apart.
 */
export const intakeFromSpoken = (found: CookResponse, current: IntakeAnswers): IntakeAnswers => {
  const pantry: Ingredient[] = [];
  const seen = new Set<string>();

  for (const heard of found.intake.pantry) {
    const resolved = resolveIngredient(heard.said);
    if (seen.has(resolved.canonicalName)) continue;
    seen.add(resolved.canonicalName);
    pantry.push(
      IngredientSchema.parse({
        id: ingredientId(resolved.canonicalName),
        name: resolved.unrecognised ? heard.said : resolved.canonicalName,
        canonicalName: resolved.canonicalName,
        // What they said about it beats the shelf life; "on its last legs" is information
        // the lexicon does not have.
        urgency: heard.urgency ?? defaultUrgency(resolved.keepsDays),
        category: resolved.category,
        allergens: resolved.allergens,
        unrecognised: resolved.unrecognised,
      }),
    );
  }

  const stated = <T>(value: T) => ({ value, source: 'stated' as const });
  return {
    ...current,
    pantry,
    cookCount: stated(found.intake.cookCount),
    ...(found.intake.timeBudgetMin !== undefined
      ? { timeBudgetMin: stated(found.intake.timeBudgetMin) }
      : {}),
    ...(found.intake.restrictions.length > 0
      ? { restrictions: stated(found.intake.restrictions) }
      : {}),
  };
};

/**
 * Schedule what the pipeline found.
 *
 * Nothing is selected here. Every recipe in `found` is one the user has seen and left in,
 * so the plan is all of them and the scheduler's degradation ladder is what reports a
 * session that will not fit — which is the honest order of events: show the work, then say
 * what had to give, rather than quietly dropping a dish somebody watched arrive.
 */
export const compileFound = (found: CookResponse, intake: IntakeAnswers): CompileOutcome => {
  try {
    const constraints = constraintsFrom(intake);
    const plan = planFromRecipes(found.recipes, intake.pantry, constraints, 'This week');
    if (!plan) {
      return { ok: false, reason: 'There are no recipes left to schedule.' };
    }

    const result = compileSchedule({ plan, constraints });
    if (!result.ok) return { ok: false, reason: result.reason, plan };
    return { ok: true, plan, schedule: result.schedule, constraints };
  } catch (error) {
    return {
      ok: false,
      reason: `These recipes could not be scheduled: ${
        error instanceof Error ? error.message : 'an unexpected problem'
      }`,
    };
  }
};

/** Seven days of meals for the people cooking — what the session is aiming at. */
export const sessionPortionTarget = (intake: IntakeAnswers): number =>
  portionTarget(intake.cookCount.value);
