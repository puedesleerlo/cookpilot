import type { ReactNode } from 'react';

/**
 * The handful of Makitra UI icons the session screen needs, drawn the Makitra way: a 24px
 * grid, straight segments, square caps (`.mk-icon`). Always decorative here — every icon
 * sits next to the word that says the same thing, so status is never carried by a shape
 * or a colour alone.
 */

export type IconName = 'check' | 'alert' | 'clock' | 'flame' | 'timer' | 'jar' | 'chart' | 'list' | 'drop';

const SHAPES: Record<IconName, ReactNode> = {
  check: <polyline points="4.5,12.5 9.5,17.5 19.5,6.5" />,
  alert: (
    <>
      <polygon points="12,3 21.5,20 2.5,20" />
      <path d="M12 9.5v4.5M12 16.8v.4" />
    </>
  ),
  clock: (
    <>
      <polygon points="12,3 18.4,5.5 21,12 18.4,18.5 12,21 5.6,18.5 3,12 5.6,5.5" />
      <polyline points="12,7.5 12,12 15.5,14.5" />
    </>
  ),
  flame: <polygon points="12,2.5 16.5,8 15.5,11 18.5,12.5 18,18 12,21.5 6,18 5.5,12.5 9,9.5 9.5,6" />,
  timer: (
    <>
      <polygon points="12,6 17,8 19,13 17,18 12,20 7,18 5,13 7,8" />
      <path d="M9.5 2.5h5M12 2.5V6M12 13l3-3" />
    </>
  ),
  jar: (
    <>
      <path d="M7 3h10v3.5H7z" />
      <polygon points="6,9 18,9 19,21 5,21" />
      <path d="M9 14h6" />
    </>
  ),
  chart: <path d="M3.5 6h9M7.5 12h11M5.5 18h7" />,
  list: <path d="M9 6h11M9 12h11M9 18h11M4 5.5v1M4 11.5v1M4 17.5v1" />,
  drop: <polygon points="12,3 18.5,12 18.5,16 15.5,20.5 8.5,20.5 5.5,16 5.5,12" />,
};

export const Icon = ({ name, className = '' }: { name: IconName; className?: string }) => (
  <svg viewBox="0 0 24 24" className={`mk-icon ${className}`} aria-hidden="true" focusable="false">
    {SHAPES[name]}
  </svg>
);
