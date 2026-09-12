/**
 * Generates the bundled seed packs.
 *
 * Authored as a generator rather than by hand so that step ids, dependency wiring and the
 * active/passive split stay consistent across ~22 recipes. The output is plain JSON in
 * packages/recipes/src/seed/ -- that is what ships and what the registry loads.
 *
 * Run: node scripts/build-seed-packs.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'packages/recipes/src/seed');
mkdirSync(outDir, { recursive: true });

// -------------------------------------------------------------------- helpers

const slug = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'x';
const makeId = (...parts) => parts.map(slug).join(':');

/** Mirrors VERB_RULES in packages/domain/src/verb-ranges.ts; a test asserts they agree. */
const VERB = {
  wash: ['wash-produce', 'beginner', 1],
  peel: ['knife-work', 'beginner', 2],
  chop: ['knife-work', 'intermediate', 2],
  slice: ['knife-work', 'intermediate', 2],
  dice: ['knife-work', 'intermediate', 2],
  mince: ['knife-work', 'intermediate', 2],
  grate: ['knife-work', 'beginner', 2],
  marinate: ['marinate', 'beginner', 1],
  season: ['season-taste', 'intermediate', 1],
  mix: ['mix', 'beginner', 1],
  whisk: ['mix', 'beginner', 2],
  knead: ['mix', 'intermediate', 3],
  sear: ['stovetop', 'intermediate', 3],
  saute: ['stovetop', 'intermediate', 3],
  'stir-fry': ['stovetop', 'intermediate', 3],
  fry: ['stovetop', 'confident', 3],
  grill: ['oven', 'intermediate', 3],
  toast: ['stovetop', 'beginner', 1],
  boil: ['boil-water', 'beginner', 1],
  simmer: ['simmer-watch', 'beginner', 1],
  steam: ['simmer-watch', 'beginner', 1],
  braise: ['simmer-watch', 'intermediate', 2],
  reduce: ['simmer-watch', 'intermediate', 2],
  roast: ['oven', 'intermediate', 2],
  bake: ['oven', 'intermediate', 2],
  rest: ['chill', 'beginner', 1],
  cool: ['chill', 'beginner', 1],
  chill: ['chill', 'beginner', 1],
  freeze: ['chill', 'beginner', 1],
  thaw: ['chill', 'beginner', 1],
  steep: ['steep', 'beginner', 1],
  brew: ['boil-water', 'beginner', 1],
  infuse: ['steep', 'beginner', 1],
  juice: ['strain', 'beginner', 2],
  blend: ['blend', 'beginner', 2],
  strain: ['strain', 'beginner', 1],
  portion: ['portion', 'beginner', 1],
  label: ['label', 'beginner', 1],
  assemble: ['assemble', 'beginner', 1],
  garnish: ['garnish', 'beginner', 1],
  'wash-up': ['wash-up', 'beginner', 2],
};

const CATEGORY = {
  'chicken breast': 'protein-raw',
  'ground beef': 'protein-raw',
  salmon: 'protein-raw',
  eggs: 'protein-raw',
  'jasmine rice': 'grain',
  tomatoes: 'produce',
  mushrooms: 'produce',
  'bok choy': 'produce',
  'bell peppers': 'produce',
  lemons: 'produce',
  mint: 'produce',
  garlic: 'aromatic',
  ginger: 'aromatic',
  'spring onions': 'aromatic',
  'soy sauce': 'pantry',
  'cooking wine': 'pantry',
  'sesame oil': 'pantry',
  'neutral oil': 'pantry',
  salt: 'pantry',
  sugar: 'pantry',
  water: 'pantry',
  cornstarch: 'pantry',
  'chilli flakes': 'pantry',
  honey: 'pantry',
  'coffee beans': 'beverage-base',
  'black pepper': 'pantry',
  turmeric: 'aromatic',
};

const STAPLES = new Set([
  'salt', 'sugar', 'water', 'neutral oil', 'black pepper', 'cornstarch', 'chilli flakes', 'honey',
]);

/** held: occupies the equipment through the passive stretch too. */
const held = (...kinds) => kinds.map((kind) => ({ kind, count: 1, heldThroughHold: true }));
const tool = (...kinds) => kinds.map((kind) => ({ kind, count: 1, heldThroughHold: false }));

function ing(name, quantity, unit, opts = {}) {
  const category = CATEGORY[name];
  if (!category) throw new Error(`no category for ingredient "${name}"`);
  return {
    canonicalName: name,
    ...(quantity !== undefined && quantity !== null ? { quantity } : {}),
    ...(unit ? { unit } : {}),
    role: opts.role ?? (STAPLES.has(name) ? 'pantry' : 'core'),
    category,
    optional: opts.optional ?? false,
    substitutes: opts.substitutes ?? [],
  };
}

