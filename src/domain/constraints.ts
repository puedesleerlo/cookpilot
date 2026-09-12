import { z } from 'zod';
import { CookSchema, EquipmentSchema } from './crew';
import { AllergenSchema, MinuteSchema } from './primitives';

export const OptimizationModeSchema = z.enum([
  'balanced',
  'fastest',
  'fewest-dishes',
  'low-energy',
]);
export type OptimizationMode = z.infer<typeof OptimizationModeSchema>;

/**
 * Everything the compiler is allowed to assume about the kitchen and the session.
 * `nowIso` exists so overnight items (a cold brew that steeps twelve hours) can be
 * described against a wall clock without the scheduler ever reading one.
 */
export const ConstraintsSchema = z.object({
  timeBudgetMin: z.number().int().positive(),
  servings: z.number().int().positive(),
  cooks: z.array(CookSchema).min(1),
  equipment: z.array(EquipmentSchema),
  restrictions: z.array(AllergenSchema).default([]),
  dietary: z.array(z.string()).default([]),
  style: z.array(z.string()).default([]),
  optimization: OptimizationModeSchema.default('balanced'),
  /** Containers that fit in cold storage at once. Chilling contends for this. */
  fridgeCapacity: z.number().int().positive().default(4),
  /** Session wall-clock start, ISO 8601. Display only — the scheduler works in minutes. */
  nowIso: z.string().optional(),
  /** Cooked food must reach refrigeration within this many minutes of finishing. */
  maxTimeToChillMin: MinuteSchema.default(120),
});
export type Constraints = z.infer<typeof ConstraintsSchema>;

export const SLOT_NAMES = [
  'ingredients',
  'timeBudget',
  'servings',
  'cookCount',
  'equipment',
  'restrictions',
  'style',
] as const;
export const SlotNameSchema = z.enum(SLOT_NAMES);
export type SlotName = z.infer<typeof SlotNameSchema>;
