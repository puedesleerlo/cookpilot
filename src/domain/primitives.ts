import { z } from 'zod';

/**
 * Scalar vocabulary shared by every layer. Each value is a Zod schema first; the
 * TypeScript type is derived with `z.infer` so the two can never disagree.
 */

// ---------------------------------------------------------------- measurement

export const UnitSchema = z.enum([
  'g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup',
  'piece', 'clove', 'bunch', 'slice', 'pinch', 'can', 'head', 'stalk',
]);
export type Unit = z.infer<typeof UnitSchema>;

/** Minutes from the start of the session. Integer, non-negative. */
export const MinuteSchema = z.number().int().min(0);

export const TimeWindowSchema = z
  .object({ startMin: MinuteSchema, endMin: MinuteSchema })
  .refine((w) => w.endMin > w.startMin, {
    error: 'endMin must be after startMin',
    path: ['endMin'],
  });
export type TimeWindow = z.infer<typeof TimeWindowSchema>;

// -------------------------------------------------------------------- people

export const SkillLevelSchema = z.enum(['beginner', 'intermediate', 'confident']);
export type SkillLevel = z.infer<typeof SkillLevelSchema>;

/** Ordered so eligibility comparisons are a plain `>=`. */
export const SKILL_RANK: Readonly<Record<SkillLevel, number>> = {
  beginner: 0,
  intermediate: 1,
  confident: 2,
};

export const meetsSkill = (has: SkillLevel, needs: SkillLevel): boolean =>
  SKILL_RANK[has] >= SKILL_RANK[needs];

// ------------------------------------------------------------------- allergens

export const AllergenSchema = z.enum([
  'gluten', 'dairy', 'egg', 'soy', 'peanut', 'tree-nut', 'shellfish', 'fish', 'sesame',
]);
export type Allergen = z.infer<typeof AllergenSchema>;

// ---------------------------------------------------------------- task classes

/**
 * What *kind* of work a task is. This is the axis cook eligibility is expressed on:
 * an eleven-year-old is not "skill: beginner", they are "eligible for washing, mixing,
 * portioning and labelling, and nothing hot or raw".
 */
export const TaskClassSchema = z.enum([
  'wash-produce',
  'knife-work',
  'measure',
  'mix',
  'marinate',
  'raw-protein',
  'stovetop',
  'oven',
  'boil-water',
  'simmer-watch',
  'season-taste',
  'blend',
  'steep',
  'strain',
  'assemble',
  'garnish',
  'portion',
  'label',
  'chill',
  'wash-up',
]);
export type TaskClass = z.infer<typeof TaskClassSchema>;

/** Classes that put a cook in contact with a hot surface or open flame. */
export const HOT_TASK_CLASSES: ReadonlySet<TaskClass> = new Set<TaskClass>([
  'stovetop', 'oven', 'boil-water', 'simmer-watch',
]);

/** Classes that put a cook in contact with uncooked animal protein. */
export const RAW_PROTEIN_TASK_CLASSES: ReadonlySet<TaskClass> = new Set<TaskClass>([
  'raw-protein', 'marinate',
]);

/**
 * The default eligibility set for a helper who should never be handed the fish or the
 * hot pan — the family persona's eleven-year-old. Deliberately generous about the
 * things that are genuinely safe, because a helper with three eligible tasks is not
 * a second pair of hands.
 */
export const HELPER_TASK_CLASSES: readonly TaskClass[] = [
  'wash-produce', 'measure', 'mix', 'blend', 'steep', 'strain',
  'assemble', 'garnish', 'portion', 'label', 'chill', 'wash-up',
];

/** Everything a fully capable adult may be asked to do. */
export const ALL_TASK_CLASSES: readonly TaskClass[] = TaskClassSchema.options;

// ------------------------------------------------------------------- equipment

export const EquipmentKindSchema = z.enum([
  'burner',
  'oven-rack',
  'frying-pan',
  'saucepan',
  'pot',
  'wok',
  'sheet-pan',
  'kettle',
  'cutting-board',
  'knife',
  'mixing-bowl',
  'blender',
  'colander',
  'grater',
  'measuring-cup',
  'pitcher',
  'jar',
  'storage-container',
  'fridge-shelf',
  'freezer-shelf',
  'sink',
]);
export type EquipmentKind = z.infer<typeof EquipmentKindSchema>;

/**
 * Cookware that reaches a temperature high enough to sanitise itself in normal use.
 * A pan that held raw chicken and is then used to sear beef is not a hazard; a cutting
 * board in the same position is. The contamination model turns on exactly this set.
 */