function step(verb, text, spec) {
  const rule = VERB[verb];
  if (!rule) throw new Error(`unknown verb "${verb}"`);
  const [taskClass, minSkill, effort] = rule;
  const { dur, active, finish = 0 } = spec;
  if (active + finish > dur) throw new Error(`step "${text}" over-allocates its duration`);
  return {
    verb,
    text,
    durationMin: dur,
    activeMin: active,
    finishMin: finish,
    equipment: spec.equipment ?? [],
    ingredientRefs: spec.refs ?? [],
    taskClass,
    minSkill: spec.minSkill ?? minSkill,
    effort: spec.effort ?? effort,
    optional: spec.optional ?? false,
    _deps: spec.after ?? [],
    ...(spec.minDelay !== undefined ? { minDelayAfterMin: spec.minDelay } : {}),
    ...(spec.maxDelay !== undefined ? { maxDelayAfterMin: spec.maxDelay } : {}),
    ...(spec.heat ? { heat: spec.heat } : {}),
    ...(spec.note ? { note: spec.note } : {}),
  };
}

/**
 * `after` in a step refers to earlier steps by index. This resolves those to ids and
 * defaults to a linear chain when nothing is declared -- most recipes really are linear,
 * and the few that fork say so explicitly.
 */
function recipe(spec) {
  const id = makeId('rcp', spec.id);
  const steps = spec.steps.map((s, i) => {
    const { _deps, ...rest } = s;
    const deps = _deps.length > 0 ? _deps : i > 0 ? [i - 1] : [];
    for (const d of deps) {
      if (d >= i) throw new Error(`${spec.id} step ${i} depends on a later step ${d}`);
    }
    return { id: makeId('step', id, i), ...rest, dependsOn: deps.map((d) => makeId('step', id, d)) };
  });
  return {
    id,
    title: spec.title,
    kind: spec.kind,
    yieldServings: spec.servings,
    ingredients: spec.ingredients,
    steps,
    tags: spec.tags ?? [],
    allergens: spec.allergens ?? [],
    dietary: spec.dietary ?? [],
    keepsDays: spec.keepsDays ?? 4,
    overnight: spec.overnight ?? false,
  };
}

// FNV-1a over canonical JSON, matching contentHash() in packages/domain/src/ids.ts.
const canonicalJson = (v) => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(v)
    .filter(([, x]) => x !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${canonicalJson(x)}`).join(',')}}`;
};
const stableHash = (input) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};
const contentHash = (v) => `fnv1a-${stableHash(canonicalJson(v))}`;

function pack(packId, name, description, recipes, tags = {}) {
  const body = {
    packId,
    version: '1.0.0',
    contentHash: contentHash(recipes),
    name,
    description,
    locale: 'en-US',
    provenance: 'seed',
    recipes,
    ...tags,
  };
  writeFileSync(path.join(outDir, `${packId}.json`), JSON.stringify(body, null, 1) + '\n');
  return body;
}

// ============================================================ 1. asian mains

const chickenStirFry = recipe({
  id: 'ginger-garlic-chicken',
  title: 'Ginger-garlic chicken with peppers',
  kind: 'main',
  servings: 4,
  tags: ['asian', 'stir-fry', 'chicken'],
  allergens: ['soy', 'sesame'],
  ingredients: [
    ing('chicken breast', 600, 'g'),
    ing('bell peppers', 2, 'piece'),
    ing('garlic', 4, 'clove'),
    ing('ginger', 20, 'g'),
    ing('soy sauce', 3, 'tbsp'),
    ing('cooking wine', 2, 'tbsp'),
    ing('sesame oil', 1, 'tbsp'),
    ing('cornstarch', 2, 'tsp'),
    ing('neutral oil', 2, 'tbsp'),
  ],
  steps: [
    step('slice', 'Slice the chicken into thin strips', {
      dur: 7, active: 7, equipment: tool('cutting-board', 'knife'),
      refs: ['chicken breast'], minSkill: 'intermediate',
    }),
    step('marinate', 'Toss the chicken with soy sauce, wine and cornstarch and leave it', {
      dur: 15, active: 3, equipment: held('mixing-bowl'),
      refs: ['chicken breast', 'soy sauce', 'cooking wine', 'cornstarch'],
    }),
    step('mince', 'Mince the garlic and ginger', {
      dur: 4, active: 4, equipment: tool('cutting-board', 'knife'),
      refs: ['garlic', 'ginger'], after: [],
    }),
    step('slice', 'Slice the peppers', {
      dur: 4, active: 4, equipment: tool('cutting-board', 'knife'),
      refs: ['bell peppers'], after: [],
    }),
    step('stir-fry', 'Stir-fry the chicken hard until it colours', {
      dur: 7, active: 7, equipment: held('frying-pan', 'burner'),
      refs: ['chicken breast', 'neutral oil'], after: [1, 2], heat: { level: 'high' },
    }),
    step('stir-fry', 'Add the peppers and aromatics and toss through', {
      dur: 4, active: 4, equipment: held('frying-pan', 'burner'),
      refs: ['bell peppers', 'garlic', 'ginger', 'sesame oil'], after: [3, 4], heat: { level: 'high' },
    }),
  ],
});

