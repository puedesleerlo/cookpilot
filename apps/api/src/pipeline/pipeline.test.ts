// @vitest-environment node
/**
 * The pipeline's deterministic parts, and the shape of the chain.
 *
 * Everything here runs without a network: the gateway takes an injected generator, so the
 * whole run can be driven against canned model output. What this catches is the half of
 * the pipeline that is not the model — robots, readable text, the mapping from what the
 * model read into something the scheduler can hold, and the rule that a page which cannot
 * be read is dropped rather than invented.
 */
import { describe, expect, it } from 'vitest';
import { portionTarget, servingsPerDish } from '@kitchen/domain';
import { toRecipeFromModel } from '@kitchen/recipes';
import { isAllowed, parseRobots } from '../search/robots';
import { readableText } from '../search/page';
import { l1Intake } from './l1-intake';
import { l2Queries } from './l2-queries';
import { l3Recipe } from './l3-recipe';
import { tooSimilar } from './run';

describe('robots.txt', () => {
  const robots = `
    User-agent: BadBot
    Disallow: /

    User-agent: *
    Disallow: /search
    Disallow: /print/
    Allow: /print/recipes
  `;

  it('reads the group that applies to everyone', () => {
    const rules = parseRobots(robots);
    expect(rules.disallow).toEqual(['/search', '/print/']);
    expect(rules.allow).toEqual(['/print/recipes']);
  });

  it('does not obey a group written for somebody else', () => {
    expect(isAllowed(parseRobots(robots), '/anything')).toBe(true);
  });

  it('honours a disallow', () => {
    expect(isAllowed(parseRobots(robots), '/search?q=chicken')).toBe(false);
    expect(isAllowed(parseRobots(robots), '/print/steak')).toBe(false);
  });

  it('lets the longer allow win, as the standard says', () => {
    expect(isAllowed(parseRobots(robots), '/print/recipes/steak')).toBe(true);
  });

  it('treats an empty robots.txt as permission', () => {
    expect(isAllowed(parseRobots(''), '/anything')).toBe(true);
  });

  it('obeys a group written for us over the wildcard', () => {
    const mine = parseRobots(`
      User-agent: *
      Disallow:

      User-agent: KitchenCompilerBot
      Disallow: /recipes
    `);
    expect(isAllowed(mine, '/recipes/chicken')).toBe(false);
  });
});

describe('reducing a page to something readable', () => {
  const page = `
    <html><head><title>Ginger Chicken | SiteName</title></head>
    <body>
      <nav>Home About Subscribe</nav>
      <script>window.ads = 1;</script>
      <style>.a{color:red}</style>
      <p>I first made this in my grandmother's kitchen, and let me tell you a long story.</p>
      <h2>Ingredients</h2>
      <ul><li>500g chicken</li><li>2 tbsp soy sauce &amp; a little sesame</li></ul>
      <h2>Method</h2>
      <ol><li>Marinate for 20&nbsp;minutes.</li><li>Fry for 8 minutes.</li></ol>
      <footer>Copyright</footer>
    </body></html>`;

  it('drops script, style and navigation', () => {
    const text = readableText(page);
    expect(text).not.toContain('window.ads');
    expect(text).not.toContain('color:red');
    expect(text).not.toContain('Subscribe');
  });

  it('keeps the recipe', () => {
    const text = readableText(page);
    expect(text).toContain('500g chicken');
    expect(text).toContain('Marinate for 20 minutes.');
  });

  it('decodes the entities a recipe actually uses', () => {
    expect(readableText(page)).toContain('soy sauce & a little sesame');
  });

  it('starts at the ingredients, not at the life story', () => {
    const text = readableText(page);
    expect(text.indexOf('500g chicken')).toBeLessThan(400);
  });
});

