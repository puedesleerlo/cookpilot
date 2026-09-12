import type { MealPlan } from '@kitchen/domain';
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
 * Which cut-paper drawings go on the session's poster.
 *
 * A small surprise with a rule behind it: the drawings are of what this session actually
 * cooks with, matched loosely by name (bok choy is close enough to a cabbage, mint to dill),
 * in the order the plan uses them. A session with nothing drawable falls back to the
 * kitchen staples rather than to nothing.
 */

type Drawing = { src: string; key: string };

const MATCHERS: Array<[RegExp, Drawing]> = [
  [/garlic/, { key: 'garlic', src: garlic }],
  [/tomato/, { key: 'tomato', src: tomato }],
  [/onion|shallot|leek|scallion/, { key: 'onion', src: onion }],
  [/carrot/, { key: 'carrot', src: carrot }],
  [/potato/, { key: 'potato', src: potato }],
  [/beet/, { key: 'beet', src: beet }],
  [/cabbage|bok choy|kale|greens|lettuce|spinach|chard/, { key: 'cabbage', src: cabbage }],
  [/cucumber|zucchini|courgette/, { key: 'cucumber', src: cucumber }],
  [/dill|mint|basil|parsley|cilantro|coriander|herb/, { key: 'dill', src: dill }],
  [/mushroom/, { key: 'mushroom', src: mushroom }],
  [/cherr|berr/, { key: 'cherries', src: cherries }],
  [/\boil\b/, { key: 'oil', src: sunflowerOil }],
  // Ground pepper only: a bell pepper drawn as a pepper grinder would be a small lie.
  [/black pepper|peppercorn/, { key: 'pepper', src: pepperGrinder }],
];

const STAPLES: Drawing[] = [
  { key: 'tomato', src: tomato },
  { key: 'garlic', src: garlic },
  { key: 'dill', src: dill },
  { key: 'onion', src: onion },
];

export const posterDrawings = (plan: MealPlan, count = 4): Drawing[] => {
  const picked = new Map<string, Drawing>();
  for (const dish of plan.dishes) {
    for (const ingredient of dish.ingredients) {
      const name = ingredient.canonicalName.toLowerCase();
      const hit = MATCHERS.find(([pattern]) => pattern.test(name));
      if (hit && !picked.has(hit[1].key)) picked.set(hit[1].key, hit[1]);
    }
  }
  for (const staple of STAPLES) {
    if (picked.size >= count) break;
    if (!picked.has(staple.key)) picked.set(staple.key, staple);
  }
  return [...picked.values()].slice(0, count);
};
