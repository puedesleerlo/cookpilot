import { z } from 'zod';
import { TaskSchema } from './task';
import { ConstraintsSchema } from './constraints';
import { MinuteSchema } from './primitives';

/**
 * Compiled-schedule types live here, in the domain layer, rather than next to the engine.
 *
 * That placement is load-bearing: `src/ui` is lint-forbidden from importing `@/scheduler`
 * at all, so the only way a component can render a timeline is if the shape of a timeline
 * is domain vocabulary. The UI can describe a schedule; it cannot produce one.
 */

/** One concrete instance of a resource: burner #2, cutting board #1. */
export const ResourceSlotSchema = z.object({
  equipmentId: z.string(),
  instance: z.number().int().nonnegative(),
});
export type ResourceSlot = z.infer<typeof ResourceSlotSchema>;

export const ScheduledTaskSchema = z.object({
  taskId: z.string(),
  startMin: MinuteSchema,
  endMin: MinuteSchema,
  /** Absent for `hold` phases, which occupy equipment but nobody's hands. */
  cookId: z.string().optional(),
  resources: z.array(ResourceSlotSchema).default([]),
  /** On the critical path: shortening this task shortens the session. */
  isCritical: z.boolean(),
  /** Minutes this task could slip without pushing the finish time. */
  slackMin: z.number().int(),
});
export type ScheduledTask = z.infer<typeof ScheduledTaskSchema>;

export const LaneGroupSchema = z.enum(['people', 'heat', 'tools', 'cold']);
export type LaneGroup = z.infer<typeof LaneGroupSchema>;

export const LaneSchema = z.object({
  id: z.string(),
  group: LaneGroupSchema,
  label: z.string(),
  /** Scheduled-task ids on this lane, in start order. */
  taskIds: z.array(z.string()),
});
export type Lane = z.infer<typeof LaneSchema>;

/**
 * Why the schedule looks the way it does — emitted by the scheduler itself, from facts
 * it already knows. Stage L5 only turns these into nicer sentences; it never invents one.
 */
export const RationaleSchema = z.object({
  type: z.enum([
    'passive-first',
    'critical-path',
    'pan-reuse',
    'wash-inserted',
    'skill-routing',
    'idle-fill',
    'cold-capacity',
    'safety-hold',
    'degradation',
  ]),
  taskIds: z.array(z.string()).default([]),
  /** Deterministic template prose. L5 may replace this string, nothing else. */
  explanation: z.string(),
  /** Minutes attributable to this decision, where the number is meaningful. */
  minutes: z.number().optional(),
});
export type Rationale = z.infer<typeof RationaleSchema>;

export const DegradationRungSchema = z.enum([
  'drop-optional-steps',
  'drop-beverages',
  'substitute-shorter-dish',
  'reduce-servings',
  'drop-dish',
]);
export type DegradationRung = z.infer<typeof DegradationRungSchema>;

export const DegradationEventSchema = z.object({
  rung: DegradationRungSchema,
  /** Order applied, 1-based, so the UI can show the ladder as it was climbed. */
  order: z.number().int().positive(),
  removedTaskIds: z.array(z.string()).default([]),
  removedDishIds: z.array(z.string()).default([]),
  reason: z.string(),
  minutesSaved: z.number().int(),
});
export type DegradationEvent = z.infer<typeof DegradationEventSchema>;

export const ScheduleMetricsSchema = z.object({
  /** Sum of every task duration — what one cook doing one thing at a time would spend. */
  serialMin: MinuteSchema,
  makespanMin: MinuteSchema,
  /** serialMin - makespanMin. The headline number: time bought by parallelism. */
  minutesSavedByParallelism: MinuteSchema,
  passiveMin: MinuteSchema,
  activeMinByCook: z.record(z.string(), MinuteSchema),
  idleMinByCook: z.record(z.string(), MinuteSchema),
  /** Max active minutes minus min, across cooks. Lower is a fairer session. */
  cookImbalanceMin: z.number().int().nonnegative(),
  washCount: z.number().int().nonnegative(),
  equipmentChanges: z.number().int().nonnegative(),
  portions: z.number().int().nonnegative(),
  dishCount: z.number().int().nonnegative(),
  beverageCount: z.number().int().nonnegative(),
  urgentIngredientsUsed: z.number().int().nonnegative(),
  urgentIngredientsTotal: z.number().int().nonnegative(),
  peakColdUsage: z.number().int().nonnegative(),
});
export type ScheduleMetrics = z.infer<typeof ScheduleMetricsSchema>;

