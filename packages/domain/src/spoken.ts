import { z } from 'zod';
import { AllergenSchema, MinuteSchema, UrgencySchema } from './primitives';

/**
 * What a model is allowed to hear.
 *
 * Two spoken answers become this and nothing else. It is deliberately narrow: the model is
 * transcribing intent into slots, not deciding anything. What it cannot place goes in
 * `notes` rather than being forced into a field, because a wrong ingredient is worse than
 * an unheard one — the plan gets built on food that is not in the fridge.
 *
 * This is the schema the model is *constrained* to, not a hint in a prompt. The output is
 * this shape or it is rejected and repaired.
 */

export const HeardIngredientSchema = z.object({
  /** Exactly as the person said it. Normalisation happens after, against the lexicon. */
  said: z.string().min(1),
  /**
   * Urgency only when they actually said something about it — "going off", "needs using".
   * Silence means unknown, and unknown is not urgent.
   */
  urgency: UrgencySchema.optional(),
});
export type HeardIngredient = z.infer<typeof HeardIngredientSchema>;

export const SpokenIntakeSchema = z.object({
  /**
   * What they want out of the session, in their words. Dishes, cuisines, "something with
   * the chicken", "no more stir fries". These become search queries, not recipes.
   */
  wants: z.array(z.string().min(1)).default([]),
  /** Everything they said was in the kitchen. */
  pantry: z.array(HeardIngredientSchema).default([]),
  /** How many people are cooking. One unless they said otherwise. */
  cookCount: z.number().int().min(1).max(8).default(1),
  /** Only when stated. The session has a default and does not need to ask. */
  timeBudgetMin: MinuteSchema.optional(),
  restrictions: z.array(AllergenSchema).default([]),
  /** Heard, understood to matter, and not a field. Shown to the user, never acted on. */
  notes: z.array(z.string().min(1)).default([]),
});
export type SpokenIntake = z.infer<typeof SpokenIntakeSchema>;

/**
 * A week of dinners for the people who are cooking.
 *
 * The session's size is derived rather than asked, because "how many servings of each
 * dish?" is a question nobody can answer before knowing how many dishes there will be.
 * "A week, for us" is a thing people actually know.
 */
export const DAYS_IN_A_WEEK = 7;

export const portionTarget = (cookCount: number): number =>
  DAYS_IN_A_WEEK * Math.max(1, cookCount);

/**
 * Servings per dish, given how many dishes there turned out to be.
 *
 * Floored at two, because one portion of anything is not meal prep, and capped at twelve,
 * because past that a domestic pan stops being able to do it in one go and the durations
 * the scheduler was given stop being true.
 */
export const servingsPerDish = (cookCount: number, dishCount: number): number =>
  Math.max(2, Math.min(12, Math.ceil(portionTarget(cookCount) / Math.max(1, dishCount))));

export const SearchQueriesSchema = z.object({
  /** Queries worth running, best first. Each one a thing a person would type. */
  queries: z.array(z.string().min(1)).min(1).max(8),
});
export type SearchQueries = z.infer<typeof SearchQueriesSchema>;
