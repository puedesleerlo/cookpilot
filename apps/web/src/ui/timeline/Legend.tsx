import { blockStyle } from '../theme';

/**
 * What the chart's markings mean.
 *
 * A Gantt encodes four different things in the same rectangle — who, what, whether it needs
 * you, and whether it can slip — and none of that is guessable. Four lines of key is
 * cheaper than a chart people read wrongly and trust anyway.
 */

const SWATCH = 'h-5 w-9 flex-none rounded-xs border-[1.5px]';

export const Legend = () => (
  <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-soft">
    <Item style={blockStyle('legend-a', 'active', false, 3)}>someone is on it</Item>
    <Item style={blockStyle('legend-a', 'hold', false, 3)}>looks after itself</Item>
    <Item style={blockStyle('legend-a', 'active', true, 3)}>sets the finish time</Item>
    <Item style={blockStyle('legend-a', 'wash', false, 3)}>washing in between</Item>
    <li className="flex items-center gap-2">
      <span aria-hidden="true" className={`${SWATCH} border-line bg-cream-sunk/50`} />
      after your hands are free
    </li>
  </ul>
);

const Item = ({ style, children }: { style: Record<string, string>; children: string }) => (
  <li className="flex items-center gap-2">
    <span aria-hidden="true" className={SWATCH} style={style} />
    {children}
  </li>
);
