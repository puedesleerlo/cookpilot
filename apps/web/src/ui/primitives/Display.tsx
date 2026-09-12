import type { ElementType, HTMLAttributes } from 'react';

export type DisplaySize = 'xl' | '2xl' | '3xl' | '4xl' | '5xl';

type Props = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  /** Maps to --mk-text-{size}. Leave unset to inherit from a Tailwind text class. */
  size?: DisplaySize;
};

/**
 * Hand-cut display type: dish names, screen titles and big numbers, 27px and up, never
 * body copy. Protest Guerrilla, uppercase.
 */
export const Display = ({ as: Component = 'h2', size, className = '', style, ...rest }: Props) => (
  <Component
    className={`mk-display ${className}`}
    style={size ? { fontSize: `var(--mk-text-${size})`, ...style } : style}
    {...rest}
  />
);
