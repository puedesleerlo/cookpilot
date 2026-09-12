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

// ---------------------------------------------------------------- progress

/**
 * What the pipeline is doing, as it does it.
 *
 * The chain takes the better part of a minute — it reads four strangers' web pages and
 * calls a model on each — and a spinner for that long reads as broken. These events are
 * written to be shown to somebody waiting in a kitchen, so every string in them is a
 * sentence rather than a stage name: the server does the translating, because the server
 * is the only thing that knows the difference between "that page is a list of recipes"
 * and "that site would not let us read it".
 */
export const CookProgressSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('heard'),
    wants: z.array(z.string()),
    pantry: z.array(z.object({ name: z.string(), urgent: z.boolean() })),
    cookCount: z.number().int(),
    portionTarget: z.number().int(),
  }),
  z.object({
    kind: z.literal('searching'),
    query: z.string(),
    index: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
  z.object({ kind: z.literal('reading'), site: z.string() }),
  z.object({
    kind: z.literal('found'),
    title: z.string(),
    site: z.string(),
    servings: z.number().int(),
    steps: z.number().int(),
  }),
  /** `reason` is a sentence for a person, not a stage name and not an error code. */
  z.object({ kind: z.literal('skipped'), site: z.string(), reason: z.string() }),
  z.object({ kind: z.literal('finished'), recipes: z.number().int() }),
  z.object({ kind: z.literal('failed'), reason: z.string() }),
]);
export type CookProgress = z.infer<typeof CookProgressSchema>;

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
