import { z } from 'zod';
import {
  RecipeIRSchema,
  SpokenIntakeSchema,
} from '@kitchen/domain';

/**
 * The wire shapes for the cooking pipeline.
 *
 * A separate module from `index.ts` deliberately: these are the only routes that carry a
 * recipe, and keeping them together makes it obvious what the pipeline costs to call and
 * what it promises to return. `index.ts` re-exports them, so callers see one package.
 *
 * Every provider key lives behind these two routes. That is the whole reason they exist —
 * the client could search and scrape and generate for itself, and doing so would mean
 * publishing three API keys in a JavaScript bundle.
 */

// ------------------------------------------------------------ transcription

export const TranscribeResponseSchema = z.object({
  text: z.string(),
  /** How the transcript was obtained, so the screen never implies a model it did not use. */
  source: z.literal('elevenlabs'),
});
export type TranscribeResponse = z.infer<typeof TranscribeResponseSchema>;

// -------------------------------------------------------------- the pipeline

export const CookRequestSchema = z.object({
  /** Answer to "what do you want to cook this week?" */
  wants: z.string().max(4_000).default(''),
  /** Answer to "what have you got, and how many of you are cooking?" */
  pantry: z.string().max(4_000).default(''),
  /** How many recipes to come back with. The session is sized from the crew, not this. */
  wantRecipes: z.number().int().min(1).max(8).default(5),
});
export type CookRequest = z.infer<typeof CookRequestSchema>;

/** Something that degraded or was dropped. Shown to the user, never swallowed. */
export const PipelineNoteSchema = z.object({
  stage: z.string(),
  message: z.string(),
});
export type PipelineNote = z.infer<typeof PipelineNoteSchema>;

export const CookResponseSchema = z.object({
  intake: SpokenIntakeSchema,
  recipes: z.array(RecipeIRSchema),
  queries: z.array(z.string()),
  /** Fixes the mapper had to make — a duration outside its verb's plausible range. */
  corrections: z.array(z.string()),
  notes: z.array(PipelineNoteSchema),
  /** Portions this session adds up to: seven days for the people cooking. */
  portionTarget: z.number().int().nonnegative(),
});
export type CookResponse = z.infer<typeof CookResponseSchema>;
