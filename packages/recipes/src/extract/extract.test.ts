import { describe, expect, it } from 'vitest';
import { VERB_RULES } from '@kitchen/domain';
import {
  extractJsonLd,
  extractStructured,
  findRecipeNode,
  parseIsoDuration,
  parseYield,
} from './jsonld';
import { checkDuration, toRecipeIR } from './to-ir';

/**
 * The fixtures below are markup *shapes* taken from the measured sample — the nesting, the
 * instruction forms, the duration formats — rewritten with invented content. Real pages
 * were read to learn the shapes; none of their prose is reproduced here.
 */

const page = (jsonLd: unknown, extra = '') =>
  `<!doctype html><html><head>
   <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
   ${extra}</head><body><h1>A page</h1></body></html>`;

const RECIPE = {
  '@context': 'https://schema.org',
  '@type': 'Recipe',
  name: 'Ginger noodles',
  recipeYield: '4 servings',
  totalTime: 'PT35M',
  recipeIngredient: ['200 g noodles', '2 cloves garlic, minced', '1 tbsp soy sauce'],
  recipeInstructions: [
    { '@type': 'HowToStep', text: 'Boil the noodles for 8 minutes.' },
    { '@type': 'HowToStep', text: 'Mince the garlic.' },
    { '@type': 'HowToStep', text: 'Stir-fry everything together for 5 minutes.' },
  ],
  recipeCuisine: 'Asian',
  keywords: 'noodles, quick, weeknight',
};

const SOURCE = {
  url: 'https://example.test/recipes/ginger-noodles',
  siteName: 'Example Kitchen',
  retrievedAt: '2026-09-12T00:00:00.000Z',
};

describe('finding the Recipe node', () => {
  it('finds one at the top level', () => {
    expect(findRecipeNode(RECIPE)?.['name']).toBe('Ginger noodles');
  });

  it('finds one inside an array', () => {
    expect(findRecipeNode([{ '@type': 'WebSite' }, RECIPE])?.['name']).toBe('Ginger noodles');
  });

  it('finds one inside an @graph', () => {
    const graph = { '@context': 'https://schema.org', '@graph': [{ '@type': 'Organization' }, { '@type': 'WebPage' }, RECIPE] };
    expect(findRecipeNode(graph)?.['name']).toBe('Ginger noodles');
  });

  it('finds one under mainEntity', () => {
    expect(findRecipeNode({ '@type': 'WebPage', mainEntity: RECIPE })?.['name']).toBe('Ginger noodles');
  });

  it('accepts @type given as an array', () => {
    expect(findRecipeNode({ ...RECIPE, '@type': ['Recipe', 'NewsArticle'] })?.['name']).toBe('Ginger noodles');
  });

  it('returns nothing when there is no Recipe', () => {
    expect(findRecipeNode({ '@type': 'WebPage', mainEntity: { '@type': 'Article' } })).toBeNull();
  });
});

describe('instruction shapes', () => {
  const instructionsOf = (recipeInstructions: unknown) => {
    const out = extractJsonLd(page({ ...RECIPE, recipeInstructions }));
    return out.ok ? out.recipe.instructions : null;
  };

  it('reads a bare string, splitting on newlines', () => {
    expect(instructionsOf('Boil the noodles.\nMince the garlic.\nStir-fry.')).toEqual([
      'Boil the noodles.',
      'Mince the garlic.',
      'Stir-fry.',
    ]);
  });

  it('reads an array of strings', () => {
    expect(instructionsOf(['Boil.', 'Mince.', 'Stir-fry.'])).toEqual(['Boil.', 'Mince.', 'Stir-fry.']);
  });

  it('reads HowToStep entries', () => {
    expect(instructionsOf([{ '@type': 'HowToStep', text: 'Boil.' }])).toEqual(['Boil.']);
  });

  it('flattens HowToSection in document order', () => {
    const sectioned = [
      {
        '@type': 'HowToSection',
        name: 'Prep',
        itemListElement: [{ '@type': 'HowToStep', text: 'Mince the garlic.' }],
      },
      {
        '@type': 'HowToSection',
        name: 'Cook',
        itemListElement: [
          { '@type': 'HowToStep', text: 'Boil the noodles.' },
          { '@type': 'HowToStep', text: 'Stir-fry.' },
        ],
      },
    ];
    expect(instructionsOf(sectioned)).toEqual(['Mince the garlic.', 'Boil the noodles.', 'Stir-fry.']);
  });

  it('strips presentational numbering', () => {
    expect(instructionsOf(['1. Boil.', 'Step 2: Mince.', '3) Stir-fry.'])).toEqual(['Boil.', 'Mince.', 'Stir-fry.']);
  });
});

