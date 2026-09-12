import {
  RecipePackSchema,
  contentHash,
  recipeTotals,
  type DishKind,
  type RecipeIR,
  type RecipePack,
} from '@/domain';
import { isStaple } from './staples';

import asianWeeknight from './seed/seed-asian-weeknight.json';
import bases from './seed/seed-bases.json';
import sauces from './seed/seed-sauces.json';
import beverages from './seed/seed-beverages.json';
import fastMains from './seed/seed-fast-mains.json';

/**
 * The pack registry: what recipes exist, and which of them this pantry can actually make.
 *
 * Seed packs are bundled as static imports rather than fetched, which is what makes the
 * "works with no network" guarantee real rather than aspirational — there is no request
 * to fail.
 */

const SEED_SOURCES: unknown[] = [asianWeeknight, bases, sauces, beverages, fastMains];

export type PackWarning = { packId: string; code: string; message: string };

export type LoadedRegistry = {
  packs: RecipePack[];
  recipes: RecipeIR[];
  warnings: PackWarning[];
};

/** Validate a pack. A hash mismatch warns; it never rejects a user's hand-edited file. */
export const validatePack = (raw: unknown): { pack: RecipePack | null; warnings: PackWarning[] } => {
  const parsed = RecipePackSchema.safeParse(raw);
  if (!parsed.success) {
    const id = (raw as { packId?: string } | null)?.packId ?? 'unknown';
    return {
      pack: null,
      warnings: [
        {
          packId: id,
          code: 'invalid-pack',
          message: parsed.error.issues
            .slice(0, 3)
            .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
            .join('; '),
        },
      ],
    };
  }
  const pack = parsed.data;
  const expected = contentHash(pack.recipes);
  const warnings: PackWarning[] =
    expected === pack.contentHash
      ? []
      : [
          {
            packId: pack.packId,
            code: 'hash-mismatch',
            message: `content hash is ${pack.contentHash} but the recipes hash to ${expected}. The pack was loaded anyway.`,
          },
        ];
  return { pack, warnings };
};

export const loadSeedPacks = (): LoadedRegistry => {
  const packs: RecipePack[] = [];
  const warnings: PackWarning[] = [];
  for (const raw of SEED_SOURCES) {
    const { pack, warnings: w } = validatePack(raw);
    warnings.push(...w);
    if (pack) packs.push(pack);
  }
  return { packs, recipes: packs.flatMap((p) => p.recipes), warnings };
};

// ------------------------------------------------------------------- index

export type RecipeIndex = {
  all: RecipeIR[];
  byId: Map<string, RecipeIR>;
  byIngredient: Map<string, RecipeIR[]>;
  byKind: Map<DishKind, RecipeIR[]>;
  byTag: Map<string, RecipeIR[]>;
  packOf: Map<string, string>;
};

const push = <K, V>(m: Map<K, V[]>, k: K, v: V): void => {
  const list = m.get(k);
  if (list) list.push(v);
  else m.set(k, [v]);
};

export const buildIndex = (packs: RecipePack[]): RecipeIndex => {
  const index: RecipeIndex = {
    all: [],
    byId: new Map(),
    byIngredient: new Map(),
    byKind: new Map(),
    byTag: new Map(),
    packOf: new Map(),
  };
  for (const pack of packs) {
    for (const recipe of pack.recipes) {
      index.all.push(recipe);
      index.byId.set(recipe.id, recipe);
      index.packOf.set(recipe.id, pack.packId);
      push(index.byKind, recipe.kind, recipe);
      for (const tag of recipe.tags) push(index.byTag, tag, recipe);
      for (const ing of recipe.ingredients) push(index.byIngredient, ing.canonicalName, recipe);
    }
  }
  return index;
};

// ---------------------------------------------------------------- coverage

export type Candidate = {
  recipe: RecipeIR;
  /** Fraction of the recipe's non-optional core ingredients the pantry supplies. */
  coverage: number;
  /** Core ingredients the pantry has. */
  matched: string[];
  /** Core ingredients it does not. */
  missing: string[];
  /** Staples we are assuming are in the cupboard, and would show as `assumed` chips. */
  assumed: string[];
  totalMin: number;
  activeMin: number;
};

/** Loose match: exact canonical name, or one name contained in the other. */
const pantryHas = (pantry: Set<string>, name: string, substitutes: readonly string[]): boolean => {
  if (pantry.has(name)) return true;
  for (const sub of substitutes) if (pantry.has(sub)) return true;
  for (const have of pantry) {
    if (have.includes(name) || name.includes(have)) return true;
  }
  return false;
};

/**
 * Rank what this pantry can make.
 *
 * Staples do not count against coverage — a recipe that needs salt is not less makeable
 * than one that does not — but they are reported, because an assumption the user cannot
 * see is an assumption they cannot correct.
 */
export const candidatesFor = (
  index: RecipeIndex,
  pantryNames: readonly string[],
  opts: { kinds?: DishKind[]; minCoverage?: number } = {},
): Candidate[] => {
  const pantry = new Set(pantryNames.map((n) => n.toLowerCase().trim()));
  const minCoverage = opts.minCoverage ?? 0.5;
  const pool = opts.kinds ? opts.kinds.flatMap((k) => index.byKind.get(k) ?? []) : index.all;

  const candidates: Candidate[] = [];
  for (const recipe of pool) {
    const core = recipe.ingredients.filter(
      (i) => !i.optional && i.role !== 'pantry' && !isStaple(i.canonicalName),
    );
    const matched: string[] = [];
    const missing: string[] = [];
    for (const ing of core) {
      if (pantryHas(pantry, ing.canonicalName, ing.substitutes)) matched.push(ing.canonicalName);
      else missing.push(ing.canonicalName);
    }
    const assumed = recipe.ingredients
      .filter((i) => (i.role === 'pantry' || isStaple(i.canonicalName)) && !pantryHas(pantry, i.canonicalName, i.substitutes))
      .map((i) => i.canonicalName);
    const coverage = core.length === 0 ? 1 : matched.length / core.length;
    if (coverage < minCoverage) continue;
    const totals = recipeTotals(recipe);
    candidates.push({ recipe, coverage, matched, missing, assumed, ...totals });
  }

  // Deterministic: coverage desc, then hands-on minutes asc, then id asc.
  return candidates.sort(
    (a, b) =>
      b.coverage - a.coverage ||
      a.activeMin - b.activeMin ||
      (a.recipe.id < b.recipe.id ? -1 : a.recipe.id > b.recipe.id ? 1 : 0),
  );
};
