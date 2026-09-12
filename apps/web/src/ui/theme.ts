import { stableHash, type ContaminationState } from '@kitchen/domain';

/**
 * Deterministic visual allocation.
 *
 * Colour has to be stable across devices: if a dish were assigned a hue by its position
 * in an array, re-ordering a plan would recolour the whole chart, and a shared link would
 * render differently from the sender's screen. So hue comes from a hash of the id.
 */

export const DISH_HUE_COUNT = 6;
export const COOK_COLOR_COUNT = 4;

export type DishHueToken = `--dish-${number}`;

/** Index 0..5, stable for a given dish id. The dish's *preferred* hue. */
export const dishHueIndex = (dishId: string): number =>
  parseInt(stableHash(dishId), 16) % DISH_HUE_COUNT;

export const dishHue = (dishId: string, index = dishHueIndex(dishId)): string =>
  `var(--dish-${index})`;
export const dishWash = (dishId: string, index = dishHueIndex(dishId)): string =>
  `var(--dish-${index}-wash)`;

/**
 * Hues for a whole plan at once, with collisions resolved.
 *
 * Hashing alone is stable but not distinct: six dishes into six slots collide about as
 * often as not, and a legend where two dishes share a dot is worse than useless — it tells
 * you something false. So the hash becomes a preference and a dish that finds its slot
 * taken walks to the next free one.
 *
 * Determinism survives because the allocation depends only on the *set* of dish ids, sorted
 * — not on plan order, screen size, or who is looking. The same session renders the same
 * colours on the sender's phone and the recipient's laptop, which is the property the hash
 * was there to guarantee in the first place.
 */
export const allocateDishHues = (dishIds: string[]): Record<string, number> => {
  const taken = new Set<number>();
  const out: Record<string, number> = {};
  for (const id of [...new Set(dishIds)].sort()) {
    const preferred = dishHueIndex(id);
    let index = preferred;
    for (let step = 0; step < DISH_HUE_COUNT && taken.has(index); step++) {
      index = (preferred + step + 1) % DISH_HUE_COUNT;
    }
    // More dishes than hues: the extras share, which is honest — the alternative is a
    // seventh colour nobody defined.
    taken.add(index);
    out[id] = index;
  }
  return out;
};

/** Cooks draw from their own ramp so a cook is never confusable with a dish. */
export const cookColor = (index: number): string =>
  `var(--cook-${((index % COOK_COLOR_COUNT) + COOK_COLOR_COUNT) % COOK_COLOR_COUNT})`;

/** The token set a timeline block uses, given what kind of block it is. */
export type BlockTreatment = 'active' | 'hold' | 'wash' | 'done';

export const blockStyle = (
  dishId: string,
  treatment: BlockTreatment,
  isCritical: boolean,
  hueIndex?: number,
): Record<string, string> => {
  const hue = treatment === 'wash' ? 'var(--block-wash-stroke)' : dishHue(dishId, hueIndex);
  const fill = treatment === 'wash' ? 'var(--block-wash-fill)' : dishWash(dishId, hueIndex);
  return {
    '--block-edge': hue,
    background: fill,
    borderColor: `color-mix(in srgb, ${hue} 40%, transparent)`,
    ...(treatment === 'hold'
      ? {
          backgroundImage:
            'repeating-linear-gradient(-45deg, color-mix(in srgb, var(--block-hold-hatch) 34%, transparent) 0 2px, transparent 2px 7px)',
        }
      : {}),
    // A wash is a dashed edge as well as a cool fill. Every marking on this chart has to
    // survive being read without colour, and blue-on-cream does not.
    ...(treatment === 'wash' ? { borderStyle: 'dashed' } : {}),
    ...(isCritical
      ? { boxShadow: 'inset 0 0 0 var(--block-critical-stroke-width) var(--block-critical-stroke)' }
      : {}),
    ...(treatment === 'done' ? { opacity: 'var(--block-done-opacity)' } : {}),
  };
};

/** Contamination shows as a small badge colour, not as the block's own fill. */
export const contaminationTone = (state: ContaminationState): string => {
  if (state === 'clean') return 'var(--c-sage-ink)';
  if (state === 'soiled') return 'var(--c-ink-soft)';
  return 'var(--c-tomato-ink)';
};
