import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  CookingVerbSchema,
  DishKindSchema,
  RecipeIRSchema,
  RecipeStepSchema,
  contentHash,
  passiveMinOf,
  recipeTotals,
} from '@/domain';
import { VERB_RULES, durationFromText, verbFromText } from '@/llm/fallbacks/verb-table';
import { setTransport } from '@/llm/client';
import { parseRecipeDeterministically } from '@/llm/stages/normalize';
import { buildIndex, candidatesFor, importPackJson, loadSeedPacks, packToJson, validatePack } from './index';

const root = process.cwd();
const registry = loadSeedPacks();
const index = buildIndex(registry.packs);

/** The §10 demo pantry, verbatim. */
const DEMO_PANTRY = [
  'jasmine rice', 'ground beef', 'chicken breast', 'salmon', 'tomatoes', 'eggs', 'mushrooms',
  'bok choy', 'bell peppers', 'garlic', 'ginger', 'soy sauce', 'cooking wine', 'sesame oil',
  'lemons', 'mint', 'coffee beans',
];

afterEach(() => setTransport(null));

describe('the step phase budget', () => {
  const base = {
    id: 'step:x:0',
    verb: 'simmer' as const,
    text: 'Simmer it',
    durationMin: 25,
    activeMin: 1,
    finishMin: 1,
    taskClass: 'simmer-watch' as const,
  };

  it('derives passive time from the budget', () => {
    const step = RecipeStepSchema.parse(base);
    expect(passiveMinOf(step)).toBe(23);
  });

  it('rejects a step that over-allocates its own duration', () => {
    const r = RecipeStepSchema.safeParse({ ...base, durationMin: 6, activeMin: 5, finishMin: 3 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues.some((i) => i.path.includes('activeMin'))).toBe(true);
  });

  it('accepts a fully active step and a fully passive one', () => {
    expect(RecipeStepSchema.safeParse({ ...base, durationMin: 8, activeMin: 8, finishMin: 0 }).success).toBe(true);
    const idle = RecipeStepSchema.parse({ ...base, durationMin: 5, activeMin: 0, finishMin: 0 });
    expect(passiveMinOf(idle)).toBe(5);
  });

  it('rejects contradictory delay windows', () => {
    expect(
      RecipeStepSchema.safeParse({ ...base, minDelayAfterMin: 20, maxDelayAfterMin: 5 }).success,
    ).toBe(false);
  });
});

describe('the cooking-verb rule table', () => {
  it('covers every verb in the vocabulary', () => {
    for (const verb of CookingVerbSchema.options) {
      expect(VERB_RULES[verb], `missing rule for ${verb}`).toBeDefined();
    }
  });

  it('keeps every rule internally consistent', () => {
    for (const [verb, rule] of Object.entries(VERB_RULES)) {
      expect(rule.activeMin + rule.finishMin, verb).toBeLessThanOrEqual(rule.durationMin);
      expect(rule.durationMin, verb).toBeGreaterThan(0);
    }
  });

  it('treats high-heat cooking as fully attended and low-heat as mostly free', () => {
    for (const verb of ['sear', 'saute', 'stir-fry', 'fry'] as const) {
      expect(VERB_RULES[verb].activeMin, verb).toBe(VERB_RULES[verb].durationMin);
    }
    for (const verb of ['simmer', 'braise', 'steam', 'steep'] as const) {
      const r = VERB_RULES[verb];
      expect(r.durationMin - r.activeMin - r.finishMin, verb).toBeGreaterThan(r.activeMin);
    }
  });

  it('holds equipment through the passive stretch only where it really is held', () => {
    expect(VERB_RULES.simmer.equipment.every((e) => e.heldThroughHold)).toBe(true);
    expect(VERB_RULES.chop.equipment.every((e) => e.heldThroughHold)).toBe(false);
  });

  it('reads verbs and durations out of instruction text', () => {
    expect(verbFromText('Bring to a boil, then reduce')).toBe('boil');
    expect(verbFromText('Finely mince the garlic')).toBe('mince');
    expect(verbFromText('Cube the chicken')).toBe('dice');
    expect(durationFromText('Simmer for 25 minutes')).toBe(25);
    expect(durationFromText('Chill for 1 hour 30 minutes')).toBe(90);
    expect(durationFromText('Stir until combined')).toBeNull();
  });
});

describe('the seed packs', () => {
  const files = readdirSync(path.join(root, 'src/recipes/seed')).filter((f) => f.endsWith('.json'));

  it('bundles at least four packs', () => {
    expect(registry.packs.length).toBeGreaterThanOrEqual(4);
    expect(registry.warnings).toEqual([]);
  });

  it.each(files)('%s validates and its content hash is current', (file) => {
    const raw = JSON.parse(readFileSync(path.join(root, 'src/recipes/seed', file), 'utf8'));
    const { pack, warnings } = validatePack(raw);
    expect(pack).not.toBeNull();
    expect(warnings).toEqual([]);
    expect(pack!.contentHash).toBe(contentHash(pack!.recipes));
  });

  it('covers every ingredient in the demo pantry', () => {
    const known = new Set(index.byIngredient.keys());
    const missing = DEMO_PANTRY.filter((p) => !known.has(p));
    expect(missing).toEqual([]);
  });

  it('has bases, sauces and beverages in the quantities the planner needs', () => {
    expect(index.byKind.get('base')?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(index.byKind.get('sauce')?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(index.byKind.get('beverage')?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('includes at least one beverage that starts now and finishes hours later', () => {
    const overnight = (index.byKind.get('beverage') ?? []).filter((r) => r.overnight);
    expect(overnight.length).toBeGreaterThanOrEqual(1);
    const steep = overnight[0]!.steps.find((s) => s.verb === 'steep');
    expect(passiveMinOf(steep!)).toBeGreaterThan(120);
  });

  it('keeps every seed step consistent with the verb rule table', () => {
    for (const recipe of index.all) {
      for (const step of recipe.steps) {
        expect(step.taskClass, `${recipe.id}/${step.id} (${step.verb})`).toBe(
          VERB_RULES[step.verb].taskClass,
        );
      }
    }
  });

  it('never depends on a later step, so the graph cannot cycle within a recipe', () => {
    for (const recipe of index.all) {
      const seen = new Set<string>();
      for (const step of recipe.steps) {
        for (const dep of step.dependsOn) {
          expect(seen.has(dep), `${recipe.id}: ${step.id} depends on ${dep}`).toBe(true);
        }
        seen.add(step.id);
      }
    }
  });

  it('needs no oven, so the demo kitchen can cook all of it', () => {
    const ovenRecipes = index.all.filter((r) =>
      r.steps.some((s) => s.equipment.some((e) => e.kind === 'oven-rack' || e.kind === 'sheet-pan')),
    );
    expect(ovenRecipes.map((r) => r.id)).toEqual([]);
  });

  it('stores structure, not prose, and keeps attribution where there is any', () => {
    for (const recipe of index.all) {
      expect(RecipeIRSchema.safeParse(recipe).success).toBe(true);
      expect(Object.keys(recipe)).not.toContain('instructions');
      expect(Object.keys(recipe)).not.toContain('body');
      if (recipe.source) {
        expect(recipe.source.url).toBeTruthy();
        expect(recipe.source.siteName).toBeTruthy();
      }
    }
  });

  it('reports plausible totals', () => {
    for (const recipe of index.all) {
      const { totalMin, activeMin } = recipeTotals(recipe);
      expect(activeMin, recipe.id).toBeLessThanOrEqual(totalMin);
      expect(totalMin, recipe.id).toBeGreaterThan(0);
    }
  });
});

describe('the pack index answers what the planner asks', () => {
  it('ranks candidates by how much of each recipe the pantry covers', () => {
    const candidates = candidatesFor(index, ['jasmine rice', 'chicken breast', 'bok choy', 'garlic']);
    expect(candidates.length).toBeGreaterThan(0);
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i - 1]!.coverage).toBeGreaterThanOrEqual(candidates[i]!.coverage);
    }
    expect(candidates[0]!.coverage).toBe(1);
  });

  it('does not count staples against coverage, but does report them as assumed', () => {
    // Salt is a staple, so a pantry without it still fully covers the dish -- but the
    // assumption is reported so the user can correct it before the compiler plans on it.
    const [best] = candidatesFor(index, ['bok choy', 'garlic', 'sesame oil'], { kinds: ['side'] });
    expect(best).toBeDefined();
    expect(best!.coverage).toBe(1);
    expect(best!.missing).toEqual([]);
    expect(best!.assumed).toContain('salt');
  });

  it('does not assume a defining flavour the user did not mention', () => {
    // Sesame oil is what makes the dish that dish. Assuming it would plan a sesame
    // dinner for someone who has no sesame oil -- and no way to see that we assumed it.
    const [best] = candidatesFor(index, ['bok choy', 'garlic'], { kinds: ['side'] });
    expect(best!.missing).toContain('sesame oil');
    expect(best!.coverage).toBeLessThan(1);
  });

  it('filters by dish kind', () => {
    const drinks = candidatesFor(index, DEMO_PANTRY, { kinds: ['beverage'] });
    expect(drinks.length).toBeGreaterThanOrEqual(3);
    expect(drinks.every((c) => DishKindSchema.parse(c.recipe.kind) === 'beverage')).toBe(true);
  });

  it('is deterministic', () => {
    const a = candidatesFor(index, DEMO_PANTRY).map((c) => c.recipe.id);
    const b = candidatesFor(index, DEMO_PANTRY).map((c) => c.recipe.id);
    expect(a).toEqual(b);
  });

  it('finds a full session in the demo pantry', () => {
    const all = candidatesFor(index, DEMO_PANTRY, { minCoverage: 1 });
    const kinds = new Set(all.map((c) => c.recipe.kind));
    expect(kinds.has('main')).toBe(true);
    expect(kinds.has('sauce')).toBe(true);
    expect(kinds.has('beverage')).toBe(true);
    expect(kinds.has('base')).toBe(true);
  });
});

describe('import never crashes on bad input', () => {
  it('reports malformed JSON instead of throwing', () => {
    const result = importPackJson('{ this is not json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('not valid JSON');
  });

  it('keeps the good recipes when one is bad, and says which it dropped', () => {
    const good = registry.packs[0]!;
    const doctored = {
      ...good,
      recipes: [good.recipes[0], { title: 'Broken soup', steps: [] }, good.recipes[1]],
    };
    const result = importPackJson(JSON.stringify(doctored));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.pack.recipes).toHaveLength(2);
      expect(result.dropped).toHaveLength(1);
      expect(result.dropped[0]!.title).toBe('Broken soup');
      expect(result.dropped[0]!.reason).toBeTruthy();
    }
  });

  it('refuses a file with nothing salvageable', () => {
    expect(importPackJson('{"recipes":[{"nope":1}]}').ok).toBe(false);
    expect(importPackJson('[]').ok).toBe(false);
  });

  it('needs no model to import a pack', () => {
    setTransport(async () => {
      throw new Error('the model must not be consulted for a pack import');
    });
    const result = importPackJson(packToJson(registry.packs[1]!));
    expect(result.ok).toBe(true);
  });

  it('marks an imported seed pack as imported rather than seed', () => {
    const result = importPackJson(packToJson(registry.packs[0]!));
    expect(result.ok && result.pack.provenance).toBe('imported');
  });
});

describe('export round-trips', () => {
  it('reimports with the same hash and recipe count', () => {
    for (const pack of registry.packs) {
      const result = importPackJson(packToJson(pack));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.pack.contentHash).toBe(pack.contentHash);
        expect(result.pack.recipes).toHaveLength(pack.recipes.length);
      }
    }
  });

  it('recomputes the hash on the way out, so an exported pack is self-consistent', () => {
    const tampered = { ...registry.packs[0]!, contentHash: 'fnv1a-00000000' };
    const exported = JSON.parse(packToJson(tampered));
    expect(exported.contentHash).toBe(contentHash(tampered.recipes));
  });
});

