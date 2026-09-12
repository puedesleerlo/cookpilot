import { z } from 'zod';
import {
  AllergenSchema,
  CookingVerbSchema,
  DishKindSchema,
  EquipmentKindSchema,
  MinuteSchema,
  SkillLevelSchema,
  TaskClassSchema,
  UnitSchema,
} from './primitives';
import { IngredientRoleSchema } from './ingredient';

/**
 * What a model is allowed to read out of a recipe page.
 *
 * Deliberately flatter than `RecipeIR`. The model's job is to read prose into facts —
 * this step takes eight minutes, it needs a frying pan, it cannot start until the marinade
 * has — and not to know that an equipment requirement has a `heldThroughHold` flag or that
 * step ids are slugs. Everything structural is added afterwards by code that cannot get it
 * wrong, in `toRecipeIR`.
 *
 * `isRecipe` is the first field for a reason: most of what a search returns is a listing, a
 * category page or an article about a recipe. A model told to extract a recipe from one of
 * those will extract a recipe from one of those. Asking first, and accepting no, is how the
 * chain avoids scheduling invented steps.
 */

export const ReadStepSchema = z.object({
  /** Our wording of what to do, in one imperative sentence. Never the page's prose. */
  text: z.string().min(1),
  verb: CookingVerbSchema,
  /** Wall-clock minutes from starting this step to it being finished. */
  durationMin: MinuteSchema,
  /** Of those minutes, the ones needing hands at the start. */
  activeMin: MinuteSchema,
  /** And the ones needing hands at the end — "drain it and fluff it through". */
  finishMin: MinuteSchema.default(0),
  equipment: z.array(EquipmentKindSchema).default([]),
  /** Ingredients this step touches, as the recipe names them. */
  ingredientRefs: z.array(z.string()).default([]),
  taskClass: TaskClassSchema,
  minSkill: SkillLevelSchema.default('beginner'),
  /**
   * How heavy the work is, 1 to 3. Accepted wider than the domain allows and clamped in
   * the mapper: a model that answers 4 has still read the page correctly, and throwing the
   * whole recipe away over one number is a bad trade.
   */
  effort: z.number().int().min(1).max(5).default(2),
  optional: z.boolean().default(false),
  /** Indices of earlier steps that must finish first. Empty means it can start whenever. */
  dependsOn: z.array(z.number().int().nonnegative()).default([]),
  /** Quality: this long must pass after the predecessor — resting, marinating, proving. */
  minDelayAfterMin: MinuteSchema.optional(),
  note: z.string().optional(),
});
export type ReadStep = z.infer<typeof ReadStepSchema>;

export const ReadIngredientSchema = z.object({
  /** As the recipe names it. Resolved against the lexicon afterwards. */
  name: z.string().min(1),
  quantity: z.number().positive().optional(),
  unit: UnitSchema.optional(),
  role: IngredientRoleSchema.default('core'),
  optional: z.boolean().default(false),
});
export type ReadIngredient = z.infer<typeof ReadIngredientSchema>;

export const ReadRecipeSchema = z.object({
  /** False for a listing, a category page, or an article that merely mentions cooking. */
  isRecipe: z.boolean(),
  /** Why, when `isRecipe` is false. One sentence, so a dropped page can be explained. */
  rejectedBecause: z.string().optional(),
  title: z.string().default(''),
  kind: DishKindSchema.default('main'),
  /** How many the recipe as written feeds, before any scaling. */
  yieldServings: z.number().int().positive().default(4),
  ingredients: z.array(ReadIngredientSchema).default([]),
  steps: z.array(ReadStepSchema).default([]),
  tags: z.array(z.string()).default([]),
  allergens: z.array(AllergenSchema).default([]),
  /** How many days it keeps once cooked and chilled. Meal prep lives or dies on this. */
  keepsDays: z.number().int().positive().default(4),
  /** True when it starts now and finishes hours later — cold brew, an overnight prove. */
  overnight: z.boolean().default(false),
});
export type ReadRecipe = z.infer<typeof ReadRecipeSchema>;

/**
 * A page handed to the extractor.
 *
 * `jsonLd` is an accelerator, not the source of truth: when a page carries usable markup it
 * is passed alongside the text so the model has the ingredient list and the yield without
 * having to infer them. Most pages carry markup for ingredients and none at all for the
 * timing of a step, which is the part the scheduler actually needs.
 */
export const FetchedPageSchema = z.object({
  url: z.string().url(),
  siteName: z.string().default(''),
  title: z.string().default(''),
  /** The readable text of the page, already stripped of navigation and script. */
  text: z.string().min(1),
  jsonLd: z.string().optional(),
});
export type FetchedPage = z.infer<typeof FetchedPageSchema>;
