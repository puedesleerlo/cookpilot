import type { Constraints, MealPlan, Schedule } from '@kitchen/domain';
import { buildIndex, buildPlan, loadSeedPacks } from '@kitchen/recipes';
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
