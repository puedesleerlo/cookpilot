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

/** Index 0..5, stable for a given dish id. */
export const dishHueIndex = (dishId: string): number =>
  parseInt(stableHash(dishId), 16) % DISH_HUE_COUNT;

export const dishHue = (dishId: string): string => `var(--dish-${dishHueIndex(dishId)})`;
export const dishWash = (dishId: string): string => `var(--dish-${dishHueIndex(dishId)}-wash)`;

/** Cooks draw from their own ramp so a cook is never confusable with a dish. */
export const cookColor = (index: number): string =>
  `var(--cook-${((index % COOK_COLOR_COUNT) + COOK_COLOR_COUNT) % COOK_COLOR_COUNT})`;

/** The token set a timeline block uses, given what kind of block it is. */
export type BlockTreatment = 'active' | 'hold' | 'wash' | 'done';

export const blockStyle = (
  dishId: string,
  treatment: BlockTreatment,
  isCritical: boolean,
): Record<string, string> => {
  const hue = treatment === 'wash' ? 'var(--block-wash-stroke)' : dishHue(dishId);
  const fill = treatment === 'wash' ? 'var(--block-wash-fill)' : dishWash(dishId);
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
