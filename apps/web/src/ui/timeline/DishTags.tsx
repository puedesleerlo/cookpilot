import type { MealPlan } from '@kitchen/domain';
import { dishHue, dishWash } from '../theme';

/**
 * What you end up with, as paper tags.
 *
 * Each dish is a luggage tag cut from the page, tied on at a slightly different angle. The
 * tag's stub is the same soft tint the dish's blocks wear on the chart, with the eyelet
 * ringed in its edge colour — so the tag is also the chart's key for that dish, and a
 * glance from a block to its tag is how you find out whose block it is.
 */

type Props = { plan: MealPlan; hues: Record<string, number> };

const TILT = ['-rotate-[1.4deg]', 'rotate-[0.9deg]', '-rotate-[0.5deg]', 'rotate-[1.6deg]', '-rotate-[1deg]', 'rotate-[0.4deg]'];

const KIND: Record<MealPlan['dishes'][number]['kind'], string> = {
  main: 'main',
  side: 'side',
  sauce: 'sauce',
  base: 'base',
  beverage: 'drink',
};

export const DishTags = ({ plan, hues }: Props) => (
  <section aria-label="What you end up with">
    <div className="mb-4 flex items-center gap-3">
      <span
        aria-hidden="true"
        className="voice-display grid h-[3.25rem] min-w-[3.25rem] flex-none -rotate-[8deg] place-items-center bg-paprika px-3 text-xl leading-none text-paper [clip-path:var(--mk-cut-plate)]"
      >
        {plan.dishes.length}
      </span>
      <h2 className="voice-display text-xl sm:text-2xl">What you end up with</h2>
    </div>
    <ul className="flex flex-wrap gap-x-3 gap-y-4">
      {plan.dishes.map((dish, i) => (
        <li
          key={dish.id}
          className={`flex min-h-touch max-w-full items-stretch bg-surface [clip-path:var(--mk-cut-tag)] ${TILT[i % TILT.length]}`}
        >
          <span
            aria-hidden="true"
            className="relative w-[2.75rem] flex-none"
            style={{ background: dishWash(dish.id, hues[dish.id]) }}
          >
            <span
              className="absolute left-1/2 top-1/2 block h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-bg"
              style={{ borderColor: dishHue(dish.id, hues[dish.id]) }}
            />
          </span>
          <span className="flex min-w-0 flex-col justify-center py-3 pl-3 pr-6">
            <span className="text-md font-bold leading-tight [font-variation-settings:var(--mk-sharp)]">{dish.name}</span>
            <span className="mt-1 text-xs text-muted">
              {KIND[dish.kind]} · {dish.servings} servings{dish.keepsDays ? ` · keeps ${dish.keepsDays}d` : ''}
            </span>
          </span>
        </li>
      ))}
    </ul>
  </section>
);
