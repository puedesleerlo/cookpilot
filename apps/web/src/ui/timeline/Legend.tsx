import { blockStyle, dishWash } from '../theme';

/**
 * What the chart's markings mean.
 *
 * A Gantt encodes four different things in the same rectangle — who, what, whether it needs
 * you, and whether it can slip — and none of that is guessable. A few lines of key is
 * cheaper than a chart people read wrongly and trust anyway.
 *
 * Every swatch is drawn with the chart's own tokens and treatments, at the size of a small
 * block, so the key cannot drift from the thing it explains. The marks share one tint on
 * purpose: colour on this chart only ever means which dish, and the key says so first.
 */

type Props = {
  /** The plan's hue indexes, to show that colour is the dish. Optional: the key reads without it. */
  hues?: number[];
};

const SWATCH = 'h-6 w-[2.75rem] flex-none rounded-xs border-[1.5px]';

/** The tint the marks are demonstrated on: pale enough that hatch, stroke and dashes all show. */
const SAMPLE = 2;

export const Legend = ({ hues = [] }: Props) => (
  <div className="mt-3 rounded-nick-md bg-surface px-4 pb-4 pt-3 sm:px-5">
    <h3 className="text-xs font-bold uppercase tracking-wide text-muted">How to read the chart</h3>
    <ul className="mt-3 grid gap-x-7 gap-y-3 text-sm text-ink sm:flex sm:flex-wrap">
      {hues.length > 0 ? (
        <li className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-6 w-[2.75rem] flex-none overflow-hidden rounded-xs">
            {hues.slice(0, 6).map((hue, i) => (
              <span key={`${hue}-${i}`} className="h-full flex-1" style={{ background: dishWash('legend', hue) }} />
            ))}
          </span>
          colour is the dish
        </li>
      ) : null}
      <Item style={blockStyle('legend', 'active', false, SAMPLE)}>someone is on it</Item>
      <Item style={blockStyle('legend', 'hold', false, SAMPLE)}>looks after itself</Item>
      <Item style={blockStyle('legend', 'active', true, SAMPLE)}>sets the finish time</Item>
      <Item style={blockStyle('legend', 'wash', false, SAMPLE)}>washing in between</Item>
      <li className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={`${SWATCH} relative overflow-hidden border-rule bg-[color:var(--block-lane)]`}
        >
          <span className="absolute inset-0 bg-[color:var(--block-after-fill)]" />
        </span>
        after your hands are free
      </li>
      <li className="flex items-center gap-3">
        <Line tone="bg-[color:var(--block-free-line)]" />
        hands free
      </li>
      <li className="flex items-center gap-3">
        <Line tone="bg-[color:var(--block-budget-line)]" />
        the time you have
      </li>
    </ul>
  </div>
);

const Item = ({ style, children }: { style: Record<string, string>; children: string }) => (
  <li className="flex items-center gap-3">
    <span aria-hidden="true" className={SWATCH} style={style} />
    {children}
  </li>
);

/** A ruler line, on a scrap of lane so it is drawn on what it is drawn on in the chart. */
const Line = ({ tone }: { tone: string }) => (
  <span
    aria-hidden="true"
    className="relative flex h-6 w-[2.75rem] flex-none justify-center rounded-xs bg-[color:var(--block-lane)]"
  >
    <span className={`block h-full w-[2px] ${tone}`} />
  </span>
);