const beefMushroom = recipe({
  id: 'beef-mushroom-stirfry',
  title: 'Beef and mushroom stir-fry',
  kind: 'main',
  servings: 4,
  tags: ['asian', 'stir-fry', 'beef'],
  allergens: ['soy'],
  ingredients: [
    ing('ground beef', 500, 'g'),
    ing('mushrooms', 300, 'g'),
    ing('garlic', 3, 'clove'),
    ing('soy sauce', 2, 'tbsp'),
    ing('neutral oil', 1, 'tbsp'),
    ing('black pepper', 1, 'tsp'),
  ],
  steps: [
    step('slice', 'Slice the mushrooms thickly', {
      dur: 5, active: 5, equipment: tool('cutting-board', 'knife'), refs: ['mushrooms'],
    }),
    step('mince', 'Mince the garlic', {
      dur: 2, active: 2, equipment: tool('cutting-board', 'knife'), refs: ['garlic'], after: [0],
    }),
    step('sear', 'Brown the beef in a dry hot pan, breaking it up', {
      dur: 8, active: 8, equipment: held('frying-pan', 'burner'),
      refs: ['ground beef'], after: [], heat: { level: 'high' },
    }),
    step('stir-fry', 'Add mushrooms and garlic and cook until they give up their water', {
      dur: 6, active: 6, equipment: held('frying-pan', 'burner'),
      refs: ['mushrooms', 'garlic', 'soy sauce', 'black pepper'], after: [1, 2],
    }),
  ],
});

const soyGingerSalmon = recipe({
  id: 'soy-ginger-salmon',
  title: 'Soy-ginger salmon',
  kind: 'main',
  servings: 4,
  tags: ['asian', 'fish'],
  allergens: ['fish', 'soy'],
  keepsDays: 2,
  ingredients: [
    ing('salmon', 4, 'piece'),
    ing('ginger', 15, 'g'),
    ing('soy sauce', 2, 'tbsp'),
    ing('cooking wine', 1, 'tbsp'),
    ing('honey', 1, 'tsp'),
    ing('neutral oil', 1, 'tbsp'),
  ],
  steps: [
    step('grate', 'Grate the ginger', {
      dur: 2, active: 2, equipment: tool('grater', 'mixing-bowl'), refs: ['ginger'],
    }),
    step('mix', 'Stir the ginger, soy, wine and honey into a glaze', {
      dur: 2, active: 2, equipment: tool('mixing-bowl'),
      refs: ['ginger', 'soy sauce', 'cooking wine', 'honey'], after: [0],
    }),
    step('sear', 'Sear the salmon skin-side down, then turn', {
      dur: 9, active: 9, equipment: held('frying-pan', 'burner'),
      refs: ['salmon', 'neutral oil'], after: [], heat: { level: 'medium' },
    }),
    step('reduce', 'Spoon over the glaze and let it thicken around the fish', {
      dur: 3, active: 2, finish: 1, equipment: held('frying-pan', 'burner'),
      refs: ['salmon'], after: [1, 2],
    }),
    step('rest', 'Let the salmon rest before it is moved', {
      dur: 4, active: 0, equipment: [], refs: ['salmon'], after: [3], minDelay: 0, maxDelay: 15,
      note: 'Rest at least a few minutes, and get it cold within the hour.',
    }),
  ],
});

const garlicBokChoy = recipe({
  id: 'garlic-bok-choy',
  title: 'Garlic bok choy',
  kind: 'side',
  servings: 4,
  tags: ['asian', 'greens', 'fast'],
  allergens: ['sesame'],
  ingredients: [
    ing('bok choy', 500, 'g'),
    ing('garlic', 3, 'clove'),
    ing('sesame oil', 1, 'tbsp'),
    ing('salt', 1, 'tsp'),
  ],
  steps: [
    step('wash', 'Wash the bok choy and shake it dry', {
      dur: 4, active: 4, equipment: tool('colander', 'sink'), refs: ['bok choy'], minSkill: 'beginner',
    }),
    step('chop', 'Halve the bok choy lengthways', {
      dur: 3, active: 3, equipment: tool('cutting-board', 'knife'), refs: ['bok choy'], after: [0],
    }),
    step('mince', 'Mince the garlic', {
      dur: 2, active: 2, equipment: tool('cutting-board', 'knife'), refs: ['garlic'], after: [],
    }),
    step('steam', 'Steam the greens until the stems just give', {
      dur: 6, active: 1, finish: 1, equipment: held('pot', 'burner'), refs: ['bok choy'], after: [1],
    }),
    step('mix', 'Dress with garlic, sesame oil and salt', {
      dur: 2, active: 2, equipment: tool('mixing-bowl'),
      refs: ['garlic', 'sesame oil', 'salt'], after: [2, 3],
    }),
  ],
});

