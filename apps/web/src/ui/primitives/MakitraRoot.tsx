import type { HTMLAttributes, ReactNode } from 'react';

type Props = HTMLAttributes<HTMLDivElement> & { children?: ReactNode };

/**
 * The Makitra root (@makitra/react's MakitraRoot). Every screen renders inside it: it
 * paints the page ground, sets the ink, Geologica and the body size, so a component that
 * forgets to say what font it wants still lands in the system rather than the browser's.
 */
export const MakitraRoot = ({ className = '', children, ...rest }: Props) => (
  <div className={`mk-root relative isolate min-h-dvh ${className}`} {...rest}>
    {children}
  </div>
);
