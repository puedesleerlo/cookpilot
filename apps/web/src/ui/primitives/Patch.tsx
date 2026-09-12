import type { CSSProperties, ElementType, HTMLAttributes } from 'react';

export type PatchTone = 'soup' | 'preserve' | 'garden' | 'dough' | 'drink' | 'cellar';
export type PatchCut = 'patch' | 'plate' | 'tag' | 'burst' | 'shard' | 'edge-top' | 'edge-bottom';

/**
 * Custom properties for a patch ground: the category colour, the ink that is legal on it,
 * and the scissor cut. Exposed so a component can put the same ground on its own element.
 */
export const patchStyle = (tone: PatchTone, cut?: PatchCut): CSSProperties =>
  ({
    '--patch': `var(--mk-patch-${tone})`,
    '--on-patch': `var(--mk-on-patch-${tone})`,
    ...(cut ? { '--cut': `var(--mk-cut-${cut})` } : null),
  }) as CSSProperties;

type Props = HTMLAttributes<HTMLElement> & {
  tone: PatchTone;
  cut?: PatchCut;
  as?: ElementType;
};

/**
 * A paper cut-out ground in a category colour. The cut is a clip-path, which would slice a
 * focus ring in half, so nothing focusable goes directly on a patch: put controls beside
 * it, or on a surface laid over it.
 *
 * soup → paprika, dough → marigold, preserve → enamel, garden → green, drink → cornflower,
 * cellar → plum. Soup and garden carry paper text at large sizes only.
 */
export const Patch = ({ tone, cut, as: Component = 'div', className = '', style, ...rest }: Props) => (
  <Component className={`mk-patch ${className}`} style={{ ...patchStyle(tone, cut), ...style }} {...rest} />
);