export const ScheduleWarningSchema = z.object({
  severity: z.enum(['info', 'warning', 'error']),
  code: z.string(),
  message: z.string(),
  taskIds: z.array(z.string()).default([]),
});
export type ScheduleWarning = z.infer<typeof ScheduleWarningSchema>;

export const ScheduleSchema = z.object({
  id: z.string(),
  planId: z.string(),
  /** Deterministic hash of the inputs. Equal hashes must mean equal schedules. */
  inputHash: z.string(),
  feasible: z.boolean(),
  makespanMin: MinuteSchema,
  timeBudgetMin: MinuteSchema,
  /** Minute offset the schedule was compiled from. Non-zero only on recompilation. */
  originMin: MinuteSchema.default(0),
  scheduled: z.array(ScheduledTaskSchema),
  /** Denormalised so a shared link renders without the plan travelling alongside it. */
  tasks: z.record(z.string(), TaskSchema),
  dishNames: z.record(z.string(), z.string()).default({}),
  lanes: z.array(LaneSchema),
  criticalPath: z.array(z.string()),
  rationale: z.array(RationaleSchema),
  degradations: z.array(DegradationEventSchema),
  metrics: ScheduleMetricsSchema,
  warnings: z.array(ScheduleWarningSchema).default([]),
  constraints: ConstraintsSchema,
  /** Tasks the session finished with, in the order they complete. Convenience for cooking mode. */
  overnight: z.array(z.string()).default([]),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

// ------------------------------------------------------------------- diffing

export const ConstraintChangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('time-reduced'), newBudgetMin: z.number().int().positive() }),
  z.object({ kind: z.literal('cook-left'), cookId: z.string() }),
  z.object({ kind: z.literal('cook-joined'), cookId: z.string() }),
  z.object({ kind: z.literal('equipment-lost'), equipmentId: z.string(), count: z.number().int().positive().default(1) }),
  z.object({ kind: z.literal('equipment-gained'), equipmentId: z.string(), count: z.number().int().positive().default(1) }),
  z.object({ kind: z.literal('ingredient-frozen'), ingredientCanonicalName: z.string(), thawMin: z.number().int().positive().default(20) }),
  z.object({ kind: z.literal('task-running-long'), taskId: z.string(), extraMin: z.number().int().positive() }),
  z.object({ kind: z.literal('task-completed'), taskId: z.string(), atMin: MinuteSchema }),
  z.object({ kind: z.literal('optimization-changed'), mode: z.enum(['balanced', 'fastest', 'fewest-dishes', 'low-energy']) }),
]);
export type ConstraintChange = z.infer<typeof ConstraintChangeSchema>;

export const ScheduleDiffSchema = z.object({
  moved: z.array(z.object({ taskId: z.string(), fromMin: MinuteSchema, toMin: MinuteSchema, reason: z.string() })),
  reassigned: z.array(z.object({ taskId: z.string(), fromCookId: z.string().optional(), toCookId: z.string().optional(), reason: z.string() })),
  added: z.array(z.object({ taskId: z.string(), reason: z.string() })),
  removed: z.array(z.object({ taskId: z.string(), reason: z.string() })),
  frozen: z.array(z.string()).default([]),
  makespanDeltaMin: z.number().int(),
  /** One line the user reads before the chart redraws. */
  headline: z.string(),
  stillFeasible: z.boolean(),
});
export type ScheduleDiff = z.infer<typeof ScheduleDiffSchema>;
