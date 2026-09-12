import {
  IngredientCategorySchema,
  RecipeIRSchema,
  UnitSchema,
  VERB_RULES,
  durationFromText,
  makeId,
  resolveIngredient,
  verbFromText,
  type CookingVerb,
  type DishKind,
  type RecipeIR,
  type RecipeStep,
} from '@kitchen/domain';
import type { ExtractedRecipe } from './jsonld';

/**
 * Extracted markup to `RecipeIR`.
 *
 * Two things happen here that the markup does not give us.
 *
 * The first is the active/passive split. `schema.org/Recipe` has a total time and
 * sometimes a cook time, and nothing about which minutes need a cook. That distinction is
 * where every minute of parallelism in this product comes from, so it is inferred from the
 * verb — high-heat cooking is attended, low-heat cooking is not.
 *
 * The second is a plausibility check. Structured markup is machine-readable, which is not
 * the same as true: a page claiming a three-minute risotto would otherwise be scheduled as
 * one, and the user would find out at minute three.
 */

export type Correction = {
  stepId: string;
  field: 'durationMin';
  claimed: number;
  used: number;
  reason: string;
};

export type ToIrResult = {
  recipe: RecipeIR;
  corrections: Correction[];
  /** Steps whose duration the page never stated, filled from the verb table. */
  inferredDurations: number;
};

/**
 * How far a stated duration may sit from the table before it is treated as a mistake.
 *
 * Generous on the upper side — a four-hour braise is real, and the table's 35 minutes is a
 * default rather than a ceiling. Tight on the lower side, because that is the direction
 * that produces a schedule which cannot physically happen.
 */
const MIN_PLAUSIBLE_RATIO = 0.34;
const MAX_PLAUSIBLE_MULTIPLE = 12;

export type DurationCheckOptions = {
  /**
   * The duration was read from the page rather than inferred from the verb.
   *
   * It changes what the floor is for. When nothing stated a time, the table is the best
   * guess available and a number far below it is probably a misread. When the page said
   * "simmer for two minutes until glossy", the page is right and the table is a default:
   * pulling that to the table's twenty minutes invents eighteen minutes of waiting, and
   * the person finds out in the kitchen with the pan already going. So a trusted source
   * only has to clear zero.
   */
  trustSource?: boolean;
};

export const checkDuration = (
  verb: CookingVerb,
  claimed: number,
  options: DurationCheckOptions = {},
): { used: number; reason?: string } => {
  const rule = VERB_RULES[verb];
  const floor = options.trustSource
    ? 1
    : Math.max(1, Math.round(rule.durationMin * MIN_PLAUSIBLE_RATIO));
  const ceiling = rule.durationMin * MAX_PLAUSIBLE_MULTIPLE;
  if (claimed < floor) {
    return {
      used: rule.durationMin,
      reason: `${claimed} min is implausible for "${verb}"; using the table's ${rule.durationMin} min`,
    };
  }
  if (claimed > ceiling) {
    return {
      used: rule.durationMin,
      reason: `${claimed} min is implausibly long for "${verb}"; using the table's ${rule.durationMin} min`,
    };
  }
  return { used: claimed };
};

/** Our own wording. The source sentence is read for its verb and its numbers, then dropped. */
const ourWording = (verb: CookingVerb, ingredientRefs: string[], index: number): string => {
  const subject = ingredientRefs.slice(0, 2).join(' and ');
  const phrasing: Partial<Record<CookingVerb, string>> = {
    wash: 'Wash',
    chop: 'Chop',
    slice: 'Slice',
    dice: 'Dice',
    mince: 'Mince',
    grate: 'Grate',
    mix: 'Combine',
    whisk: 'Whisk',
    marinate: 'Leave to marinate',
    sear: 'Sear',
    saute: 'Cook down',
    'stir-fry': 'Stir-fry',
    fry: 'Fry',
    boil: 'Boil',
    simmer: 'Simmer',
    steam: 'Steam',
    braise: 'Braise',
    reduce: 'Reduce',
    roast: 'Roast',
    bake: 'Bake',
    rest: 'Rest',
    cool: 'Let cool',
    chill: 'Chill',
    steep: 'Steep',
    strain: 'Strain',
    blend: 'Blend',
    portion: 'Portion',
    assemble: 'Assemble',
    garnish: 'Garnish',
  };
  const head = phrasing[verb] ?? verb.replace('-', ' ');
  return subject ? `${head} the ${subject}` : `${head} (step ${index + 1})`;
};

/** "2 cloves garlic, minced" -> quantity 2, unit clove, name "garlic". */
const QUANTITY = /^\s*(?:about\s+)?(\d+(?:[./]\d+)?|\d+\s+\d+\/\d+)\s*([a-zA-Z]+)?\s*(?:of\s+)?(.*)$/;

const UNIT_WORDS: Record<string, string> = {
  g: 'g', gram: 'g', grams: 'g', kg: 'kg', kilogram: 'kg', kilograms: 'kg',
  ml: 'ml', l: 'l', litre: 'l', litres: 'l', liter: 'l', liters: 'l',
  tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  cup: 'cup', cups: 'cup', clove: 'clove', cloves: 'clove',
  bunch: 'bunch', head: 'head', slice: 'slice', slices: 'slice',
  can: 'can', cans: 'can', stalk: 'stalk', stalks: 'stalk',
};

