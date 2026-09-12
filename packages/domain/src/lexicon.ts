import type { Allergen, IngredientCategory, Unit } from './primitives';

/**
 * The canonical ingredient lexicon.
 *
 * Its job is to normalize without erasing. "Scallions" becomes "spring onions"; "yu choy"
 * becomes "yu choy", marked unrecognised, with a best guess at its category — because the
 * alternative is either dropping it or quietly turning it into bok choy, and both of those
 * end with the user staring at a plan built on food they do not have.
 */
export type LexiconEntry = {
  canonicalName: string;
  category: IngredientCategory;
  synonyms: readonly string[];
  typicalUnit?: Unit;
  allergens?: readonly Allergen[];
  /** Roughly how fast it goes off, in days. Drives the default urgency. */
  keepsDays?: number;
};

const E = (
  canonicalName: string,
  category: IngredientCategory,
  synonyms: readonly string[] = [],
  extra: Partial<LexiconEntry> = {},
): LexiconEntry => ({ canonicalName, category, synonyms, ...extra });

export const LEXICON: readonly LexiconEntry[] = [
  // ------------------------------------------------------------- proteins
  E('chicken breast', 'protein-raw', ['chicken', 'chicken breasts', 'chicken fillet', 'chicken fillets'], { typicalUnit: 'g', keepsDays: 2 }),
  E('chicken thighs', 'protein-raw', ['chicken thigh', 'thighs'], { typicalUnit: 'g', keepsDays: 2 }),
  E('ground beef', 'protein-raw', ['beef mince', 'minced beef', 'mince', 'hamburger meat', 'beef'], { typicalUnit: 'g', keepsDays: 2 }),
  E('ground pork', 'protein-raw', ['pork mince', 'minced pork'], { typicalUnit: 'g', keepsDays: 2 }),
  E('salmon', 'protein-raw', ['salmon fillet', 'salmon fillets', 'salmon steaks'], { typicalUnit: 'piece', allergens: ['fish'], keepsDays: 1 }),
  E('white fish', 'protein-raw', ['cod', 'haddock', 'basa', 'tilapia'], { typicalUnit: 'piece', allergens: ['fish'], keepsDays: 1 }),
  E('prawns', 'protein-raw', ['shrimp', 'prawn'], { typicalUnit: 'g', allergens: ['shellfish'], keepsDays: 1 }),
  E('eggs', 'protein-raw', ['egg'], { typicalUnit: 'piece', allergens: ['egg'], keepsDays: 21 }),
  E('tofu', 'protein-raw', ['bean curd'], { typicalUnit: 'g', allergens: ['soy'], keepsDays: 5 }),

  // --------------------------------------------------------------- grains
  E('jasmine rice', 'grain', ['rice', 'white rice', 'long grain rice', 'basmati', 'basmati rice'], { typicalUnit: 'g', keepsDays: 365 }),
  E('noodles', 'grain', ['egg noodles', 'ramen', 'rice noodles', 'udon'], { typicalUnit: 'g', allergens: ['gluten'], keepsDays: 180 }),
  E('pasta', 'grain', ['spaghetti', 'penne', 'macaroni'], { typicalUnit: 'g', allergens: ['gluten'], keepsDays: 365 }),
  E('bread', 'grain', ['loaf', 'sliced bread', 'toast'], { typicalUnit: 'slice', allergens: ['gluten'], keepsDays: 4 }),
  E('quinoa', 'grain', [], { typicalUnit: 'g', keepsDays: 365 }),

  // -------------------------------------------------------------- produce
  E('bok choy', 'produce', ['pak choi', 'pak choy', 'bok choi', 'chinese cabbage'], { typicalUnit: 'g', keepsDays: 4 }),
  E('spinach', 'produce', ['baby spinach'], { typicalUnit: 'g', keepsDays: 4 }),
  E('broccoli', 'produce', ['tenderstem', 'broccolini'], { typicalUnit: 'g', keepsDays: 6 }),
  E('bell peppers', 'produce', ['peppers', 'capsicum', 'capsicums', 'bell pepper', 'red pepper', 'red peppers'], { typicalUnit: 'piece', keepsDays: 8 }),
  E('tomatoes', 'produce', ['tomato', 'cherry tomatoes', 'plum tomatoes'], { typicalUnit: 'piece', keepsDays: 6 }),
  E('mushrooms', 'produce', ['mushroom', 'chestnut mushrooms', 'button mushrooms', 'shiitake'], { typicalUnit: 'g', keepsDays: 5 }),
  E('carrots', 'produce', ['carrot'], { typicalUnit: 'piece', keepsDays: 14 }),
  E('courgette', 'produce', ['zucchini', 'courgettes'], { typicalUnit: 'piece', keepsDays: 7 }),
  E('cucumber', 'produce', ['cucumbers'], { typicalUnit: 'piece', keepsDays: 7 }),
  E('potatoes', 'produce', ['potato'], { typicalUnit: 'g', keepsDays: 21 }),
  E('lemons', 'produce', ['lemon'], { typicalUnit: 'piece', keepsDays: 14 }),
  E('limes', 'produce', ['lime'], { typicalUnit: 'piece', keepsDays: 14 }),
  E('mint', 'produce', ['fresh mint', 'mint leaves'], { typicalUnit: 'bunch', keepsDays: 5 }),
  E('coriander', 'produce', ['cilantro', 'fresh coriander'], { typicalUnit: 'bunch', keepsDays: 4 }),
  E('basil', 'produce', ['fresh basil'], { typicalUnit: 'bunch', keepsDays: 4 }),
  E('lettuce', 'produce', ['salad leaves', 'romaine', 'gem lettuce'], { typicalUnit: 'head', keepsDays: 5 }),

  // ------------------------------------------------------------- aromatics
  E('garlic', 'aromatic', ['garlic cloves', 'clove of garlic', 'garlic bulb'], { typicalUnit: 'clove', keepsDays: 60 }),
  E('ginger', 'aromatic', ['fresh ginger', 'root ginger', 'ginger root'], { typicalUnit: 'g', keepsDays: 21 }),
  E('onions', 'aromatic', ['onion', 'brown onion', 'white onion'], { typicalUnit: 'piece', keepsDays: 30 }),
  E('spring onions', 'aromatic', ['scallions', 'scallion', 'green onions', 'spring onion'], { typicalUnit: 'stalk', keepsDays: 7 }),
  E('shallots', 'aromatic', ['shallot'], { typicalUnit: 'piece', keepsDays: 21 }),
  E('chillies', 'aromatic', ['chilli', 'chili', 'chile', 'fresh chilli', 'red chilli'], { typicalUnit: 'piece', keepsDays: 10 }),
  E('turmeric', 'aromatic', ['fresh turmeric'], { typicalUnit: 'g', keepsDays: 21 }),

  // ---------------------------------------------------------------- dairy
  E('milk', 'dairy', ['whole milk', 'semi skimmed milk'], { typicalUnit: 'ml', allergens: ['dairy'], keepsDays: 7 }),
  E('butter', 'dairy', ['unsalted butter'], { typicalUnit: 'g', allergens: ['dairy'], keepsDays: 30 }),
  E('cheese', 'dairy', ['cheddar', 'parmesan', 'grated cheese'], { typicalUnit: 'g', allergens: ['dairy'], keepsDays: 21 }),
  E('yoghurt', 'dairy', ['yogurt', 'greek yoghurt', 'greek yogurt'], { typicalUnit: 'g', allergens: ['dairy'], keepsDays: 10 }),
  E('cream', 'dairy', ['double cream', 'heavy cream'], { typicalUnit: 'ml', allergens: ['dairy'], keepsDays: 7 }),

  // --------------------------------------------------------------- pantry
  E('soy sauce', 'pantry', ['soya sauce', 'light soy', 'dark soy', 'soy'], { typicalUnit: 'tbsp', allergens: ['soy', 'gluten'], keepsDays: 365 }),
  E('cooking wine', 'pantry', ['shaoxing', 'shaoxing wine', 'rice wine', 'mirin'], { typicalUnit: 'tbsp', keepsDays: 365 }),
  E('sesame oil', 'pantry', ['toasted sesame oil'], { typicalUnit: 'tbsp', allergens: ['sesame'], keepsDays: 365 }),
  E('neutral oil', 'pantry', ['vegetable oil', 'sunflower oil', 'rapeseed oil', 'cooking oil', 'oil'], { typicalUnit: 'tbsp', keepsDays: 365 }),
  E('olive oil', 'pantry', ['extra virgin olive oil'], { typicalUnit: 'tbsp', keepsDays: 365 }),
  E('vinegar', 'pantry', ['rice vinegar', 'white vinegar', 'balsamic'], { typicalUnit: 'tbsp', keepsDays: 365 }),
  E('honey', 'pantry', [], { typicalUnit: 'tbsp', keepsDays: 365 }),
  E('salt', 'pantry', ['sea salt', 'table salt'], { typicalUnit: 'tsp', keepsDays: 3650 }),
  E('black pepper', 'pantry', ['pepper', 'ground pepper'], { typicalUnit: 'tsp', keepsDays: 730 }),
  E('sugar', 'pantry', ['caster sugar', 'granulated sugar'], { typicalUnit: 'g', keepsDays: 730 }),
  E('cornstarch', 'pantry', ['cornflour', 'corn starch'], { typicalUnit: 'tsp', keepsDays: 730 }),
  E('chilli flakes', 'pantry', ['red pepper flakes', 'chili flakes'], { typicalUnit: 'tsp', keepsDays: 365 }),
  E('flour', 'pantry', ['plain flour', 'all purpose flour'], { typicalUnit: 'g', allergens: ['gluten'], keepsDays: 365 }),
  E('peanut butter', 'pantry', ['peanutbutter'], { typicalUnit: 'tbsp', allergens: ['peanut'], keepsDays: 180 }),
  E('stock', 'pantry', ['chicken stock', 'vegetable stock', 'broth', 'bouillon'], { typicalUnit: 'ml', keepsDays: 365 }),
  E('water', 'pantry', [], { typicalUnit: 'ml', keepsDays: 3650 }),

  // -------------------------------------------------------- beverage base
  E('coffee beans', 'beverage-base', ['coffee', 'beans', 'ground coffee'], { typicalUnit: 'g', keepsDays: 90 }),
  E('tea', 'beverage-base', ['tea bags', 'green tea', 'black tea', 'jasmine tea'], { typicalUnit: 'g', keepsDays: 365 }),
  E('matcha', 'beverage-base', [], { typicalUnit: 'g', keepsDays: 180 }),
];