describe('pack identity', () => {
  it('is independent of key order', () => {
    const recipes = registry.packs[0]!.recipes;
    const reordered = recipes.map((r) => {
      const entries = Object.entries(r).reverse();
      return Object.fromEntries(entries);
    });
    expect(contentHash(reordered)).toBe(contentHash(recipes));
  });

  it('warns about a mismatch but still loads the pack', () => {
    const { pack, warnings } = validatePack({ ...registry.packs[0]!, contentHash: 'fnv1a-deadbeef' });
    expect(pack).not.toBeNull();
    expect(warnings[0]!.code).toBe('hash-mismatch');
  });
});

describe('the static registry index', () => {
  const indexJson = JSON.parse(readFileSync(path.join(root, 'public/registry/index.json'), 'utf8'));

  it('describes each pack without downloading it', () => {
    expect(indexJson.packs.length).toBe(registry.packs.length);
    for (const entry of indexJson.packs) {
      expect(entry.name).toBeTruthy();
      expect(entry.contentHash).toMatch(/^fnv1a-/);
      expect(entry.recipeCount).toBeGreaterThan(0);
      expect(entry.bytes).toBeGreaterThan(0);
    }
  });

  it('points at files that exist and match their listed hash', () => {
    for (const entry of indexJson.packs) {
      const file = path.join(root, 'public/registry', entry.url);
      const pack = JSON.parse(readFileSync(file, 'utf8'));
      expect(pack.packId).toBe(entry.packId);
      expect(contentHash(pack.recipes)).toBe(entry.contentHash);
      expect(pack.recipes).toHaveLength(entry.recipeCount);
    }
  });
});