const tomatoEgg = recipe({
  id: 'tomato-egg',
  title: 'Tomato and egg',
  kind: 'main',
  servings: 4,
  tags: ['asian', 'fast', 'vegetarian'],
  allergens: ['egg'],
  dietary: ['vegetarian'],
  ingredients: [
    ing('tomatoes', 5, 'piece'),
    ing('eggs', 6, 'piece'),
    ing('spring onions', 2, 'stalk', { optional: true }),
    ing('sesame oil', 1, 'tsp'),
    ing('sugar', 1, 'tsp'),
    ing('salt', 1, 'tsp'),
    ing('neutral oil', 2, 'tbsp'),
  ],
  steps: [
    step('chop', 'Cut the tomatoes into wedges', {
      dur: 4, active: 4, equipment: tool('cutting-board', 'knife'), refs: ['tomatoes'],
    }),
    step('whisk', 'Beat the eggs with a pinch of salt', {
      dur: 2, active: 2, equipment: tool('mixing-bowl'), refs: ['eggs', 'salt'], after: [],
    }),
    step('stir-fry', 'Scramble the eggs in hot oil and lift them out while soft', {
      dur: 4, active: 4, equipment: held('frying-pan', 'burner'),
      refs: ['eggs', 'neutral oil'], after: [1], heat: { level: 'high' },
    }),
    step('saute', 'Cook the tomatoes down with the sugar until saucy', {
      dur: 6, active: 6, equipment: held('frying-pan', 'burner'),
      refs: ['tomatoes', 'sugar'], after: [0, 2],
    }),
    step('mix', 'Fold the eggs back through and finish with sesame oil', {
      dur: 2, active: 2, equipment: held('frying-pan', 'burner'),
      refs: ['eggs', 'sesame oil'], after: [3],
    }),
    step('garnish', 'Scatter over the spring onion', {
      dur: 1, active: 1, equipment: [], refs: ['spring onions'], after: [4], optional: true,
    }),
  ],
});

// ================================================================ 2. bases

const jasmineRice = recipe({
  id: 'jasmine-rice',
  title: 'Steamed jasmine rice',
  kind: 'base',
  servings: 6,
  tags: ['base', 'grain', 'batch'],
  keepsDays: 4,
  ingredients: [ing('jasmine rice', 400, 'g'), ing('water', 600, 'ml')],
  steps: [
    step('wash', 'Rinse the rice until the water runs clear', {
      dur: 3, active: 3, equipment: tool('colander', 'sink'), refs: ['jasmine rice'],
    }),
    step('simmer', 'Bring to a boil, then leave it covered on the lowest heat', {
      dur: 25, active: 2, finish: 1, equipment: held('saucepan', 'burner'),
      refs: ['jasmine rice', 'water'], after: [0],
      note: 'The 22 passive minutes here are the single biggest parallelism window in most sessions.',
    }),
    step('rest', 'Let it stand off the heat, still covered', {
      dur: 5, active: 0, equipment: held('saucepan'), refs: ['jasmine rice'], after: [1],
    }),
  ],
});

const softEggs = recipe({
  id: 'soft-boiled-eggs',
  title: 'Batch soft-boiled eggs',
  kind: 'base',
  servings: 6,
  tags: ['base', 'batch', 'breakfast'],
  allergens: ['egg'],
  keepsDays: 5,
  ingredients: [ing('eggs', 6, 'piece'), ing('water', 1, 'l')],
  steps: [
    step('boil', 'Lower the eggs into boiling water and set a timer', {
      dur: 9, active: 2, finish: 1, equipment: held('saucepan', 'burner'), refs: ['eggs', 'water'],
    }),
    step('cool', 'Drop them into cold water to stop the cooking', {
      dur: 6, active: 0, equipment: held('mixing-bowl'), refs: ['eggs'], after: [0], maxDelay: 2,
      note: 'Straight into cold water, or the yolks keep going.',
    }),
  ],
});

