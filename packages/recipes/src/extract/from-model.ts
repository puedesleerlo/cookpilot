import {
  HEAT_SANITISING_EQUIPMENT,
  RecipeIRSchema,
  RecipeStepSchema,
  resolveIngredient,
  slug,
  type Allergen,
  type EquipmentKind,
  type ReadRecipe,
  type ReadStep,
  type RecipeIR,
} from '@kitchen/domain';
import { checkDuration } from './to-ir';

/**
 * What the model read, turned into something the scheduler can hold.
 *
 * The split is the point. The model reads prose into facts — this takes eight minutes, it
 * needs a pan, it cannot start until the marinade has — and everything structural is added
 * here, by code that cannot get it wrong: step ids, dependency ids, the `heldThroughHold`
 * flag, canonical ingredient names, the phase budget invariant.
 *
 * Two guards run over what came back. Durations are checked against the verb table, because
 * a model that reads "simmer until reduced" will sometimes say two minutes and sometimes
 * say two hundred. And the phase budget is clamped, because `activeMin + finishMin` may not
 * exceed `durationMin` — the schema enforces it, and a rejected recipe helps nobody when
 * the fix is arithmetic.
 */

export type ModelRecipeResult =
  | { ok: true; recipe: RecipeIR; corrections: string[] }
  | { ok: false; reason: string };

/** A pan is held while what is in it cooks; a knife is not held while the meat marinates. */
const heldThroughHold = (kind: EquipmentKind): boolean =>
  HEAT_SANITISING_EQUIPMENT.has(kind) ||
  kind === 'burner' ||
  kind === 'oven-rack' ||
  kind === 'fridge-shelf' ||
  kind === 'freezer-shelf';

/**
 * Clamp a step's hands-on minutes into its duration.
 *
 * `activeMin + finishMin <= durationMin` is a schema invariant, and the honest reading of a
 * violation is that the model meant the step to be entirely hands-on: "chop the onions, 4
 * minutes" arrives as duration 4, active 4, finish 2 often enough to matter.
 */
const fitPhases = (step: ReadStep, durationMin: number): { activeMin: number; finishMin: number } => {
  const active = Math.min(step.activeMin, durationMin);
  const finish = Math.min(step.finishMin, Math.max(0, durationMin - active));
  return { activeMin: active, finishMin: finish };
};

export const toRecipeFromModel = (
  read: ReadRecipe,
  source: { url: string; siteName: string },
): ModelRecipeResult => {
  if (!read.isRecipe) {
    return { ok: false, reason: read.rejectedBecause ?? 'the page is not a recipe' };
  }
  if (read.steps.length === 0) {
    return { ok: false, reason: 'the page had no steps to follow' };
  }
  if (read.ingredients.length === 0) {
    return { ok: false, reason: 'the page listed no ingredients' };
  }

  const corrections: string[] = [];
  const id = `rcp:${slug(`${source.siteName} ${read.title}`).slice(0, 60)}`;
  const stepId = (index: number): string => `${id}:s${index + 1}`;

  const steps = read.steps.map((step, index) => {
    // The model read this page. The verb table is a floor against nonsense, not a second
    // opinion about a time the recipe stated outright.
    const checked = checkDuration(step.verb, step.durationMin, { trustSource: true });
    if (checked.reason) corrections.push(`Step ${index + 1}: ${checked.reason}`);
    const { activeMin, finishMin } = fitPhases(step, checked.used);
    if (activeMin !== step.activeMin || finishMin !== step.finishMin) {
      corrections.push(
        `Step ${index + 1}: hands-on time did not fit in ${checked.used} min and was trimmed`,
      );
    }

    return RecipeStepSchema.parse({
      id: stepId(index),
      verb: step.verb,
      text: step.text,
      durationMin: checked.used,
      activeMin,
      finishMin,
      equipment: step.equipment.map((kind) => ({
        kind,
        count: 1,
        heldThroughHold: heldThroughHold(kind),
      })),
      ingredientRefs: step.ingredientRefs.map((name) => resolveIngredient(name).canonicalName),
      taskClass: step.taskClass,
      minSkill: step.minSkill,
      effort: Math.min(3, Math.max(1, step.effort)),
      optional: step.optional,
      // Only backwards references: a step cannot wait on one that has not happened yet.
      dependsOn: step.dependsOn.filter((i) => i < index && i >= 0).map(stepId),
      ...(step.minDelayAfterMin !== undefined ? { minDelayAfterMin: step.minDelayAfterMin } : {}),
      ...(step.note ? { note: step.note } : {}),
    });
  });

  const allergens = new Set<Allergen>(read.allergens);
  const ingredients = read.ingredients.map((ing) => {
    const resolved = resolveIngredient(ing.name);
    for (const a of resolved.allergens) allergens.add(a);
    return {
      canonicalName: resolved.canonicalName,
      ...(ing.quantity !== undefined ? { quantity: ing.quantity } : {}),
      ...(ing.unit ? { unit: ing.unit } : {}),
      role: ing.role,
      category: resolved.category,
      optional: ing.optional,
      substitutes: [],
    };
  });

  const parsed = RecipeIRSchema.safeParse({
    id,
    title: read.title,
    kind: read.kind,
    yieldServings: read.yieldServings,
    ingredients,
    steps,
    tags: read.tags,
    allergens: [...allergens],
    keepsDays: read.keepsDays,
    overnight: read.overnight,
    source: { url: source.url, siteName: source.siteName, retrievedAt: new Date().toISOString() },
  });

  if (!parsed.success) {
    return { ok: false, reason: `what came back did not hold together: ${parsed.error.issues[0]?.message ?? 'unknown'}` };
  }
  return { ok: true, recipe: parsed.data, corrections };
};
