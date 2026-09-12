import { ReadRecipeSchema, type FetchedPage, type ReadRecipe } from '@kitchen/domain';
import type { StageSpec } from '../llm/gateway';

/**
 * L3 — a recipe page into steps the scheduler can hold, scaled to this session.
 *
 * The stage that earns the model its place. Structured markup on recipe sites is good for
 * ingredients and yield and almost useless for everything the scheduler needs: a
 * `recipeInstructions` array is prose, and prose does not say that the marinade has to sit
 * for twenty minutes before the pan is touched, or that the rice is twenty-five minutes of
 * saucepan and two minutes of hands. Reading that out of English is the work.
 *
 * Scaling happens here rather than after, because scaling is not multiplication. Doubling a
 * stir-fry does not double the frying time, it adds a second batch; doubling a tray bake
 * changes nothing but the tray. A model that knows what it is cooking makes that call, and
 * `checkDuration` catches it when it does not.
 */

export type ExtractInput = {
  page: FetchedPage;
  /** How many portions this session needs from this dish. */
  targetServings: number;
};

const SYSTEM = `You read one web page and return a recipe a scheduler can execute.

FIRST, decide whether this page IS a single recipe. Recipe round-ups ("25 best chicken
dinners"), category listings, product pages and articles are NOT recipes: set isRecipe false,
give one sentence in rejectedBecause, and stop. Do not assemble a recipe from a round-up.

If it is a recipe, read it into steps. A step is one thing a person does, with:
- durationMin: wall-clock minutes from starting the step until it is done. Simmering for
  twenty minutes is durationMin 20.
- activeMin: of those, the minutes needing hands AT THE START. Stirring the aromatics.
- finishMin: the minutes needing hands AT THE END. Draining, fluffing, plating.
  A twenty-minute simmer someone walks away from is duration 20, active 1, finish 1.
  Getting this right is the entire value of the output: the gap between duration and hands
  is the time another dish gets cooked in.
- taskClass and verb: what kind of work it is.
- equipment: what it occupies WHILE IT RUNS. A pan on a burner occupies both.
- dependsOn: indices of earlier steps that must finish first. Steps with no dependency can
  run in parallel with anything, so only add a dependency that is real.
- minDelayAfterMin: for resting, marinating, chilling, proving — time that must pass.

Rules:
- Write the step text yourself, one imperative sentence. Never copy the page's prose.
- Split a step that combines a long wait with hands-on work into what it really is.
- Set overnight true only when something genuinely runs for hours unattended.
- keepsDays is how long it lasts cooked and refrigerated. Be realistic: cooked fish is 2,
  a stew is 4, a grain is 4.
- allergens: only ones actually present.

SCALING. You are told how many portions this session needs. Adjust the recipe to that:
- Scale ingredient quantities.
- Set yieldServings to the target.
- Adjust durations only where the physics changes. More volume in one pan takes longer to
  come to temperature and to reduce. Frying in batches multiplies the frying. Baking,
  simmering and resting mostly do not change. Chopping twice as much takes twice as long.
- If the target is more than a domestic pan can do at once, say so in the step text
  ("in two batches") and let the duration reflect it.`;

export const l3Recipe: StageSpec<ExtractInput, ReadRecipe> = {
  stage: 'L3-normalize',
  schema: ReadRecipeSchema,
  system: SYSTEM,
  buildUser: ({ page, targetServings }) =>
    [
      `URL: ${page.url}`,
      `Site: ${page.siteName}`,
      `Title: ${page.title}`,
      `This session needs ${targetServings} portions of this dish.`,
      page.jsonLd ? `\nStructured data the page published:\n${page.jsonLd}` : '',
      '\nPage text:',
      page.text,
    ]
      .filter(Boolean)
      .join('\n'),
  /**
   * No model, no extraction. Returning `isRecipe: false` drops the page rather than
   * inventing steps for it — a schedule built on invented timings is worse than a shorter
   * list of real ones, because the user finds out in the kitchen.
   */
  fallback: (input, reason) =>
    ReadRecipeSchema.parse({
      isRecipe: false,
      rejectedBecause: `could not be read (${reason})`,
      title: input.page.title,
    }),
};