const blanchedGreens = recipe({
  id: 'blanched-greens',
  title: 'Blanched greens for the week',
  kind: 'base',
  servings: 6,
  tags: ['base', 'batch', 'greens'],
  keepsDays: 3,
  ingredients: [ing('bok choy', 600, 'g'), ing('water', 2, 'l'), ing('salt', 1, 'tbsp')],
  steps: [
    step('wash', 'Wash the greens', {
      dur: 4, active: 4, equipment: tool('colander', 'sink'), refs: ['bok choy'],
    }),
    step('boil', 'Blanch them in salted water until just bright', {
      dur: 6, active: 2, finish: 1, equipment: held('saucepan', 'burner'),
      refs: ['bok choy', 'water', 'salt'], after: [0],
    }),
    step('cool', 'Spread them out to stop cooking', {
      dur: 5, active: 0, equipment: [], refs: ['bok choy'], after: [1], maxDelay: 2,
    }),
  ],
});

const charredPeppers = recipe({
  id: 'charred-peppers',
  title: 'Charred peppers',
  kind: 'base',
  servings: 6,
  tags: ['base', 'batch', 'no-oven'],
  keepsDays: 5,
  ingredients: [ing('bell peppers', 4, 'piece'), ing('neutral oil', 1, 'tbsp'), ing('salt', 1, 'tsp')],
  steps: [
    step('slice', 'Cut the peppers into broad flat pieces', {
      dur: 5, active: 5, equipment: tool('cutting-board', 'knife'), refs: ['bell peppers'],
    }),
    step('sear', 'Char them hard in a dry pan, skin down, without moving them', {
      dur: 10, active: 10, equipment: held('frying-pan', 'burner'),
      refs: ['bell peppers', 'neutral oil'], after: [0], heat: { level: 'high' },
    }),
    step('rest', 'Cover them and let the skins loosen', {
      dur: 8, active: 0, equipment: held('mixing-bowl'), refs: ['bell peppers'], after: [1],
    }),
  ],
});

// ================================================================ 3. sauces

const soyGingerSauce = recipe({
  id: 'soy-ginger-sauce',
  title: 'Soy-ginger sauce',
  kind: 'sauce',
  servings: 8,
  tags: ['sauce', 'no-heat', 'beginner'],
  allergens: ['soy', 'sesame'],
  keepsDays: 10,
  ingredients: [
    ing('soy sauce', 60, 'ml'), ing('ginger', 20, 'g'), ing('garlic', 2, 'clove'),
    ing('sesame oil', 2, 'tsp'), ing('sugar', 1, 'tsp'),
  ],
  steps: [
    step('grate', 'Grate the ginger and garlic straight into a jar', {
      dur: 3, active: 3, equipment: tool('grater', 'jar'), refs: ['ginger', 'garlic'],
    }),
    step('mix', 'Add soy, sesame oil and sugar and shake', {
      dur: 2, active: 2, equipment: tool('jar'),
      refs: ['soy sauce', 'sesame oil', 'sugar'], after: [0],
    }),
  ],
});

const garlicSesame = recipe({
  id: 'garlic-sesame-sauce',
  title: 'Garlic-sesame sauce',
  kind: 'sauce',
  servings: 8,
  tags: ['sauce', 'no-heat', 'beginner'],
  allergens: ['soy', 'sesame'],
  keepsDays: 7,
  ingredients: [
    ing('garlic', 4, 'clove'), ing('sesame oil', 3, 'tbsp'),
    ing('soy sauce', 2, 'tbsp'), ing('salt', 1, 'tsp'),
  ],
  steps: [
    step('mince', 'Mince the garlic fine', {
      dur: 3, active: 3, equipment: tool('cutting-board', 'knife'), refs: ['garlic'],
    }),
    step('mix', 'Stir it through the oil, soy and salt', {
      dur: 2, active: 2, equipment: tool('jar'),
      refs: ['sesame oil', 'soy sauce', 'salt'], after: [0],
    }),
  ],
});

const chilliOil = recipe({
  id: 'chilli-garlic-oil',
  title: 'Chilli-garlic oil',
  kind: 'sauce',
  servings: 10,
  tags: ['sauce', 'condiment'],
  allergens: ['sesame'],
  keepsDays: 21,
  ingredients: [
    ing('garlic', 5, 'clove'), ing('chilli flakes', 3, 'tbsp'),
    ing('neutral oil', 120, 'ml'), ing('sesame oil', 1, 'tbsp'), ing('salt', 1, 'tsp'),
  ],
  steps: [
    step('mince', 'Mince the garlic', {
      dur: 3, active: 3, equipment: tool('cutting-board', 'knife'), refs: ['garlic'],
    }),
    step('toast', 'Warm the oil until it shimmers, then take it off', {
      dur: 5, active: 2, finish: 1, equipment: held('saucepan', 'burner'), refs: ['neutral oil'], after: [],
    }),
    step('mix', 'Pour the hot oil over the chilli and garlic', {
      dur: 2, active: 2, equipment: tool('jar'),
      refs: ['chilli flakes', 'garlic', 'sesame oil', 'salt'], after: [0, 1], maxDelay: 3,
    }),
    step('cool', 'Let it come down to room temperature before it is closed', {
      dur: 12, active: 0, equipment: held('jar'), refs: [], after: [2],
    }),
  ],
});