describe('a week of meals for the people cooking', () => {
  it('targets seven days each', () => {
    expect(portionTarget(1)).toBe(7);
    expect(portionTarget(2)).toBe(14);
  });

  it('spreads the target across the dishes there turn out to be', () => {
    expect(servingsPerDish(2, 5)).toBe(3);
    expect(servingsPerDish(1, 4)).toBe(2);
  });

  it('never asks a domestic pan for more than it can do', () => {
    expect(servingsPerDish(8, 1)).toBeLessThanOrEqual(12);
  });

  it('never plans a single portion of anything', () => {
    expect(servingsPerDish(1, 12)).toBeGreaterThanOrEqual(2);
  });
});

describe('what the model read, turned into a recipe', () => {
  const read = {
    isRecipe: true,
    title: 'Ginger chicken',
    kind: 'main' as const,
    yieldServings: 6,
    ingredients: [
      { name: 'chicken breast', quantity: 600, unit: 'g' as const, role: 'core' as const, optional: false },
      { name: 'scallions', role: 'aromatic' as const, optional: false },
    ],
    steps: [
      {
        text: 'Slice the chicken.', verb: 'slice' as const, durationMin: 5, activeMin: 5, finishMin: 0,
        equipment: ['cutting-board' as const, 'knife' as const], ingredientRefs: ['chicken breast'],
        taskClass: 'knife-work' as const, minSkill: 'beginner' as const, effort: 2 as const,
        optional: false, dependsOn: [],
      },
      {
        text: 'Fry it through.', verb: 'fry' as const, durationMin: 8, activeMin: 3, finishMin: 1,
        equipment: ['frying-pan' as const, 'burner' as const], ingredientRefs: ['chicken breast'],
        taskClass: 'stovetop' as const, minSkill: 'intermediate' as const, effort: 3 as const,
        optional: false, dependsOn: [0],
      },
    ],
    tags: ['asian'], allergens: [], keepsDays: 3, overnight: false,
  };
  const source = { url: 'https://example.com/ginger-chicken', siteName: 'example.com' };

  it('produces something the scheduler can hold', () => {
    const result = toRecipeFromModel(read, source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recipe.steps).toHaveLength(2);
    expect(result.recipe.source?.url).toBe(source.url);
  });

  it('turns step indices into real step ids', () => {
    const result = toRecipeFromModel(read, source);
    if (!result.ok) return;
    const [first, second] = result.recipe.steps;
    expect(second?.dependsOn).toEqual([first?.id]);
  });

  it('normalises ingredient names through the lexicon', () => {
    const result = toRecipeFromModel(read, source);
    if (!result.ok) return;
    expect(result.recipe.ingredients.map((i) => i.canonicalName)).toContain('spring onions');
  });

  it('holds the pan through the cooking and not the knife', () => {
    const result = toRecipeFromModel(read, source);
    if (!result.ok) return;
    const fry = result.recipe.steps[1]!;
    expect(fry.equipment.find((e) => e.kind === 'frying-pan')?.heldThroughHold).toBe(true);
    const slice = result.recipe.steps[0]!;
    expect(slice.equipment.find((e) => e.kind === 'knife')?.heldThroughHold).toBe(false);
  });

  it('drops a page the model said was not a recipe', () => {
    const result = toRecipeFromModel(
      { ...read, isRecipe: false, rejectedBecause: 'this is a round-up of 25 dinners' },
      source,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('round-up');
  });

  it('drops a recipe with no steps rather than scheduling nothing', () => {
    expect(toRecipeFromModel({ ...read, steps: [] }, source).ok).toBe(false);
  });

  it('keeps a short duration the page actually stated', () => {
    // "Simmer for two minutes until glossy" is a real instruction. The verb table's
    // twenty minutes is a default for when nothing said, and using it here would invent
    // eighteen minutes of waiting that the recipe never asked for.
    const quick = {
      ...read,
      steps: [{ ...read.steps[1]!, verb: 'simmer' as const, durationMin: 2, activeMin: 1, finishMin: 1 }],
    };
    const result = toRecipeFromModel(quick, source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recipe.steps[0]!.durationMin).toBe(2);
    expect(result.corrections).toEqual([]);
  });

  it('clamps effort rather than losing the whole recipe over one number', () => {
    const bold = { ...read, steps: [{ ...read.steps[0]!, effort: 5 }] };
    const result = toRecipeFromModel(bold, source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recipe.steps[0]!.effort).toBe(3);
  });

  it('pulls an implausible duration back to its verb and says it did', () => {
    const silly = { ...read, steps: [{ ...read.steps[0]!, durationMin: 400 }, read.steps[1]!] };
    const result = toRecipeFromModel(silly, source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recipe.steps[0]!.durationMin).toBeLessThan(400);
    expect(result.corrections.join(' ')).toMatch(/implausible|Step 1/);
  });

  it('trims hands-on time that does not fit inside the step', () => {
    const overfull = { ...read, steps: [{ ...read.steps[0]!, durationMin: 4, activeMin: 9, finishMin: 3 }] };
    const result = toRecipeFromModel(overfull, source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const step = result.recipe.steps[0]!;
    expect(step.activeMin + step.finishMin).toBeLessThanOrEqual(step.durationMin);
  });

  it('never lets a step depend on one that has not happened yet', () => {
    const forward = { ...read, steps: [{ ...read.steps[0]!, dependsOn: [1] }, read.steps[1]!] };
    const result = toRecipeFromModel(forward, source);
    if (!result.ok) return;
    expect(result.recipe.steps[0]!.dependsOn).toEqual([]);
  });
});

describe('the same dish under a different headline', () => {
  it('catches the four ways search returns one dinner', () => {
    const seen = 'Chicken Bok Choy Stir-Fry';
    for (const other of [
      'Chicken and Bok Choy Stir Fry',
      'Bok Choy Chicken',
      'Easy Low Carb Chicken and Bok Choy',
      'Quick Chicken Bok Choy Recipe',
    ]) {
      expect(tooSimilar(seen, other), other).toBe(true);
    }
  });

  it('lets genuinely different dishes through', () => {
    for (const [a, b] of [
      ['Chicken Bok Choy Stir-Fry', 'Lemon Mint Agua Fresca'],
      ['Ginger Garlic Chicken', 'Beef and Mushroom Noodles'],
      ['Overnight Cold Brew', 'Blanched Greens for the Week'],
      ['Chicken Stir Fry', 'Chicken Noodle Soup'],
    ] as [string, string][]) {
      expect(tooSimilar(a, b), `${a} vs ${b}`).toBe(false);
    }
  });

  it('is not fooled by the words every recipe headline carries', () => {
    // Nothing but filler in common, so nothing in common.
    expect(tooSimilar('Easy Quick Simple Recipe', 'Best Healthy Meal Prep')).toBe(false);
  });
});

describe('the stages fall back honestly', () => {
  it('L1 returns an empty fridge and says the recording could not be read', () => {
    const value = l1Intake.fallback({ wantsTranscript: 'x', pantryTranscript: 'y' }, 'no provider');
    expect(value.pantry).toEqual([]);
    expect(value.notes.join(' ')).toMatch(/could not be read/);
  });

  it('L2 still produces queries worth running', () => {
    const value = l2Queries.fallback(
      {
        wants: ['something with chicken'],
        pantry: [{ said: 'bok choy', urgency: 'use-today' }],
        cookCount: 2, restrictions: [], notes: [],
      },
      'no provider',
    );
    expect(value.queries.length).toBeGreaterThan(0);
    expect(value.queries.join(' ')).toContain('chicken');
  });

  it('L3 drops the page rather than inventing steps for it', () => {
    const value = l3Recipe.fallback(
      { page: { url: 'https://e.com/x', siteName: 'e.com', title: 'T', text: 'body' }, targetServings: 4 },
      'no provider',
    );
    expect(value.isRecipe).toBe(false);
    expect(value.steps).toEqual([]);
  });
});
