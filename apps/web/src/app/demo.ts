import { IngredientSchema, ingredientId, resolveIngredient, type Ingredient } from '@kitchen/domain';
import type { EquipmentAnswer, IntakeAnswers } from './store';

/**
 * The §10 demo scenario, reachable in one click from the landing page.
 *
 * It exists to make the ninety-second claim checkable: the pantry is fixed, the kitchen is
 * fixed, and it compiles with no network and no API key. Everything here is stated rather
 * than inferred, so the demo is not quietly relying on the parser getting lucky.
 */

const DEMO_PANTRY: [string, Ingredient['urgency'], number | undefined, Ingredient['unit']][] = [
  ['jasmine rice', 'not-urgent', 500, 'g'],
  ['ground beef', 'use-soon', 500, 'g'],
  ['chicken breast', 'use-today', 600, 'g'],
  ['salmon', 'use-today', 3, 'piece'],
  ['tomatoes', 'use-soon', 5, 'piece'],
  ['eggs', 'not-urgent', 8, 'piece'],
  ['mushrooms', 'use-soon', 300, 'g'],
  ['bok choy', 'use-today', 500, 'g'],
  ['bell peppers', 'not-urgent', 3, 'piece'],
  ['garlic', 'not-urgent', 1, 'head'],
  ['ginger', 'not-urgent', 60, 'g'],
  ['soy sauce', 'not-urgent', 250, 'ml'],
  ['cooking wine', 'not-urgent', 200, 'ml'],
  ['sesame oil', 'not-urgent', 100, 'ml'],
  ['lemons', 'use-soon', 5, 'piece'],
  ['mint', 'use-today', 1, 'bunch'],
  ['coffee beans', 'not-urgent', 250, 'g'],
];

export const demoPantry = (): Ingredient[] =>
  DEMO_PANTRY.map(([name, urgency, quantity, unit]) => {
    const resolved = resolveIngredient(name);
    return IngredientSchema.parse({
      id: ingredientId(resolved.canonicalName),
      name,
      canonicalName: resolved.canonicalName,
      ...(quantity !== undefined ? { quantity } : {}),
      ...(unit ? { unit } : {}),
      urgency,
      category: resolved.category,
      allergens: resolved.allergens,
    });
  });

/** The §10 demo kitchen: two burners, one frying pan, one saucepan, no oven. */
export const DEMO_EQUIPMENT: EquipmentAnswer[] = [
  { kind: 'burner', count: 2 },
  { kind: 'frying-pan', count: 1 },
  { kind: 'saucepan', count: 1 },
  { kind: 'pot', count: 1 },
  { kind: 'cutting-board', count: 2 },
  { kind: 'knife', count: 2 },
  { kind: 'mixing-bowl', count: 3 },
  { kind: 'grater', count: 1 },
  { kind: 'colander', count: 1 },
  { kind: 'measuring-cup', count: 1 },
  { kind: 'blender', count: 1 },
  { kind: 'jar', count: 2 },
  { kind: 'pitcher', count: 1 },
  { kind: 'storage-container', count: 8 },
  { kind: 'fridge-shelf', count: 1 },
  { kind: 'sink', count: 1 },
];

/**
 * Everything is `stated` rather than assumed: the demo must not be quietly relying on a
 * default, because the whole point of it is that the numbers in §10 are the numbers that
 * get compiled.
 */
export const demoIntake = (): IntakeAnswers => ({
  pantry: demoPantry(),
  timeBudgetMin: { value: 60, source: 'stated' },
  servings: { value: 4, source: 'stated' },
  mealCount: { value: 4, source: 'stated' },
  cookCount: { value: 2, source: 'stated' },
  equipment: { value: [...DEMO_EQUIPMENT], source: 'stated' },
  restrictions: { value: [], source: 'stated' },
  style: { value: 'asian', source: 'stated' },
  wantsBeverages: { value: true, source: 'stated' },
});