const scallionGinger = recipe({
  id: 'scallion-ginger-oil',
  title: 'Scallion-ginger oil',
  kind: 'sauce',
  servings: 8,
  tags: ['sauce', 'condiment'],
  allergens: ['sesame'],
  keepsDays: 7,
  ingredients: [
    ing('spring onions', 4, 'stalk'), ing('ginger', 30, 'g'),
    ing('neutral oil', 80, 'ml'), ing('sesame oil', 1, 'tsp'), ing('salt', 1, 'tsp'),
  ],
  steps: [
    step('slice', 'Slice the spring onions and ginger very fine', {
      dur: 5, active: 5, equipment: tool('cutting-board', 'knife'), refs: ['spring onions', 'ginger'],
    }),
    step('toast', 'Heat the oil until it just moves', {
      dur: 4, active: 2, finish: 1, equipment: held('saucepan', 'burner'), refs: ['neutral oil'], after: [],
    }),
    step('mix', 'Pour it over and season', {
      dur: 2, active: 2, equipment: tool('jar'),
      refs: ['sesame oil', 'salt'], after: [0, 1], maxDelay: 3,
    }),
  ],
});

const lemonMintDressing = recipe({
  id: 'lemon-mint-dressing',
  title: 'Lemon-mint dressing',
  kind: 'sauce',
  servings: 8,
  tags: ['sauce', 'no-heat', 'beginner', 'fresh'],
  keepsDays: 4,
  ingredients: [
    ing('lemons', 2, 'piece'), ing('mint', 1, 'bunch'),
    ing('neutral oil', 60, 'ml'), ing('honey', 1, 'tsp'), ing('salt', 1, 'tsp'),
  ],
  steps: [
    step('juice', 'Juice the lemons', {
      dur: 4, active: 4, equipment: tool('measuring-cup'), refs: ['lemons'],
    }),
    step('chop', 'Chop the mint', {
      dur: 3, active: 3, equipment: tool('cutting-board', 'knife'), refs: ['mint'], after: [],
    }),
    step('whisk', 'Whisk everything together', {
      dur: 3, active: 3, equipment: tool('mixing-bowl'),
      refs: ['neutral oil', 'honey', 'salt'], after: [0, 1],
    }),
  ],
});

// ============================================================= 4. beverages

const coldBrew = recipe({
  id: 'cold-brew-coffee',
  title: 'Overnight cold brew',
  kind: 'beverage',
  servings: 6,
  tags: ['beverage', 'batch', 'overnight', 'caffeine'],
  overnight: true,
  keepsDays: 10,
  ingredients: [ing('coffee beans', 120, 'g'), ing('water', 1, 'l')],
  steps: [
    step('chop', 'Grind the beans coarse', {
      dur: 3, active: 3, equipment: tool('blender'), refs: ['coffee beans'], minSkill: 'beginner',
    }),
    step('mix', 'Stir the grounds into cold water in a jar', {
      dur: 2, active: 2, equipment: tool('jar'), refs: ['coffee beans', 'water'], after: [0],
    }),
    step('steep', 'Leave it in the fridge overnight', {
      dur: 720, active: 0, equipment: held('jar', 'fridge-shelf'), refs: [], after: [1],
      note: 'Starts tonight, finishes tomorrow. The session does not wait for it.',
    }),
    step('strain', 'Strain out the grounds in the morning', {
      dur: 4, active: 4, equipment: tool('colander', 'pitcher'), refs: ['coffee beans'], after: [2],
    }),
  ],
});

