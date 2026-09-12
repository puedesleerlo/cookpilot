/**
 * Things we assume are in the kitchen unless told otherwise.
 *
 * A recipe that needs salt and oil should not be penalised for it, or every score
 * collapses toward the recipes with the fewest ingredients. But an assumption is still an
 * assumption: anything drawn from here is tagged `assumedPantry` and rendered with a
 * dashed outline, so the user can say "actually, no" before the compiler plans around it.
 */
export const PANTRY_STAPLES: readonly string[] = [
  'salt',
  'black pepper',
  'sugar',
  'water',
  'neutral oil',
  'olive oil',
  'cornstarch',
  'chilli flakes',
  'honey',
  'vinegar',
  'flour',
];

const STAPLE_SET = new Set(PANTRY_STAPLES);

export const isStaple = (canonicalName: string): boolean => STAPLE_SET.has(canonicalName.toLowerCase());
