import { z } from 'zod';
import {
  IngredientCategorySchema,
  RecipeIRSchema,
  UnitSchema,
  makeId,
  type RecipeIR,
  type RecipeStep,
} from '@/domain';
import { callStage, type StageResult } from '../client';
import { VERB_RULES, durationFromText, verbFromText } from '../fallbacks/verb-table';

/**
 * Stage L3 - recipe text to `RecipeIR`.
 *
 * The model is a convenience here, not a dependency: the deterministic parser below
 * handles the shape almost every recipe on the internet is already in (an ingredients
 * block, then one instruction per line), and the verb rule table supplies everything the
 * text leaves unsaid.
 */

export type NormalizeInput = {
  text: string;
  /** Where the text came from, when it came from somewhere. Kept; never the prose. */
  source?: { url: string; siteName: string };
  /** Deterministic id seed, so importing the same recipe twice yields the same id. */
  idSeed?: string;
  /** Injected so the parser stays testable; never read from an ambient clock. */
  nowIso?: string;
};

export type NormalizeFailure = { ok: false; reason: string };
export type NormalizeSuccess = { ok: true; recipe: RecipeIR; source: StageResult<unknown>['source'] };
export type NormalizeOutcome = NormalizeSuccess | NormalizeFailure;

/**
 * The model returns a slightly looser shape than `RecipeIR` - no ids, no defaults - and
 * we fill those in deterministically, so two runs over the same input agree on ids.
 */
const DraftStepSchema = z.object({
  text: z.string(),
  verb: z.string(),
  durationMin: z.number().int().min(0),
  activeMin: z.number().int().min(0),
  finishMin: z.number().int().min(0).default(0),
  equipment: z.array(z.string()).default([]),
  ingredientRefs: z.array(z.string()).default([]),
  dependsOnIndexes: z.array(z.number().int().min(0)).default([]),
  optional: z.boolean().default(false),
  maxDelayAfterMin: z.number().int().min(0).optional(),
});

const DraftSchema = z.object({
  title: z.string().min(1),
  kind: z.enum(['main', 'side', 'sauce', 'base', 'beverage']),
  yieldServings: z.number().int().positive(),
  overnight: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  ingredients: z
    .array(
      z.object({
        canonicalName: z.string().min(1),
        quantity: z.number().positive().optional(),
        unit: z.string().optional(),
        category: z.string(),
        role: z.enum(['core', 'aromatic', 'pantry', 'garnish']).default('core'),
        optional: z.boolean().default(false),
      }),
    )
    .min(1),
  steps: z.array(DraftStepSchema).min(1),
});
type Draft = z.infer<typeof DraftSchema>;

const SYSTEM = [
  'You convert recipes into a scheduling intermediate representation for a meal-prep compiler.',
  '',
  'You are extracting STRUCTURE, not rewriting prose. Rules:',
  '- Write each step text in your own short imperative wording. Never copy the source sentence.',
  '- durationMin is wall-clock time the step occupies. activeMin is hands-on time at the START.',
  '  finishMin is hands-on time at the END. The remainder is time the cook is free.',
  '- High-heat cooking (sear, saute, stir-fry, fry) is fully attended: activeMin equals durationMin.',
  '- Low-heat cooking (simmer, steam, braise, boil) is mostly unattended: small activeMin, small',
  '  finishMin, large passive remainder. This distinction is the single most important thing you produce.',
  '- equipment uses these kinds only: burner, oven-rack, frying-pan, saucepan, pot, wok, sheet-pan,',
  '  kettle, cutting-board, knife, mixing-bowl, blender, colander, grater, measuring-cup, pitcher,',
  '  jar, storage-container, fridge-shelf, freezer-shelf, sink.',
  '- dependsOnIndexes refers to earlier steps by their index in your own steps array.',
  '- Set maxDelayAfterMin when a step must follow promptly for safety or quality.',
  '- Ingredient categories: protein-raw, protein-cooked, produce, grain, dairy, pantry, aromatic,',
  '  beverage-base.',
  '- Set overnight true only when the recipe genuinely spans many hours, like a cold brew.',
  '',
  'Return JSON only.',
].join('\n');

// ------------------------------------------------------------- deterministic

const CATEGORY_HINTS: [RegExp, z.infer<typeof IngredientCategorySchema>][] = [
  [/chicken|beef|pork|lamb|salmon|fish|shrimp|prawn|mince|steak|thigh|breast/i, 'protein-raw'],
  [/rice|noodle|pasta|quinoa|bread|flour|oat|barley|couscous/i, 'grain'],
  [/milk|cream|butter|yoghurt|yogurt|cheese|paneer/i, 'dairy'],
  [/garlic|ginger|onion|shallot|scallion|chilli|chili|lemongrass|turmeric/i, 'aromatic'],
  [/coffee|tea|matcha|cacao|hibiscus/i, 'beverage-base'],
  [/oil|sauce|vinegar|salt|pepper|sugar|honey|stock|starch|wine|paste|seed/i, 'pantry'],
];

