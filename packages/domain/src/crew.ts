import { z } from 'zod';
import {
  ContaminationStateSchema,
  EquipmentKindSchema,
  SkillLevelSchema,
  TaskClassSchema,
  TimeWindowSchema,
} from './primitives';

/**
 * A person. Skill and eligibility are deliberately independent axes: skill says what
 * someone can pull off, eligibility says what they are allowed to be handed. A confident
 * adult who refuses to touch fish and an eleven-year-old who may not go near the stove
 * are both expressed by narrowing `eligibleFor`, not by lying about skill.
 */
export const CookSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  skill: SkillLevelSchema,
  eligibleFor: z.array(TaskClassSchema).min(1),
  available: z.array(TimeWindowSchema).min(1),
  /** Rendered in the Gantt and the per-cook lane. Assigned from the palette, not random. */
  colorToken: z.string().default('cook-1'),
});
export type Cook = z.infer<typeof CookSchema>;

/**
 * A countable kitchen resource. `count` is how many interchangeable instances exist
 * (two burners); `capacity` is how much one instance holds (a fridge shelf takes four
 * containers). Cold storage is modelled here rather than treated as infinite, because
 * batch drinks and cooling cooked food genuinely compete for the same cold space.
 */
export const EquipmentSchema = z.object({
  id: z.string().min(1),
  kind: EquipmentKindSchema,
  label: z.string().optional(),
  count: z.number().int().min(0),
  capacity: z.number().int().positive().optional(),
  contaminationState: ContaminationStateSchema.default('clean'),
});
export type Equipment = z.infer<typeof EquipmentSchema>;

/** What a task needs while it runs. */
export const EquipmentRequirementSchema = z.object({
  kind: EquipmentKindSchema,
  count: z.number().int().positive().default(1),
  /**
   * Whether the task leaves the equipment occupied through the following `hold` phase.
   * A saucepan is held while rice cooks; a knife is not held while it marinates.
   */
  heldThroughHold: z.boolean().default(true),
});
export type EquipmentRequirement = z.infer<typeof EquipmentRequirementSchema>;
