import beet from '@/assets/makitra/ingredients/beet.svg';
import cabbage from '@/assets/makitra/ingredients/cabbage.svg';
import carrot from '@/assets/makitra/ingredients/carrot.svg';
import cherries from '@/assets/makitra/ingredients/cherries.svg';
import cucumber from '@/assets/makitra/ingredients/cucumber.svg';
import dill from '@/assets/makitra/ingredients/dill.svg';
import garlic from '@/assets/makitra/ingredients/garlic.svg';
import mushroom from '@/assets/makitra/ingredients/mushroom.svg';
import onion from '@/assets/makitra/ingredients/onion.svg';
import pepperGrinder from '@/assets/makitra/ingredients/pepper-grinder.svg';
import potato from '@/assets/makitra/ingredients/potato.svg';
import sunflowerOil from '@/assets/makitra/ingredients/sunflower-oil.svg';
import tomato from '@/assets/makitra/ingredients/tomato.svg';

/**
 * Makitra's cut-paper ingredient drawings, found by name.
 *
 * Decoration only: every use is an `<img alt="">`. A drawing never stands in for a word,
 * so a fridge with nothing drawable in it loses nothing but the pictures.
 */

export const DRAWING = {
  beet,
  cabbage,
  carrot,
  cherries,
  cucumber,
  dill,
  garlic,
  mushroom,
  onion,
  pepperGrinder,
  potato,
  sunflowerOil,
  tomato,
} as const;

export type DrawingName = keyof typeof DRAWING;

/** Loose on purpose: a picture of a cabbage next to bok choy is a decoration, not a claim. */
const MATCH: [RegExp, DrawingName][] = [
  [/tomato/, 'tomato'],
  [/garlic/, 'garlic'],
  [/onion|shallot|leek|scallion/, 'onion'],
  [/mushroom|shiitake|chanterelle/, 'mushroom'],
  [/potato/, 'potato'],
  [/carrot/, 'carrot'],
  [/cabbage|bok choy|kale|lettuce|spinach|chard|greens/, 'cabbage'],
  [/cucumber|courgette|zucchini/, 'cucumber'],
  [/beet/, 'beet'],
  [/dill|parsley|coriander|cilantro|basil|herb|mint/, 'dill'],
  [/cherr|berr/, 'cherries'],
  [/\boil\b/, 'sunflowerOil'],
  [/black pepper|peppercorn/, 'pepperGrinder'],
];

export const drawingFor = (name: string): DrawingName | null => {
  const n = name.toLowerCase();
  return MATCH.find(([re]) => re.test(n))?.[1] ?? null;
};

/** The distinct drawings a list of names turns up, in the order they first appear. */
export const drawingsFor = (names: string[]): DrawingName[] => {
  const out: DrawingName[] = [];
  for (const name of names) {
    const d = drawingFor(name);
    if (d && !out.includes(d)) out.push(d);
  }
  return out;
};