export const HEAT_SANITISING_EQUIPMENT: ReadonlySet<EquipmentKind> = new Set<EquipmentKind>([
  'frying-pan', 'saucepan', 'pot', 'wok', 'sheet-pan', 'kettle', 'oven-rack',
]);

/** Equipment representing cold storage, which has finite shelf capacity. */
export const COLD_STORAGE_EQUIPMENT: ReadonlySet<EquipmentKind> = new Set<EquipmentKind>([
  'fridge-shelf', 'freezer-shelf',
]);

// ------------------------------------------------------------- contamination

export const BASE_CONTAMINATION_STATES = [
  'clean',
  'soiled',
  'raw-meat',
  'raw-fish',
  'raw-egg',
] as const;

export type BaseContaminationState = (typeof BASE_CONTAMINATION_STATES)[number];
export type AllergenTaint = `allergen:${string}`;
export type ContaminationStateValue = BaseContaminationState | AllergenTaint;

const ALLERGEN_TAINT_RE = /^allergen:[a-z0-9][a-z0-9-]*$/;

export const ContaminationStateSchema = z.custom<ContaminationStateValue>(
  (value) =>
    typeof value === 'string' &&
    ((BASE_CONTAMINATION_STATES as readonly string[]).includes(value) ||
      ALLERGEN_TAINT_RE.test(value)),
  { error: "expected 'clean' | 'soiled' | 'raw-meat' | 'raw-fish' | 'raw-egg' | 'allergen:<id>'" },
);
export type ContaminationState = z.infer<typeof ContaminationStateSchema>;

/** Hazardous residues that a non-heated surface must be washed of before ready-to-eat work. */
export const RAW_PROTEIN_STATES: ReadonlySet<ContaminationState> = new Set<ContaminationState>([
  'raw-meat', 'raw-fish', 'raw-egg',
]);

export const isAllergenTaint = (s: ContaminationState): s is AllergenTaint =>
  s.startsWith('allergen:');

export const allergenOf = (s: ContaminationState): string | null =>
  isAllergenTaint(s) ? s.slice('allergen:'.length) : null;

export const taintFor = (allergen: Allergen): AllergenTaint => `allergen:${allergen}`;

// ----------------------------------------------------------------- ingredients

export const UrgencySchema = z.enum(['use-today', 'use-soon', 'not-urgent']);
export type Urgency = z.infer<typeof UrgencySchema>;

/** How urgency weighs in candidate scoring. Higher means "get this into a dish". */
export const URGENCY_WEIGHT: Readonly<Record<Urgency, number>> = {
  'use-today': 3,
  'use-soon': 1.5,
  'not-urgent': 1,
};

export const PrepStateSchema = z.enum(['unwashed', 'washed', 'chopped', 'cooked', 'frozen']);
export type PrepState = z.infer<typeof PrepStateSchema>;

export const IngredientCategorySchema = z.enum([
  'protein-raw',
  'protein-cooked',
  'produce',
  'grain',
  'dairy',
  'pantry',
  'aromatic',
  'beverage-base',
]);
export type IngredientCategory = z.infer<typeof IngredientCategorySchema>;

/** Which raw-protein contamination a category leaves on a surface it touches. */
export const CATEGORY_CONTAMINATION: Readonly<Partial<Record<IngredientCategory, ContaminationState>>> = {
  'protein-raw': 'raw-meat',
};

// ----------------------------------------------------------------------- dishes

export const DishKindSchema = z.enum(['main', 'side', 'sauce', 'base', 'beverage']);
export type DishKind = z.infer<typeof DishKindSchema>;

// ------------------------------------------------------------------------ verbs

/**
 * The verb vocabulary the L4 rule table is keyed on. When the model is unavailable,
 * a step's verb alone determines its duration split, equipment and safety class.
 */
export const CookingVerbSchema = z.enum([
  'wash', 'peel', 'chop', 'slice', 'dice', 'mince', 'grate',
  'marinate', 'season', 'mix', 'whisk', 'knead',
  'sear', 'saute', 'stir-fry', 'fry', 'boil', 'simmer', 'steam', 'braise', 'reduce',
  'roast', 'bake', 'grill', 'toast',
  'rest', 'cool', 'chill', 'freeze', 'thaw',
  'steep', 'brew', 'infuse', 'juice', 'blend', 'strain',
  'portion', 'label', 'assemble', 'garnish', 'wash-up',
]);
export type CookingVerb = z.infer<typeof CookingVerbSchema>;

// ------------------------------------------------------------------- effort

/** 1 = barely counts, 2 = ordinary, 3 = standing over a hot pan paying attention. */
export const EffortSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type Effort = z.infer<typeof EffortSchema>;
