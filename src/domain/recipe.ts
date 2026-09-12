import { z } from 'zod';
import { EquipmentRequirementSchema } from './crew';
import { RecipeIngredientSchema } from './ingredient';
import {
  AllergenSchema,
  CookingVerbSchema,
  DishKindSchema,
  EffortSchema,
  MinuteSchema,
  SkillLevelSchema,
  TaskClassSchema,
} from './primitives';

/**
 * A recipe step, structured enough to schedule.
 *
 * The phase budget is the whole point:
 *
 *   durationMin   |--------------------------- 25 ---------------------------|
 *   activeMin     |- 1 -|
 *   finishMin                                                        |- 1 -|
 *   passive             |------------------- 23 ---------------------|
 *
 * §7's expansion reads straight off this — START takes `activeMin`, HOLD takes the
 * passive remainder and needs no cook, FINISH takes `finishMin`.
 */
export const RecipeStepSchema = z
  .object({
    id: z.string().min(1),
    verb: CookingVerbSchema,
    /** Our own wording. Never the source recipe's prose. */
    text: z.string().min(1),
    durationMin: MinuteSchema,
    /** Hands-on minutes at the start of the step. */
    activeMin: MinuteSchema,
    /** Hands-on minutes at the end of the step. "Fluff the rice and set aside." */
    finishMin: MinuteSchema.default(0),
    equipment: z.array(EquipmentRequirementSchema).default([]),
    /** Canonical ingredient names this step touches. */
    ingredientRefs: z.array(z.string()).default([]),
    taskClass: TaskClassSchema,
    minSkill: SkillLevelSchema.default('beginner'),
    effort: EffortSchema.default(2),
    optional: z.boolean().default(false),
    /** Ids of steps in the same recipe that must finish first. */
    dependsOn: z.array(z.string()).default([]),
    /** Quality: do not start until this long after the predecessor finishes. */
    minDelayAfterMin: MinuteSchema.optional(),
    /** Safety and quality: must start within this long of the predecessor finishing. */
    maxDelayAfterMin: MinuteSchema.optional(),
    heat: z
      .union([
        z.object({ level: z.enum(['low', 'medium', 'high']) }),
        z.object({ celsius: z.number().int() }),
      ])
      .optional(),
    note: z.string().optional(),
  })
  .refine((s) => s.activeMin + s.finishMin <= s.durationMin, {
    error: 'activeMin + finishMin must not exceed durationMin',
    path: ['activeMin'],
  })
  .refine(
    (s) =>
      s.minDelayAfterMin === undefined ||
      s.maxDelayAfterMin === undefined ||
      s.minDelayAfterMin <= s.maxDelayAfterMin,
    { error: 'minDelayAfterMin must not exceed maxDelayAfterMin', path: ['maxDelayAfterMin'] },
  );
export type RecipeStep = z.infer<typeof RecipeStepSchema>;

/** Hands-free minutes in the middle of a step. */
export const passiveMinOf = (step: RecipeStep): number =>
  step.durationMin - step.activeMin - step.finishMin;

/**
 * Where a recipe came from. We keep the pointer and the attribution; we never keep the
 * prose. This is both the legally clean path and the engineering-correct one — prose
 * does not schedule.
 */
export const RecipeSourceSchema = z.object({
  url: z.string(),
  siteName: z.string(),
  retrievedAt: z.string(),
});
export type RecipeSource = z.infer<typeof RecipeSourceSchema>;

export const RecipeIRSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: DishKindSchema,
  yieldServings: z.number().int().positive(),
  ingredients: z.array(RecipeIngredientSchema).min(1),
  steps: z.array(RecipeStepSchema).min(1),
  tags: z.array(z.string()).default([]),
  allergens: z.array(AllergenSchema).default([]),
  dietary: z.array(z.string()).default([]),
  keepsDays: z.number().int().positive().default(4),
  /**
   * True for things that start in the session and finish hours later — a twelve-hour
   * cold brew. The scheduler treats the long passive tail as running past the session.
   */
  overnight: z.boolean().default(false),
  source: RecipeSourceSchema.optional(),
});
export type RecipeIR = z.infer<typeof RecipeIRSchema>;

export const PackProvenanceSchema = z.enum(['seed', 'imported', 'generated']);
export type PackProvenance = z.infer<typeof PackProvenanceSchema>;

export const RecipePackSchema = z.object({
  packId: z.string().min(1),
  version: z.string().min(1),
  /** FNV-1a over a canonical serialisation of `recipes`. Identity, never trust. */
  contentHash: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  locale: z.string().default('en-US'),
  provenance: PackProvenanceSchema,
  recipes: z.array(RecipeIRSchema),
});
export type RecipePack = z.infer<typeof RecipePackSchema>;

/** Total and hands-on minutes, derived rather than stored so they cannot go stale. */
export const recipeTotals = (r: RecipeIR): { totalMin: number; activeMin: number } => ({
  totalMin: r.steps.reduce((n, s) => n + s.durationMin, 0),
  activeMin: r.steps.reduce((n, s) => n + s.activeMin + s.finishMin, 0),
});
