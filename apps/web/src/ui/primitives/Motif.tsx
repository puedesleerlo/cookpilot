import { useId, type CSSProperties, type ReactNode, type SVGProps } from 'react';

/**
 * Makitra's cut-paper motifs as inline SVG: flat polygons with straight scissor edges, one
 * colour per piece, no outlines. Recolour with m1 (main), m2 (stems, leaves) and m3 (veins,
 * usually the ground it sits on) — any CSS colour, normally a `var(--mk-*)` pigment.
 *
 * Geometry is Makitra's own (@makitra/react Motif), with its defaults expressed as tokens.
 */

export type MotifName = 'beet' | 'leaf' | 'mushroom' | 'poppy' | 'daisy' | 'spark' | 'cherry' | 'pepper';

export const MOTIF_NAMES: MotifName[] = ['beet', 'leaf', 'mushroom', 'poppy', 'daisy', 'spark', 'cherry', 'pepper'];

type Slot = 'm1' | 'm2' | 'm3';

const DEFAULTS: Record<Slot, string> = {
  m1: 'var(--mk-paprika)',
  m2: 'var(--mk-garden)',
  m3: 'var(--mk-paper)',
};

const fill = (slot: Slot, fallback = DEFAULTS[slot]): CSSProperties => ({ fill: `var(--${slot}, ${fallback})` });
const line = (slot: Slot, width: number, fallback = DEFAULTS[slot]): CSSProperties => ({
  fill: 'none',
  stroke: `var(--${slot}, ${fallback})`,
  strokeWidth: width,
});

const POPPY_SEEDS: Array<[number, number]> = [
  [8, 5], [20, 5], [32, 5], [44, 5],
  [3, 14], [14, 14], [26, 14], [38, 14], [50, 14],
  [8, 23], [20, 23], [32, 23], [44, 23], [55, 23],
  [14, 32], [26, 32], [38, 32], [50, 32],
  [22, 40], [34, 40],
];

const DAISY_PETALS = [0, 58, 122, 180, 238, 300];

const MOTIFS: Record<MotifName, { viewBox: string; body: ReactNode }> = {
  beet: {
    viewBox: '0 0 80 100',
    body: (
      <>
        <polygon style={fill('m2')} points="33,48 16,34 8,14 18,4 31,16 37,36" />
        <polygon style={fill('m2')} points="45,47 50,26 63,10 75,15 72,34 57,46" />
        <path style={line('m3', 1.8)} d="M34 42L15 9M26 28l-9-4M29 22l-1-10M49 40l22-26M57 30l10 2M55 32l2-12" />
        <polygon style={fill('m1')} points="23,56 35,47 49,47 61,56 64,72 55,86 42,91 28,85 18,70" />
        <polygon style={fill('m1')} points="38,89 46,89 41,99" />
      </>
    ),
  },
  leaf: {
    viewBox: '0 0 60 80',
    body: (
      <>
        <polygon style={fill('m1', 'var(--mk-garden)')} points="30,2 44,13 52,33 48,55 32,78 17,62 8,40 13,18" />
        <path style={line('m3', 2)} d="M30.5 9L30 72M30.3 28L43 18M30.2 41L16 29M30.1 54L43 44" />
      </>
    ),
  },
  mushroom: {
    viewBox: '0 0 70 70',
    body: (
      <>
        <polygon style={fill('m1')} points="3,36 10,15 32,4 55,9 67,30 49,38 22,41" />
        <polygon style={fill('m1')} points="25,39 44,37 49,66 21,64" />
        <path style={line('m3', 2)} d="M16 39.5L55 35" />
      </>
    ),
  },
  poppy: {
    viewBox: '0 0 60 44',
    body: (
      <g style={fill('m1', 'var(--mk-plum-900)')}>
        {POPPY_SEEDS.map(([cx, cy]) => (
          <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx="3.3" ry="2.1" transform={`rotate(-24 ${cx} ${cy})`} />
        ))}
      </g>
    ),
  },
  daisy: {
    viewBox: '0 0 60 60',
    body: (
      <>
        <g style={fill('m1', 'var(--mk-marigold)')}>
          {DAISY_PETALS.map((deg) => (
            <ellipse key={deg} cx="30" cy="15" rx="8" ry="12" transform={deg ? `rotate(${deg} 30 30)` : undefined} />
          ))}
        </g>
        <circle cx="30" cy="30" r="6.5" style={fill('m3')} />
      </>
    ),
  },
  spark: {
    viewBox: '0 0 60 60',
    body: (
      <>
        <polygon style={fill('m1')} points="3,26 24,3 31,11 17,37" />
        <polygon style={fill('m1')} points="14,52 44,34 58,39 32,58" />
      </>
    ),
  },
  cherry: {
    viewBox: '0 0 60 72',
    body: (
      <>
        <path style={line('m2', 2.5)} d="M19 50l8-24L41 6M43 52l-1-24-1-22" />
        <polygon style={fill('m2')} points="41,6 53,1 59,9 48,15" />
        <polygon style={fill('m1')} points="29.0,56.0 26.4,62.1 21.4,66.5 14.8,65.8 9.1,62.5 7.7,56.0 9.1,49.5 14.8,46.2 21.4,45.5 26.4,49.9" />
        <polygon style={fill('m1')} points="53.0,62.1 49.6,67.8 43.1,69.4 36.7,68.0 33.1,62.4 32.5,55.7 36.7,50.6 42.8,48.0 49.0,50.5 53.4,55.5" />
        <path style={line('m3', 2)} d="M12 53l2-3M37 56l2-3" />
      </>
    ),
  },
  pepper: {
    viewBox: '0 0 60 90',
    body: (
      <polygon
        style={fill('m1', 'var(--mk-plum)')}
        points="26,3 34,3 36,9 45,13 47,25 41,31 45,40 51,86 9,86 15,40 19,31 13,25 15,13 24,9"
      />
    ),
  },
};

type Props = Omit<SVGProps<SVGSVGElement>, 'name' | 'ref'> & {
  name: MotifName;
  m1?: string;
  m2?: string;
  m3?: string;
  /** Accessible name. Without it the motif is decorative and hidden. */
  title?: string;
};

export const Motif = ({ name, m1, m2, m3, title, className, style, ...rest }: Props) => {
  const titleId = useId();
  const motif = MOTIFS[name];
  const colors = {
    ...(m1 ? { '--m1': m1 } : null),
    ...(m2 ? { '--m2': m2 } : null),
    ...(m3 ? { '--m3': m3 } : null),
  } as CSSProperties;
  const a11y = title ? { role: 'img', 'aria-labelledby': titleId } : { 'aria-hidden': true as const };
  return (
    <svg
      viewBox={motif.viewBox}
      className={`mk-motif ${className ?? ''}`}
      style={{ ...colors, ...style }}
      focusable="false"
      {...a11y}
      {...rest}
    >
      {title ? <title id={titleId}>{title}</title> : null}
      {motif.body}
    </svg>
  );
};
