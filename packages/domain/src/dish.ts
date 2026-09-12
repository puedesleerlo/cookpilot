import { z } from 'zod';
import { TaskSchema } from './task';
import { RecipeIngredientSchema } from './ingredient';
import { AllergenSchema, DishKindSchema, MinuteSchema } from './primitives';

export const DishSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: DishKindSchema,
  servings: z.number().int().positive(),
  tasks: z.array(TaskSchema),
  sourcePackId: z.string().optional(),
  sourceRecipeId: z.string().optional(),
  /** Visible attribution for imported recipes. We never display their prose. */
  attribution: z.object({ siteName: z.string(), url: z.string() }).optional(),
  ingredients: z.array(RecipeIngredientSchema).default([]),
  allergens: z.array(AllergenSchema).default([]),
  /** How long this keeps once portioned and chilled — drives the summary screen. */
  keepsDays: z.number().int().positive().default(4),
});
export type Dish = z.infer<typeof DishSchema>;

export const PlanScoreSchema = z.object({
  total: z.number(),
  /** Fraction of the pantry actually used, weighted by urgency. */
  pantryCoverage: z.number().min(0).max(1),
  /** Fraction of `use-today` ingredients that reach a dish. */
  urgencyCoverage: z.number().min(0).max(1),
  /** How well the dishes match the requested style and variety. */
  styleMatch: z.number().min(0).max(1),
  /** Estimated hands-on minutes, before scheduling. */
  estimatedActiveMin: MinuteSchema,
  estimatedTotalMin: MinuteSchema,
  /** Cross-dish reuse — shared bases, shared aromatics, one board for both. */
  overlapBonus: z.number(),
});
export type PlanScore = z.infer<typeof PlanScoreSchema>;

/**
 * One of the three options offered after intake. A plan is a set of dishes, not a
 * schedule — it has not met the burners yet.
 */
export const MealPlanSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** One line the user actually reads. "Leans on the chicken, leaves the salmon for tomorrow." */
  tagline: z.string(),
  dishes: z.array(DishSchema).min(1),
  score: PlanScoreSchema,
  coverage: z.object({
    usedIngredientIds: z.array(z.string()),
    unusedIngredientIds: z.array(z.string()),
    unusedUrgentIngredientIds: z.array(z.string()),
    assumedPantryIds: z.array(z.string()).default([]),
  }),
  totalServings: z.number().int().nonnegative(),
});
export type MealPlan = z.infer<typeof MealPlanSchema>;
