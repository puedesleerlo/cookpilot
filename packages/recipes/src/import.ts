import {
  RecipeIRSchema,
  RecipePackSchema,
  contentHash,
  makeId,
  type RecipeIR,
  type RecipePack,
} from '@kitchen/domain';
import { validatePack, type PackWarning } from './registry';

/**
 * Import never throws and never leaves the registry worse than it found it.
 *
 * A pack with one bad recipe keeps the other nineteen and says which one it dropped —
 * that is the difference between a user fixing a typo and a user giving up.
 */

export type ImportSuccess = {
  ok: true;
  pack: RecipePack;
  /** Recipes that failed validation and were left out, with the reason. */
  dropped: { index: number; title: string; reason: string }[];
  warnings: PackWarning[];
};
export type ImportFailure = { ok: false; reason: string };
export type ImportResult = ImportSuccess | ImportFailure;

/** Salvage the valid recipes from a pack whose envelope is fine but whose contents are not. */
const salvageRecipes = (
  raw: unknown,
): { recipes: RecipeIR[]; dropped: ImportSuccess['dropped'] } => {
  const list = (raw as { recipes?: unknown[] } | null)?.recipes;
  if (!Array.isArray(list)) return { recipes: [], dropped: [] };
  const recipes: RecipeIR[] = [];
  const dropped: ImportSuccess['dropped'] = [];
  list.forEach((entry, index) => {
    const parsed = RecipeIRSchema.safeParse(entry);
    if (parsed.success) {
      recipes.push(parsed.data);
      return;
    }
    const title = (entry as { title?: string } | null)?.title ?? `recipe ${index + 1}`;
    const issue = parsed.error.issues[0];
    dropped.push({
      index,
      title,
      reason: issue ? `${issue.path.join('.') || '(root)'}: ${issue.message}` : 'failed validation',
    });
  });
  return { recipes, dropped };
};

/** Import a pasted or uploaded pack JSON. Requires no model. */
export const importPackJson = (text: string): ImportResult => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      reason: `that is not valid JSON: ${err instanceof Error ? err.message : 'unparseable'}`,
    };
  }

  const direct = validatePack(raw);
  if (direct.pack) {
    return {
      ok: true,
      pack: { ...direct.pack, provenance: direct.pack.provenance === 'seed' ? 'imported' : direct.pack.provenance },
      dropped: [],
      warnings: direct.warnings,
    };
  }

  // The envelope or one of the recipes failed. Keep whatever is valid.
  const { recipes, dropped } = salvageRecipes(raw);
  if (recipes.length === 0) {
    return { ok: false, reason: `no valid recipes in that file. ${direct.warnings[0]?.message ?? ''}`.trim() };
  }

  const envelope = raw as Partial<RecipePack>;
  const repaired = RecipePackSchema.safeParse({
    packId: envelope.packId ?? makeId('pack', 'imported', contentHash(recipes)),
    version: envelope.version ?? '1.0.0',
    contentHash: contentHash(recipes),
    name: envelope.name ?? 'Imported recipes',
    description: envelope.description ?? '',
    locale: envelope.locale ?? 'en-US',
    provenance: 'imported',
    recipes,
  });
  if (!repaired.success) {
    return { ok: false, reason: 'the pack could not be repaired into a valid shape' };
  }
  return {
    ok: true,
    pack: repaired.data,
    dropped,
    warnings: [
      {
        packId: repaired.data.packId,
        code: 'partial-import',
        message: `${dropped.length} recipe${dropped.length === 1 ? '' : 's'} could not be read and ${dropped.length === 1 ? 'was' : 'were'} left out.`,
      },
    ],
  };
};

/*
 * `importRecipeText` lived here. It went with stage L3's model-first normalization, which
 * the consolidated delta reorders: structured schema.org markup extraction becomes the
 * primary path and the model handles only unmarked pages. It returns in
 * `add-structured-markup-extractor`, where the ordering can be set against a measured hit
 * rate instead of an assumption.
 *
 * Pack JSON import, below, needs no model and has worked throughout.
 */