describe('durations and yield', () => {
  it.each([
    ['PT35M', 35],
    ['PT1H30M', 90],
    ['PT2H', 120],
    ['P0DT0H45M', 45],
    ['45 mins', 45],
    ['1 hour', 60],
  ])('%s becomes %i minutes', (input, expected) => {
    expect(parseIsoDuration(input)).toBe(expected);
  });

  it('returns nothing for an unparseable duration', () => {
    expect(parseIsoDuration('a while')).toBeUndefined();
    expect(parseIsoDuration(undefined)).toBeUndefined();
  });

  it('sums cook and prep time when total is absent', () => {
    const out = extractJsonLd(page({ ...RECIPE, totalTime: undefined, prepTime: 'PT10M', cookTime: 'PT20M' }));
    expect(out.ok && out.recipe.totalTimeMin).toBe(30);
  });

  it.each([
    ['4 servings', 4],
    [4, 4],
    [['4', '4 servings'], 4],
    ['Serves 6', 6],
    ['4-6', 4],
  ])('reads a yield of %s as %i', (input, expected) => {
    expect(parseYield(input)).toBe(expected);
  });
});

describe('robustness', () => {
  it('keeps the good block when another is malformed', () => {
    const html =
      `<html><head>` +
      `<script type="application/ld+json">{ "@type": "WebSite", }</script>` +
      `<script type="application/ld+json">${JSON.stringify(RECIPE)}</script>` +
      `</head><body></body></html>`;
    const out = extractJsonLd(html);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.recipe.title).toBe('Ginger noodles');
  });

  it('reports a page with no JSON-LD at all', () => {
    const out = extractJsonLd('<html><body>nothing here</body></html>');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain('no JSON-LD');
  });

  it('reports JSON-LD that contains no Recipe', () => {
    const out = extractJsonLd(page({ '@type': 'WebPage', name: 'Recipe index' }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain('no schema.org/Recipe');
  });

  it('refuses markup with a name but no ingredients', () => {
    const out = extractJsonLd(page({ ...RECIPE, recipeIngredient: [] }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain('no ingredients');
  });

  it('refuses markup with no instructions', () => {
    const out = extractJsonLd(page({ ...RECIPE, recipeInstructions: [] }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toContain('no instructions');
  });

  it('does not invent a recipe from a roundup page', () => {
    const roundup = '<html><body><h1>19 quick weeknight dinners</h1><p>Ingredients vary.</p></body></html>';
    expect(extractStructured(roundup).ok).toBe(false);
  });
});

describe('microdata is the fallback', () => {
  const MICRODATA = `<html><body>
    <div itemscope itemtype="https://schema.org/Recipe">
      <h1 itemprop="name">Lemon rice</h1>
      <span itemprop="recipeYield">4 servings</span>
      <meta itemprop="totalTime" content="PT25M" />
      <li itemprop="recipeIngredient">200 g rice</li>
      <li itemprop="recipeIngredient">1 lemon</li>
      <div itemprop="recipeInstructions">Boil the rice for 20 minutes.</div>
    </div></body></html>`;

  it('extracts when there is no JSON-LD', () => {
    const out = extractStructured(MICRODATA);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.method).toBe('microdata');
      expect(out.recipe.title).toBe('Lemon rice');
      expect(out.recipe.ingredients).toHaveLength(2);
      expect(out.recipe.totalTimeMin).toBe(25);
    }
  });

  it('is not preferred when JSON-LD is present', () => {
    const both = page(RECIPE, '') + MICRODATA;
    const out = extractStructured(both);
    expect(out.ok && out.method).toBe('json-ld');
  });
});

describe('plausibility', () => {
  it('corrects an implausibly short simmer', () => {
    const result = checkDuration('simmer', 3);
    expect(result.used).toBe(VERB_RULES.simmer.durationMin);
    expect(result.reason).toContain('implausible');
  });

  it('corrects an implausibly long chop', () => {
    const result = checkDuration('chop', 600);
    expect(result.used).toBe(VERB_RULES.chop.durationMin);
    expect(result.reason).toContain('implausibly long');
  });

  it('keeps a plausible duration unchanged', () => {
    expect(checkDuration('simmer', 25)).toEqual({ used: 25 });
    expect(checkDuration('braise', 180).used).toBe(180);
  });
});

describe('mapping to RecipeIR', () => {
  const extractedOf = (html: string) => {
    const out = extractJsonLd(html);
    if (!out.ok) throw new Error(out.reason);
    return out.recipe;
  };

  it('produces a schedulable recipe', () => {
    const mapped = toRecipeIR(extractedOf(page(RECIPE)), SOURCE);
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    const { recipe } = mapped.result;
    expect(recipe.steps).toHaveLength(3);
    expect(recipe.ingredients.map((i) => i.canonicalName)).toContain('garlic');
    const boil = recipe.steps[0]!;
    expect(boil.verb).toBe('boil');
    expect(boil.durationMin).toBe(8);
    // The markup never says this; the verb does.
    expect(boil.activeMin).toBeLessThan(boil.durationMin);
    const stirFry = recipe.steps[2]!;
    expect(stirFry.activeMin).toBe(stirFry.durationMin);
  });

  it('parses quantities and units off ingredient lines', () => {
    const mapped = toRecipeIR(extractedOf(page(RECIPE)), SOURCE);
    if (!mapped.ok) throw new Error(mapped.reason);
    const garlic = mapped.result.recipe.ingredients.find((i) => i.canonicalName === 'garlic')!;
    expect(garlic.quantity).toBe(2);
    expect(garlic.unit).toBe('clove');
  });

  it('records a correction when the page claims something implausible', () => {
    const implausible = {
      ...RECIPE,
      recipeInstructions: ['Simmer the rice for 2 minutes.'],
    };
    const mapped = toRecipeIR(extractedOf(page(implausible)), SOURCE);
    if (!mapped.ok) throw new Error(mapped.reason);
    expect(mapped.result.corrections).toHaveLength(1);
    expect(mapped.result.corrections[0]!.claimed).toBe(2);
    expect(mapped.result.corrections[0]!.used).toBe(VERB_RULES.simmer.durationMin);
    expect(mapped.result.recipe.steps[0]!.durationMin).toBe(VERB_RULES.simmer.durationMin);
  });

  it('fills a missing duration from the verb table and says how many', () => {
    const noTimes = { ...RECIPE, recipeInstructions: ['Mince the garlic.', 'Stir-fry everything.'] };
    const mapped = toRecipeIR(extractedOf(page(noTimes)), SOURCE);
    if (!mapped.ok) throw new Error(mapped.reason);
    expect(mapped.result.inferredDurations).toBe(2);
  });

  it('keeps the source pointer', () => {
    const mapped = toRecipeIR(extractedOf(page(RECIPE)), SOURCE);
    if (!mapped.ok) throw new Error(mapped.reason);
    expect(mapped.result.recipe.source).toEqual(SOURCE);
  });

  it('stores our own wording, never the source instruction', () => {
    const extracted = extractedOf(page(RECIPE));
    const mapped = toRecipeIR(extracted, SOURCE);
    if (!mapped.ok) throw new Error(mapped.reason);
    for (const step of mapped.result.recipe.steps) {
      for (const original of extracted.instructions) {
        expect(step.text).not.toBe(original);
      }
    }
    expect(mapped.result.recipe.steps[0]!.text).toMatch(/^Boil/);
  });

  it('is deterministic', () => {
    const a = toRecipeIR(extractedOf(page(RECIPE)), SOURCE);
    const b = toRecipeIR(extractedOf(page(RECIPE)), SOURCE);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('infers a dish kind from the title', () => {
    const sauce = { ...RECIPE, name: 'Garlic dipping sauce' };
    const mapped = toRecipeIR(extractedOf(page(sauce)), SOURCE);
    expect(mapped.ok && mapped.result.recipe.kind).toBe('sauce');
  });
});