/** canonical name or synonym -> entry. Longest keys first so "chicken breast" beats "chicken". */
const BY_TERM = new Map<string, LexiconEntry>();
for (const entry of LEXICON) {
  BY_TERM.set(entry.canonicalName, entry);
  for (const s of entry.synonyms) if (!BY_TERM.has(s)) BY_TERM.set(s, entry);
}

const TERMS_BY_LENGTH = [...BY_TERM.keys()].sort((a, b) => b.length - a.length);

export type Resolution = {
  canonicalName: string;
  category: IngredientCategory;
  allergens: Allergen[];
  typicalUnit?: Unit;
  keepsDays?: number;
  unrecognised: boolean;
};

/** Best guess at a category for a term the lexicon has never seen. */
const guessCategory = (term: string): IngredientCategory => {
  if (/beef|pork|chicken|lamb|fish|salmon|prawn|shrimp|steak|mince|tofu/.test(term)) return 'protein-raw';
  if (/rice|noodle|pasta|bread|flour|oat|grain/.test(term)) return 'grain';
  if (/milk|cheese|cream|butter|yogh?urt/.test(term)) return 'dairy';
  if (/garlic|ginger|onion|chilli|chili|shallot|lemongrass/.test(term)) return 'aromatic';
  if (/coffee|tea|matcha|cacao/.test(term)) return 'beverage-base';
  if (/oil|sauce|vinegar|salt|sugar|spice|powder|paste|stock/.test(term)) return 'pantry';
  return 'produce';
};