describe('stage L3 falls back deterministically', () => {
  const TEXT = [
    'Ingredients',
    '400 g jasmine rice',
    '2 clove garlic',
    '1 tbsp sesame oil',
    'Instructions',
    '1. Rinse the rice until the water runs clear.',
    '2. Simmer the rice for 25 minutes with the lid on.',
    '3. Mince the garlic and stir it through with the sesame oil.',
  ].join('\n');

  it('produces a schedulable recipe from an ordinary pasted recipe', () => {
    const out = parseRecipeDeterministically({ text: TEXT, idSeed: 'garlic rice' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.recipe.ingredients.map((i) => i.canonicalName)).toContain('jasmine rice');
    expect(out.recipe.steps).toHaveLength(3);
    const simmer = out.recipe.steps[1]!;
    expect(simmer.verb).toBe('simmer');
    expect(simmer.durationMin).toBe(25);
    expect(passiveMinOf(simmer)).toBeGreaterThan(20);
    expect(simmer.equipment.map((e) => e.kind)).toContain('saucepan');
  });

  it('is deterministic across runs', () => {
    const a = parseRecipeDeterministically({ text: TEXT, idSeed: 'garlic rice' });
    const b = parseRecipeDeterministically({ text: TEXT, idSeed: 'garlic rice' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('keeps the source pointer without keeping the prose', () => {
    const out = parseRecipeDeterministically({
      text: TEXT,
      idSeed: 'garlic rice',
      source: { url: 'https://example.com/rice', siteName: 'Example Kitchen' },
      nowIso: '2026-09-12T00:00:00.000Z',
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.recipe.source?.siteName).toBe('Example Kitchen');
      expect(out.recipe.source?.retrievedAt).toBe('2026-09-12T00:00:00.000Z');
    }
  });

  it('fails cleanly and names what was missing', () => {
    expect(parseRecipeDeterministically({ text: '' })).toEqual({
      ok: false,
      reason: 'no ingredients found - expected a list before the instructions',
    });
    const noSteps = parseRecipeDeterministically({ text: 'Ingredients\n2 eggs\nInstructions\n' });
    expect(noSteps.ok).toBe(false);
    if (!noSteps.ok) expect(noSteps.reason).toContain('no instructions');
  });
});
