import type { CSSProperties, ReactNode } from 'react';

/**
 * The cut-paper kit the shared-session screens are built from: Makitra's UI icons, the
 * join code as stamped letters on paper tiles, the 16-sided timer ring and the slanted tag
 * a heading gets stamped onto. Everything here is decoration or a readout — nothing in this
 * file is focusable, which is what lets the tiles and tags wear polygon cuts.
 */

// ------------------------------------------------------------------- icons

/** Makitra's icon geometry (24px grid, straight segments); `.mk-icon` supplies the stroke. */
const ICONS = {
  check: <polyline points="4.5,12.5 9.5,17.5 19.5,6.5" />,
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
  back: (
    <>
      <polyline points="11,5 4,12 11,19" />
      <path d="M4.5 12H20" />
    </>
  ),
  prev: <polyline points="15,4.5 7.5,12 15,19.5" />,
  next: <polyline points="9,4.5 16.5,12 9,19.5" />,
  play: <polygon points="7,4.5 19,12 7,19.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  lock: (
    <>
      <polygon points="5,11 19,11 19,21 5,21" />
      <polyline points="8,11 8,7 12,3.5 16,7 16,11" />
    </>
  ),
  flag: (
    <>
      <path d="M6 21V3" />
      <polygon points="6,4 18.5,4 15.5,8.5 18.5,13 6,13" />
    </>
  ),
  alert: (
    <>
      <polygon points="12,3 22,20.5 2,20.5" />
      <path d="M12 9.5v5M12 16.5v1.5" />
    </>
  ),
  hand: (
    <>
      <polyline points="7,13 7,5.5 9.5,5.5 9.5,11" />
      <polyline points="9.5,11 9.5,3.5 12,3.5 12,11" />
      <polyline points="12,11 12,4.5 14.5,4.5 14.5,11.5" />
      <polyline points="14.5,11.5 14.5,7 17,7 17,15 14,21 8,21 4,15.5 5,12.5 7,13" />
    </>
  ),
} as const;

export type IconName = keyof typeof ICONS;

export const Icon = ({ name, className = '' }: { name: IconName; className?: string }) => (
  <svg viewBox="0 0 24 24" className={`mk-icon ${className}`} aria-hidden="true" focusable="false">
    {ICONS[name]}
  </svg>
);

// --------------------------------------------------------------- stamp tag

/**
 * A slanted paper label with a heading or a word stamped on it. The tone is a pair of
 * classes that are legal together (ink on a pale tint, paper on a deep pigment).
 */
export const StampTag = ({
  children,
  tone = 'bg-mk-plum text-paper',
  tilt = -3,
  className = '',
  as: Tag = 'p',
}: {
  children: ReactNode;
  tone?: string;
  tilt?: number;
  className?: string;
  as?: 'p' | 'span';
}) => (
  <Tag
    className={`inline-block px-4 pb-[6px] pt-1 text-sm font-bold uppercase tracking-[0.14em] [clip-path:var(--mk-cut-tag)] [font-variation-settings:var(--mk-sharp)] ${tone} ${className}`}
    style={{ rotate: `${tilt}deg` }}
  >
    {children}
  </Tag>
);

// -------------------------------------------------------------- code tiles

/** One pale paper per letter, the way a party banner is strung. Ink is legal on every one. */
const TILE_PAPER = ['bg-marigold', 'bg-enamel', 'bg-cornflower-100', 'bg-garden-100', 'bg-paprika-100', 'bg-plum-100'];
const TILE_TILT = [-4, 3, -2, 4, -3, 2];

export const STAMP_IN = 'motion-safe:animate-[mk-stamp_var(--d-slow)_var(--mk-ease-stamp)_both]';

type TilesProps = {
  value: string;
  length: number;
  /** Faint letters on the empty tiles, showing what shape of thing goes there. */
  placeholder?: string;
  /** The tile the next letter lands on; marked only while the field has focus. */
  active?: number | null;
  size?: 'md' | 'lg';
};

/**
 * The join code as stamped letters on paper tiles. Always aria-hidden: whoever renders it
 * also renders the code as text (or as the input it mirrors), which is what gets read out.
 */