const categorise = (name: string): z.infer<typeof IngredientCategorySchema> =>
  CATEGORY_HINTS.find(([re]) => re.test(name))?.[1] ?? 'produce';

const UNITS = new Set(UnitSchema.options as readonly string[]);

const INGREDIENT_LINE = /^\s*(?:[-*]\s*)?(?:(\d+(?:[./]\d+)?)\s*)?([a-zA-Z]+)?\s*(?:of\s+)?(.+?)\s*$/;

const parseQuantity = (raw?: string): number | undefined => {
  if (!raw) return undefined;
  if (raw.includes('/')) {
    const [a, b] = raw.split('/');
    const n = Number(a) / Number(b);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/** Split a pasted recipe into its ingredients block and its instruction lines. */
const splitBlocks = (text: string): { ingredientLines: string[]; stepLines: string[] } => {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const headingAt = lines.findIndex((l) =>
    /^(instructions?|method|directions?|steps?|preparation)\s*:?\s*$/i.test(l),
  );
  if (headingAt >= 0) {
    const ingStart = lines.findIndex((l) => /^(ingredients?)\s*:?\s*$/i.test(l));
    return {
      ingredientLines: lines.slice(ingStart >= 0 ? ingStart + 1 : 0, headingAt),
      stepLines: lines.slice(headingAt + 1),
    };
  }
  // No heading: numbered or long lines are steps, short bulleted lines are ingredients.
  const stepLines = lines.filter((l) => /^\d+[.)]\s/.test(l) || l.split(/\s+/).length > 7);
  const ingredientLines = lines.filter((l) => !stepLines.includes(l));
  return { ingredientLines, stepLines };
};

export const parseRecipeDeterministically = (input: NormalizeInput): NormalizeOutcome => {
  const { ingredientLines, stepLines } = splitBlocks(input.text);
  if (ingredientLines.length === 0) {
    return { ok: false, reason: 'no ingredients found - expected a list before the instructions' };
  }
  if (stepLines.length === 0) {
    return { ok: false, reason: 'no instructions found - expected one step per line' };
  }

  const seed = input.idSeed ?? stepLines[0] ?? 'imported';
  const recipeId = makeId('rcp', seed.slice(0, 40));

  const ingredients = ingredientLines.map((line) => {
    const m = INGREDIENT_LINE.exec(line);
    const quantity = parseQuantity(m?.[1]);
    const maybeUnit = m?.[2]?.toLowerCase();
    const unit = maybeUnit && UNITS.has(maybeUnit) ? maybeUnit : undefined;
    const name = [unit ? undefined : m?.[2], m?.[3]].filter(Boolean).join(' ').trim() || line;
    const canonicalName = name.toLowerCase().replace(/[,.;].*$/, '').trim();
    return {
      canonicalName,
      ...(quantity !== undefined ? { quantity } : {}),
      ...(unit ? { unit: unit as z.infer<typeof UnitSchema> } : {}),
      category: categorise(canonicalName),
      role: /salt|pepper|oil|water|sugar/i.test(canonicalName) ? ('pantry' as const) : ('core' as const),
      optional: /optional/i.test(line),
      substitutes: [],
    };
  });

  const names = ingredients.map((i) => i.canonicalName);

  const steps: RecipeStep[] = stepLines.map((line, index) => {
    const body = line.replace(/^\d+[.)]\s*/, '');
    const verb = verbFromText(body);
    const rule = VERB_RULES[verb];
    const stated = durationFromText(body);
    const durationMin = Math.max(1, stated ?? rule.durationMin);
    // Extra minutes on a simmer are passive minutes, not extra minutes of standing there.
    const fullyActive = rule.activeMin === rule.durationMin;
    const activeMin = fullyActive ? durationMin : Math.min(rule.activeMin, durationMin);
    const finishMin = Math.min(rule.finishMin, Math.max(0, durationMin - activeMin));
    return {
      id: makeId('step', recipeId, index),
      verb,
      text: body.length > 140 ? body.slice(0, 137) + '...' : body,
      durationMin,
      activeMin,
      finishMin,
      equipment: rule.equipment.map((e) => ({ kind: e.kind, count: 1, heldThroughHold: e.heldThroughHold })),
      ingredientRefs: names.filter((n) => {
        const head = n.split(' ').at(-1);
        return head !== undefined && head.length > 2 && body.toLowerCase().includes(head);
      }),
      taskClass: rule.taskClass,
      minSkill: rule.minSkill,
      effort: rule.effort,
      optional: /optional|if you like|garnish/i.test(body),
      dependsOn: index > 0 ? [makeId('step', recipeId, index - 1)] : [],
    };
  });

  const parsed = RecipeIRSchema.safeParse({
    id: recipeId,
    title: input.idSeed ?? stepLines[0]?.slice(0, 60) ?? 'Imported recipe',
    kind: 'main',
    yieldServings: 4,
    ingredients,
    steps,
    tags: ['imported'],
    ...(input.source
      ? { source: { ...input.source, retrievedAt: input.nowIso ?? '1970-01-01T00:00:00.000Z' } }
      : {}),
  });

  return parsed.success
    ? { ok: true, recipe: parsed.data, source: 'fallback' }
    : {
        ok: false,
        reason: 'parsed recipe was not valid: ' + (parsed.error.issues[0]?.message ?? 'unknown'),
      };
};

