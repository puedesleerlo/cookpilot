import { z } from 'zod';
import {
  AllergenSchema,
  IngredientCategorySchema,
  PrepStateSchema,
  UnitSchema,
  UrgencySchema,
} from './primitives';

/**
 * Something in the fridge. `name` is what the user said; `canonicalName` is what the
 * lexicon matched it to. Both are kept: unknown terms are flagged, never dropped, so a
 * user who says "yu choy" does not silently lose it to the nearest known green.
 */
export const IngredientSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  canonicalName: z.string().min(1),
  quantity: z.number().positive().optional(),
  unit: UnitSchema.optional(),
  urgency: UrgencySchema.default('not-urgent'),
  prepState: PrepStateSchema.default('unwashed'),
  category: IngredientCategorySchema,
  allergens: z.array(AllergenSchema).default([]),
  /** True when the pipeline assumed it (salt, oil, common aromatics) rather than hearing it. */
  assumedPantry: z.boolean().default(false),
  /** True when no lexicon entry matched. Kept and surfaced, never discarded. */
  unrecognised: z.boolean().default(false),
});
export type Ingredient = z.infer<typeof IngredientSchema>;

/** What a recipe asks for, as opposed to what the fridge holds. */
export const IngredientRoleSchema = z.enum(['core', 'aromatic', 'pantry', 'garnish']);
export type IngredientRole = z.infer<typeof IngredientRoleSchema>;

export const RecipeIngredientSchema = z.object({
  canonicalName: z.string().min(1),
  quantity: z.number().positive().optional(),
  unit: UnitSchema.optional(),
  role: IngredientRoleSchema.default('core'),
  category: IngredientCategorySchema,
  optional: z.boolean().default(false),
  /** Acceptable stand-ins, in preference order, as canonical names. */
  substitutes: z.array(z.string()).default([]),
});
export type RecipeIngredient = z.infer<typeof RecipeIngredientSchema>;