export const CodeTiles = ({ value, length, placeholder = '', active = null, size = 'lg' }: TilesProps) => (
  <span aria-hidden="true" className={`grid grid-cols-6 ${size === 'lg' ? 'gap-2 sm:gap-3' : 'gap-2'}`}>
    {Array.from({ length }, (_, i) => {
      const letter = value[i];
      return (
        <span
          key={i}
          className={`relative grid aspect-[4/5] place-items-center [clip-path:var(--mk-cut-patch)] ${
            letter ? TILE_PAPER[i % TILE_PAPER.length] : 'bg-sunken'
          }`}
          style={{ rotate: `${TILE_TILT[i % TILE_TILT.length]}deg` }}
        >
          {letter ? (
            <span
              key={letter}
              className={`mk-display leading-none text-charcoal ${STAMP_IN} ${
                size === 'lg'
                  ? 'text-[length:var(--mk-text-3xl)] sm:text-[length:var(--mk-text-4xl)]'
                  : 'text-[length:var(--mk-text-2xl)] sm:text-[length:var(--mk-text-3xl)]'
              }`}
            >
              {letter}
            </span>
          ) : (
            <span
              className={`mk-display leading-none text-faint ${
                size === 'lg' ? 'text-[length:var(--mk-text-3xl)] sm:text-[length:var(--mk-text-4xl)]' : 'text-[length:var(--mk-text-2xl)]'
              }`}
            >
              {placeholder[i] ?? ''}
            </span>
          )}
          {active === i ? (
            <span className="absolute inset-x-[18%] bottom-[12%] hidden h-[6px] bg-paprika [clip-path:var(--mk-cut-tag)] group-focus-within:block" />
          ) : null}
        </span>
      );
    })}
  </span>
);

// -------------------------------------------------------------------- dial

/* The 16-sided ring from Makitra's timer: radius 100 around (120, 120), from 3 o'clock.
   The svg is turned -90deg so the ring runs from 12. */
const RING =
  '220.0,120.0 212.4,158.3 190.7,190.7 158.3,212.4 120.0,220.0 81.7,212.4 49.3,190.7 27.6,158.3 20.0,120.0 27.6,81.7 49.3,49.3 81.7,27.6 120.0,20.0 158.3,27.6 190.7,49.3 212.4,81.7';

export type DialTone = 'run' | 'late' | 'wait' | 'done' | 'ink';

const FILL: Record<DialTone, string> = {
  run: 'var(--mk-paprika)',
  late: 'var(--mk-marigold)',
  wait: 'transparent',
  done: 'var(--mk-garden)',
  ink: 'var(--mk-plum-900)',
};

type DialProps = {
  /** How much of the ring is drawn, 0..1. A countdown passes the share of time left. */
  fraction: number;
  tone: DialTone;
  /** Ring thickness in viewBox units (the dial is 240 across). */
  stroke?: number;
  /** When set, the ring is also the progress bar for the step, with this name and value. */
  progress?: { label: string; value: number };
  /** Ground the ring sits on; Makitra's night sunken by default. */
  track?: string;
  /** Whether to paint the plate inside the ring. */
  plate?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

/**
 * The timer ring: the one thing on these screens that moves on its own, and only while a
 * clock is running. The readout (children) sits in the middle, outside the progress bar, so
 * a timer is never hidden inside a bar's presentational children.
 */
export const Dial = ({ fraction, tone, stroke = 18, progress, track = 'var(--mk-sunken)', plate = true, className = '', style, children }: DialProps) => {
  const f = Math.max(0, Math.min(1, fraction));
  const ring = (
    <svg viewBox="0 0 240 240" aria-hidden="true" focusable="false" className="absolute inset-0 h-full w-full -rotate-90">
      {plate ? <polygon points={RING} style={{ fill: 'var(--mk-surface)' }} /> : null}
      <polygon
        points={RING}
        pathLength={100}
        strokeDasharray={tone === 'wait' ? '2.2 2.2' : undefined}
        style={{ fill: 'none', stroke: track, strokeWidth: stroke }}
      />
      {tone !== 'wait' ? (
        <polygon
          points={RING}
          pathLength={100}
          strokeDasharray="100"
          strokeLinejoin="miter"
          className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-1000 motion-safe:ease-linear"
          style={{ fill: 'none', stroke: FILL[tone], strokeWidth: stroke, strokeDashoffset: 100 * (1 - f) }}
        />
      ) : null}
    </svg>
  );
  return (
    <div className={`relative aspect-square max-w-full flex-none ${className}`} style={style}>
      {progress ? (
        <div
          role="progressbar"
          aria-label={progress.label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.value}
          className="absolute inset-0"
        >
          {ring}
        </div>
      ) : (
        ring
      )}
      <div className="absolute inset-0 grid place-content-center text-center">{children}</div>
    </div>
  );
};