const parseQuantity = (raw: string): number | undefined => {
  if (raw.includes('/')) {
    const parts = raw.trim().split(/\s+/);
    let total = 0;
    for (const part of parts) {
      if (part.includes('/')) {
        const [a, b] = part.split('/');
        total += Number(a) / Number(b);
      } else total += Number(part);
    }
    return Number.isFinite(total) && total > 0 ? Math.round(total * 100) / 100 : undefined;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const parseIngredientLine = (line: string) => {
  const m = QUANTITY.exec(line.replace(/\s+/g, ' ').trim());
  const quantity = m?.[1] ? parseQuantity(m[1]) : undefined;
  const maybeUnit = m?.[2]?.toLowerCase();
  const unit = maybeUnit ? UNIT_WORDS[maybeUnit] : undefined;
  const rest = [unit || !maybeUnit ? '' : maybeUnit, m?.[3] ?? line].filter(Boolean).join(' ');
  // "garlic, minced" -> "garlic". The preparation is a step, not part of the name.
  const name = rest.split(/,|\(/)[0]!.replace(/\s+/g, ' ').trim().toLowerCase();
  const resolved = resolveIngredient(name || line);
  return {
    canonicalName: resolved.canonicalName,
    ...(quantity !== undefined ? { quantity } : {}),
    ...(unit && UnitSchema.safeParse(unit).success ? { unit } : {}),
    category: IngredientCategorySchema.safeParse(resolved.category).success
      ? resolved.category
      : ('produce' as const),
    role: 'core' as const,
    optional: /optional|to taste|to serve|for garnish/i.test(line),
    substitutes: [],
  };
};

const KIND_HINTS: [RegExp, DishKind][] = [
  [/\b(sauce|dressing|marinade|condiment|dip|salsa|pesto)\b/i, 'sauce'],
  [/\b(drink|cocktail|smoothie|juice|lemonade|tea|coffee|brew|punch)\b/i, 'beverage'],
  [/\b(rice|grain|stock|broth|base|quinoa|beans)\b/i, 'base'],
  [/\b(salad|side|slaw|greens)\b/i, 'side'],
];

const inferKind = (title: string, tags: string[]): DishKind => {
  const haystack = `${title} ${tags.join(' ')}`;
  return KIND_HINTS.find(([re]) => re.test(haystack))?.[1] ?? 'main';
};

export const toRecipeIR = (
  extracted: ExtractedRecipe,
  source: { url: string; siteName: string; retrievedAt: string },
): { ok: true; result: ToIrResult } | { ok: false; reason: string } => {
  const recipeId = makeId('rcp', new URL(source.url).host, extracted.title.slice(0, 48));
  const ingredients = extracted.ingredients.map(parseIngredientLine);
  const names = ingredients.map((i) => i.canonicalName);

  const corrections: Correction[] = [];
  let inferredDurations = 0;

  const steps: RecipeStep[] = extracted.instructions.map((line, index) => {
    const verb = verbFromText(line);
    const rule = VERB_RULES[verb];
    const stepId = makeId('step', recipeId, index);

    const stated = durationFromText(line);
    let durationMin: number;
    if (stated === null) {
      durationMin = rule.durationMin;
      inferredDurations++;
    } else {
      const checked = checkDuration(verb, stated);
      durationMin = checked.used;
      if (checked.reason) {
        corrections.push({ stepId, field: 'durationMin', claimed: stated, used: checked.used, reason: checked.reason });
      }
    }

    // The markup never says which minutes need a cook. The verb does.
    const fullyActive = rule.activeMin === rule.durationMin;
    const activeMin = fullyActive ? durationMin : Math.min(rule.activeMin, durationMin);
    const finishMin = Math.min(rule.finishMin, Math.max(0, durationMin - activeMin));

    const refs = names.filter((n) => {
      const head = n.split(' ').at(-1);
      return head !== undefined && head.length > 2 && line.toLowerCase().includes(head);
    });

    return {
      id: stepId,
      verb,
      // Our wording, derived from the verb and the ingredients. Not the source sentence.
      text: ourWording(verb, refs, index),
      durationMin,
      activeMin,
      finishMin,
      equipment: rule.equipment.map((e) => ({ kind: e.kind, count: 1, heldThroughHold: e.heldThroughHold })),
      ingredientRefs: refs,
      taskClass: rule.taskClass,
      minSkill: rule.minSkill,
      effort: rule.effort,
      optional: /optional|if you like/i.test(line),
      dependsOn: index > 0 ? [makeId('step', recipeId, index - 1)] : [],
    };
  });

  const parsed = RecipeIRSchema.safeParse({
    id: recipeId,
    title: extracted.title,
    kind: inferKind(extracted.title, extracted.tags),
    yieldServings: extracted.yieldServings ?? 4,
    ingredients,
    steps,
    tags: ['imported', ...extracted.tags].slice(0, 12),
    source,
  });

  if (!parsed.success) {
    return { ok: false, reason: `extracted recipe was not valid: ${parsed.error.issues[0]?.message ?? 'unknown'}` };
  }

  return { ok: true, result: { recipe: parsed.data, corrections, inferredDurations } };
};
