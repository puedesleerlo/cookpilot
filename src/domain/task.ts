import { z } from 'zod';
import { EquipmentRequirementSchema } from './crew';
import {
  AllergenSchema,
  ContaminationStateSchema,
  EffortSchema,
  MinuteSchema,
  SkillLevelSchema,
  TaskClassSchema,
} from './primitives';

/**
 * An edge in the task graph.
 *
 * `minDelayMin` is quality: rest the salmon at least three minutes.
 * `maxDelayMin` is the interesting one — it is what makes food safety schedulable.
 * "Cooked food reaches refrigeration within 120 minutes" and "serve within 10 minutes of
 * plating" are the same constraint shape, and both are unexpressible without it.
 */
export const DependencySchema = z
  .object({
    fromTaskId: z.string().min(1),
    type: z.enum(['finish-to-start', 'start-to-start']).default('finish-to-start'),
    minDelayMin: MinuteSchema.optional(),
    maxDelayMin: MinuteSchema.optional(),
    /** Shown in the timeline's dependency popover. */
    reason: z.string().optional(),
  })
  .refine(
    (d) => d.minDelayMin === undefined || d.maxDelayMin === undefined || d.minDelayMin <= d.maxDelayMin,
    { error: 'minDelayMin must not exceed maxDelayMin', path: ['maxDelayMin'] },
  );
export type Dependency = z.infer<typeof DependencySchema>;

export const SafetyConstraintSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('raw-protein'),
    /** What the surface is left in after this task. */
    leaves: ContaminationStateSchema,
    note: z.string(),
  }),
  z.object({ kind: z.literal('hot-surface'), note: z.string() }),
  z.object({ kind: z.literal('sharp'), note: z.string() }),
  z.object({ kind: z.literal('allergen'), allergen: AllergenSchema, note: z.string() }),
  z.object({
    kind: z.literal('ready-to-eat'),
    note: z.string(),
  }),
  z.object({
    kind: z.literal('max-hold'),
    withinMin: MinuteSchema,
    note: z.string(),
  }),
]);
export type SafetyConstraint = z.infer<typeof SafetyConstraintSchema>;

export const TaskPhaseSchema = z.enum(['start', 'hold', 'finish']);
export type TaskPhase = z.infer<typeof TaskPhaseSchema>;

/**
 * The atom of the schedule.
 *
 * The phase split is the single idea the whole product rests on. `start` and `finish`
 * occupy a cook; `hold` occupies only the equipment. Rice is a saucepan for twenty-five
 * minutes and a cook for two, and a scheduler that cannot say that cannot find any
 * parallelism worth showing.
 */
export const TaskSchema = z
  .object({
    id: z.string().min(1),
    dishId: z.string().min(1),
    name: z.string().min(1),
    class: TaskClassSchema,
    phase: TaskPhaseSchema,
    durationMin: MinuteSchema,
    requiresCook: z.boolean(),
    equipment: z.array(EquipmentRequirementSchema).default([]),
    ingredients: z.array(z.string()).default([]),
    deps: z.array(DependencySchema).default([]),
    safety: z.array(SafetyConstraintSchema).default([]),
    effort: EffortSchema,
    minSkill: SkillLevelSchema,
    /** Garnishes and flourishes — the first rung of the degradation ladder. */
    optional: z.boolean().default(false),
    /** Set for tasks the scheduler inserted itself (washes, chills, labels). */
    synthetic: z.boolean().default(false),
  })
  .refine((t) => (t.phase === 'hold' ? t.requiresCook === false : t.requiresCook === true), {
    error: "phase 'hold' must not require a cook; 'start' and 'finish' must",
    path: ['requiresCook'],
  });
export type Task = z.infer<typeof TaskSchema>;