const mintLemonade = recipe({
  id: 'mint-lemonade',
  title: 'Mint lemonade',
  kind: 'beverage',
  servings: 6,
  tags: ['beverage', 'batch', 'fresh', 'no-heat'],
  keepsDays: 4,
  ingredients: [
    ing('lemons', 5, 'piece'), ing('mint', 1, 'bunch'),
    ing('sugar', 80, 'g'), ing('water', 1, 'l'),
  ],
  steps: [
    step('juice', 'Juice the lemons', {
      dur: 6, active: 6, equipment: tool('measuring-cup'), refs: ['lemons'], minSkill: 'beginner',
    }),
    step('mix', 'Muddle the mint with the sugar', {
      dur: 3, active: 3, equipment: tool('mixing-bowl'), refs: ['mint', 'sugar'], after: [],
    }),
    step('infuse', 'Add water and let the mint give up its oils', {
      dur: 18, active: 2, finish: 1, equipment: held('pitcher'),
      refs: ['water'], after: [0, 1],
    }),
    step('strain', 'Strain out the leaves', {
      dur: 3, active: 3, equipment: tool('colander', 'pitcher'), refs: ['mint'], after: [2],
    }),
  ],
});

const gingerTonic = recipe({
  id: 'ginger-lemon-tonic',
  title: 'Ginger-turmeric tonic',
  kind: 'beverage',
  servings: 6,
  tags: ['beverage', 'batch', 'warming'],
  keepsDays: 5,
  ingredients: [
    ing('ginger', 60, 'g'), ing('turmeric', 10, 'g', { optional: true }),
    ing('lemons', 2, 'piece'), ing('honey', 2, 'tbsp'), ing('water', 1, 'l'),
  ],
  steps: [
    step('grate', 'Grate the ginger and turmeric', {
      dur: 4, active: 4, equipment: tool('grater', 'mixing-bowl'), refs: ['ginger', 'turmeric'],
    }),
    step('simmer', 'Simmer them in water, then leave it alone', {
      dur: 16, active: 1, finish: 1, equipment: held('saucepan', 'burner'),
      refs: ['ginger', 'water'], after: [0],
    }),
    step('juice', 'Juice the lemons while it simmers', {
      dur: 3, active: 3, equipment: tool('measuring-cup'), refs: ['lemons'], after: [],
    }),
    step('strain', 'Strain into a jug and stir in lemon and honey', {
      dur: 4, active: 4, equipment: tool('colander', 'pitcher'),
      refs: ['lemons', 'honey'], after: [1, 2],
    }),
    step('cool', 'Let it come down before it goes cold', {
      dur: 12, active: 0, equipment: held('pitcher'), refs: [], after: [3],
    }),
  ],
});

const lemonMintFresca = recipe({
  id: 'lemon-mint-agua-fresca',
  title: 'Lemon-mint agua fresca',
  kind: 'beverage',
  servings: 6,
  tags: ['beverage', 'batch', 'fresh', 'no-heat', 'fast'],
  keepsDays: 3,
  ingredients: [
    ing('lemons', 4, 'piece'), ing('mint', 1, 'bunch'),
    ing('sugar', 50, 'g'), ing('water', 1, 'l'),
  ],
  steps: [
    step('juice', 'Juice the lemons', {
      dur: 5, active: 5, equipment: tool('measuring-cup'), refs: ['lemons'],
    }),
    step('blend', 'Blend the mint with water and sugar', {
      dur: 3, active: 3, equipment: tool('blender'), refs: ['mint', 'water', 'sugar'], after: [0],
    }),
    step('strain', 'Strain into a jug', {
      dur: 3, active: 3, equipment: tool('colander', 'pitcher'), refs: [], after: [1],
    }),
  ],
});

// ============================================================ 5. fast mains

const eggFriedRice = recipe({
  id: 'garlic-egg-fried-rice',
  title: 'Garlic egg fried rice',
  kind: 'main',
  servings: 4,
  tags: ['fast', 'asian', 'leftovers'],
  allergens: ['egg', 'soy'],
  ingredients: [
    ing('jasmine rice', 500, 'g'), ing('eggs', 3, 'piece'), ing('garlic', 3, 'clove'),
    ing('soy sauce', 2, 'tbsp'), ing('neutral oil', 2, 'tbsp'), ing('spring onions', 2, 'stalk', { optional: true }),
  ],
  steps: [
    step('mince', 'Mince the garlic', {
      dur: 2, active: 2, equipment: tool('cutting-board', 'knife'), refs: ['garlic'],
    }),
    step('whisk', 'Beat the eggs', {
      dur: 1, active: 1, equipment: tool('mixing-bowl'), refs: ['eggs'], after: [],
    }),
    step('stir-fry', 'Fry the garlic, add the rice and eggs, and keep it moving', {
      dur: 6, active: 6, equipment: held('frying-pan', 'burner'),
      refs: ['jasmine rice', 'eggs', 'garlic', 'soy sauce', 'neutral oil'], after: [0, 1],
      heat: { level: 'high' },
    }),
  ],
});