// ------------------------------------------------------------------ stage

const KNOWN_VERBS = new Set(Object.keys(VERB_RULES));
const EQUIPMENT_KINDS = new Set(
  Object.values(VERB_RULES).flatMap((r) => r.equipment.map((e) => e.kind as string)),
);

const draftToIR = (draft: Draft, input: NormalizeInput): RecipeIR | null => {
  const recipeId = makeId('rcp', input.idSeed ?? draft.title);
  const stepIds = draft.steps.map((_, i) => makeId('step', recipeId, i));
  const steps = draft.steps.map((s, i) => {
    const verb = KNOWN_VERBS.has(s.verb) ? s.verb : verbFromText(s.verb + ' ' + s.text);
    const rule = VERB_RULES[verb as keyof typeof VERB_RULES];
    const durationMin = Math.max(1, s.durationMin);
    const activeMin = Math.min(s.activeMin, durationMin);
    const finishMin = Math.min(s.finishMin, Math.max(0, durationMin - activeMin));
    const declared = s.equipment.filter((k) => EQUIPMENT_KINDS.has(k));
    return {
      id: stepIds[i]!,
      verb,
      text: s.text,
      durationMin,
      activeMin,
      finishMin,
      equipment:
        declared.length > 0
          ? declared.map((kind) => ({ kind, count: 1, heldThroughHold: true }))
          : rule.equipment.map((e) => ({ kind: e.kind, count: 1, heldThroughHold: e.heldThroughHold })),
      ingredientRefs: s.ingredientRefs,
      taskClass: rule.taskClass,
      minSkill: rule.minSkill,
      effort: rule.effort,
      optional: s.optional,
      dependsOn: s.dependsOnIndexes.filter((n) => n < i).map((n) => stepIds[n]!),
      ...(s.maxDelayAfterMin !== undefined ? { maxDelayAfterMin: s.maxDelayAfterMin } : {}),
    };
  });

  const result = RecipeIRSchema.safeParse({
    id: recipeId,
    title: draft.title,
    kind: draft.kind,
    yieldServings: draft.yieldServings,
    overnight: draft.overnight,
    tags: draft.tags,
    ingredients: draft.ingredients.map((i) => ({
      ...i,
      category: IngredientCategorySchema.safeParse(i.category).success
        ? i.category
        : categorise(i.canonicalName),
      unit: i.unit && UNITS.has(i.unit) ? i.unit : undefined,
      substitutes: [],
    })),
    steps,
    ...(input.source
      ? { source: { ...input.source, retrievedAt: input.nowIso ?? '1970-01-01T00:00:00.000Z' } }
      : {}),
  });
  return result.success ? result.data : null;
};

/** Sentinel the fallback returns so `callStage` can hand control back here. */
const FALLBACK_TITLE = ' fallback';

export const normalizeRecipe = async (input: NormalizeInput): Promise<NormalizeOutcome> => {
  const result = await callStage<NormalizeInput, Draft>(
    {
      name: 'L3-normalize',
      schema: DraftSchema,
      system: SYSTEM,
      buildUser: (i) =>
        [
          i.source
            ? 'Source: ' + i.source.siteName + ' (' + i.source.url + ')'
            : 'Source: pasted by the user',
          '',
          'Recipe text:',
          i.text.slice(0, 12_000),
        ].join('\n'),
      fallback: () => ({
        title: FALLBACK_TITLE,
        kind: 'main' as const,
        yieldServings: 4,
        overnight: false,
        tags: [],
        ingredients: [
          { canonicalName: 'unknown', category: 'produce', role: 'core' as const, optional: false },
        ],
        steps: [
          {
            text: '',
            verb: 'mix',
            durationMin: 1,
            activeMin: 1,
            finishMin: 0,
            equipment: [],
            ingredientRefs: [],
            dependsOnIndexes: [],
            optional: false,
          },
        ],
      }),
    },
    input,
  );

  if (result.value.title === FALLBACK_TITLE) return parseRecipeDeterministically(input);

  const ir = draftToIR(result.value, input);
  if (!ir) return parseRecipeDeterministically(input);
  return { ok: true, recipe: ir, source: result.source };
};