const normalise = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Resolve one term. An exact or synonym match wins; otherwise the longest known term
 * contained in the phrase wins; otherwise the term is kept verbatim and flagged.
 */
export const resolveIngredient = (rawTerm: string): Resolution => {
  const term = normalise(rawTerm);
  const direct = BY_TERM.get(term) ?? BY_TERM.get(term.replace(/s$/, ''));
  const entry = direct ?? LEXICON.find((e) => e.canonicalName === term);
  if (entry) {
    return {
      canonicalName: entry.canonicalName,
      category: entry.category,
      allergens: [...(entry.allergens ?? [])],
      ...(entry.typicalUnit ? { typicalUnit: entry.typicalUnit } : {}),
      ...(entry.keepsDays !== undefined ? { keepsDays: entry.keepsDays } : {}),
      unrecognised: false,
    };
  }

  // Containment, longest term first, so "chicken breast" is preferred over "chicken".
  const contained = TERMS_BY_LENGTH.find(
    (t) => t.length >= 4 && new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(term),
  );
  if (contained) {
    const hit = BY_TERM.get(contained)!;
    return {
      canonicalName: hit.canonicalName,
      category: hit.category,
      allergens: [...(hit.allergens ?? [])],
      ...(hit.typicalUnit ? { typicalUnit: hit.typicalUnit } : {}),
      ...(hit.keepsDays !== undefined ? { keepsDays: hit.keepsDays } : {}),
      unrecognised: false,
    };
  }

  return {
    canonicalName: term || rawTerm.trim(),
    category: guessCategory(term),
    allergens: [],
    unrecognised: true,
  };
};

export const canonicalNames = (): string[] => LEXICON.map((e) => e.canonicalName);