const beefPepperSkillet = recipe({
  id: 'beef-pepper-skillet',
  title: 'Beef and pepper skillet',
  kind: 'main',
  servings: 4,
  tags: ['fast', 'beef'],
  allergens: ['soy'],
  ingredients: [
    ing('ground beef', 500, 'g'), ing('bell peppers', 2, 'piece'),
    ing('soy sauce', 2, 'tbsp'), ing('black pepper', 1, 'tsp'), ing('neutral oil', 1, 'tbsp'),
  ],
  steps: [
    step('slice', 'Slice the peppers', {
      dur: 4, active: 4, equipment: tool('cutting-board', 'knife'), refs: ['bell peppers'],
    }),
    step('sear', 'Brown the beef, then add the peppers', {
      dur: 9, active: 9, equipment: held('frying-pan', 'burner'),
      refs: ['ground beef', 'bell peppers', 'soy sauce', 'black pepper', 'neutral oil'], after: [0],
    }),
  ],
});

const salmonBowl = recipe({
  id: 'salmon-flake-bowl',
  title: 'Salmon flake bowl',
  kind: 'main',
  servings: 4,
  tags: ['fast', 'fish', 'bowl'],
  allergens: ['fish', 'soy'],
  keepsDays: 2,
  ingredients: [
    ing('salmon', 3, 'piece'), ing('jasmine rice', 400, 'g'),
    ing('soy sauce', 2, 'tbsp'), ing('sesame oil', 1, 'tsp'), ing('neutral oil', 1, 'tbsp'),
  ],
  steps: [
    step('sear', 'Cook the salmon through in a pan', {
      dur: 9, active: 9, equipment: held('frying-pan', 'burner'), refs: ['salmon', 'neutral oil'],
    }),
    step('mix', 'Flake it and dress it with soy and sesame oil', {
      dur: 3, active: 3, equipment: tool('mixing-bowl'),
      refs: ['salmon', 'soy sauce', 'sesame oil'], after: [0],
    }),
    step('assemble', 'Spoon it over rice', {
      dur: 3, active: 3, equipment: tool('storage-container'), refs: ['jasmine rice'], after: [1],
    }),
  ],
});

const mushroomScramble = recipe({
  id: 'mushroom-scramble',
  title: 'Mushroom scramble',
  kind: 'main',
  servings: 4,
  tags: ['fast', 'vegetarian', 'breakfast'],
  allergens: ['egg'],
  dietary: ['vegetarian'],
  ingredients: [
    ing('mushrooms', 250, 'g'), ing('eggs', 6, 'piece'),
    ing('salt', 1, 'tsp'), ing('neutral oil', 1, 'tbsp'),
  ],
  steps: [
    step('slice', 'Slice the mushrooms', {
      dur: 4, active: 4, equipment: tool('cutting-board', 'knife'), refs: ['mushrooms'],
    }),
    step('saute', 'Cook them down until they colour', {
      dur: 6, active: 6, equipment: held('frying-pan', 'burner'),
      refs: ['mushrooms', 'neutral oil'], after: [0],
    }),
    step('stir-fry', 'Add the beaten eggs and scramble softly', {
      dur: 3, active: 3, equipment: held('frying-pan', 'burner'),
      refs: ['eggs', 'salt'], after: [1], heat: { level: 'low' },
    }),
  ],
});

// ================================================================== emit

const packs = [
  pack('seed-asian-weeknight', 'Weeknight Asian staples',
    'Mains and a side built on a soy, ginger and garlic pantry.',
    [chickenStirFry, beefMushroom, soyGingerSalmon, garlicBokChoy, tomatoEgg]),
  pack('seed-bases', 'Batch bases',
    'Grains, eggs and greens with long passive windows and high reuse across the week.',
    [jasmineRice, softEggs, blanchedGreens, charredPeppers]),
  pack('seed-sauces', 'Sauces and condiments',
    'Ambient, short, and almost free of burner contention. The best work to hand a beginner.',
    [soyGingerSauce, garlicSesame, chilliOil, scallionGinger, lemonMintDressing]),
  pack('seed-beverages', 'Batch beverages',
    'Drinks by the jug, including one that starts tonight and is ready tomorrow.',
    [coldBrew, mintLemonade, gingerTonic, lemonMintFresca]),
  pack('seed-fast-mains', 'Fast mains',
    'Short mains the compiler can substitute in when the session will not fit.',
    [eggFriedRice, beefPepperSkillet, salmonBowl, mushroomScramble]),
];

const total = packs.reduce((n, p) => n + p.recipes.length, 0);
console.log(`wrote ${packs.length} seed packs, ${total} recipes`);
for (const p of packs) {
  const kinds = {};
  for (const r of p.recipes) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
  console.log(`  ${p.packId.padEnd(22)} ${p.contentHash}  ${JSON.stringify(kinds)}`);
}
