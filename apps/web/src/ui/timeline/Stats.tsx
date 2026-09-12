import type { ReactNode } from 'react';
import { Motif } from '../primitives';
import { Icon } from './Icon';

/**
 * The numbers, cut out of paper.
 *
 * The first question is a number — does it fit — so it gets the poster: a marigold plate
 * stamped onto the table with the minutes as large as the page allows, the drawings of
 * what is being cooked spilling round it, and a tag that says in words (and a tick) whether
 * it fitted. The other three numbers are smaller cut-outs underneath, one colour each.
 *
 * Everything here is decoration around text that stays ink on a light ground or paper on
 * plum, so it reads the same with the collage switched off.
 */

type Drawing = { src: string; key: string };

type PosterProps = {
  makespanMin: number;
  budgetMin: number;
  drawings: Drawing[];
};

/** Where the drawings land round the plate: corners, never over the number. */
const DRAWING_SPOTS = [
  'left-[-1%] top-[5%] w-[22%] -rotate-[16deg]',
  'right-[-1%] top-[30%] w-[19%] rotate-[14deg]',
  'bottom-[1%] right-[1%] w-[22%] rotate-[8deg]',
  'bottom-[18%] left-[-2%] w-[17%] -rotate-[10deg]',
];

export const FitPoster = ({ makespanMin, budgetMin, drawings }: PosterProps) => {
  const fits = makespanMin <= budgetMin;
  return (
    <div className="relative mx-auto aspect-[8/7] w-full max-w-[26rem] sm:aspect-square">
      <span
        aria-hidden="true"
        className="absolute left-[3%] top-[5%] block h-[50%] w-[58%] -rotate-[14deg] bg-paprika [clip-path:var(--mk-cut-shard)]"
      />
      <span
        aria-hidden="true"
        className="absolute right-[1%] top-[3%] block h-[15%] w-[46%] rotate-[7deg] bg-enamel [clip-path:var(--mk-cut-tag)]"
      />
      <span
        aria-hidden="true"
        className="absolute bottom-[3%] right-[6%] block h-[36%] w-[42%] rotate-[11deg] bg-garden [clip-path:var(--mk-cut-patch)]"
      />
      <Motif
        name="poppy"
        className="absolute bottom-[6%] left-[14%] w-[20%] -rotate-[8deg]"
        m1="var(--mk-plum-900)"
      />

      <div
        className="absolute inset-x-[8%] inset-y-[11%] grid -rotate-[3deg] place-content-center bg-marigold px-[13%] text-center text-plum-900 [--stamp-from:-16deg] [--stamp-to:-3deg] [clip-path:var(--mk-cut-plate)]
          motion-safe:animate-[mk-stamp_var(--d-slow)_var(--mk-ease-stamp)_both]"
      >
        <span
          className={`voice-display block leading-[0.82] ${
            // Three digits at two-digit size would run off the plate and into its cut.
            String(makespanMin).length > 2
              ? 'text-[length:clamp(4rem,19vw,6.75rem)]'
              : 'text-[length:clamp(5.5rem,27vw,9.5rem)]'
          }`}
        >
          {makespanMin}
        </span>
        <span className="mt-2 block text-sm font-bold leading-snug [font-variation-settings:var(--mk-sharp)]">
          {`minutes in the kitchen, of the ${budgetMin} you had`}
        </span>
      </div>

      {drawings.map((d, i) => (
        <img
          key={d.key}
          src={d.src}
          alt=""
          draggable={false}
          className={`pointer-events-none absolute h-auto select-none ${DRAWING_SPOTS[i % DRAWING_SPOTS.length]}`}
        />
      ))}

      <p
        className={`mk-tag absolute bottom-[4%] left-[22%] -rotate-[5deg] gap-2 px-4 py-2 text-lg font-bold
          motion-safe:animate-[mk-stamp_var(--d-slow)_var(--mk-ease-stamp)_200ms_both] [--stamp-from:10deg] [--stamp-to:-4deg]
          ${fits ? 'mk-tag--success' : 'mk-tag--warning'}`}
      >
        <Icon name={fits ? 'check' : 'alert'} className="h-6 w-6 [stroke-width:2.8]" />
        {fits ? 'It fits' : `${makespanMin - budgetMin} min over`}
      </p>
    </div>
  );
};

type StatItem = { value: ReactNode; label: string };

/** One colour per cut-out, each with the ink that is legal on it. */
const CUTOUT = [
  { ground: 'bg-enamel text-plum-900', number: 'text-plum-900', tilt: '-rotate-[1.2deg]', cut: 'var(--mk-cut-patch)' },
  { ground: 'bg-garden-100 text-plum-900', number: 'text-garden-700', tilt: 'rotate-[0.8deg]', cut: 'var(--mk-cut-tag)' },
  { ground: 'bg-mk-plum text-paper', number: 'text-enamel', tilt: '-rotate-[0.6deg]', cut: 'var(--mk-cut-patch)' },
];

export const StatStrip = ({ items }: { items: StatItem[] }) => (
  <ul className="grid gap-3 lg:grid-cols-3 lg:gap-4">
    {items.map((item, i) => {
      const look = CUTOUT[i % CUTOUT.length]!;
      return (
        <li
          key={item.label}
          style={{ clipPath: look.cut }}
          className={`flex items-center gap-4 px-5 py-5 sm:gap-6 sm:px-7 lg:block lg:px-6 lg:pb-6 lg:pt-6 ${look.ground} ${look.tilt}`}
        >
          <span className={`voice-display block min-w-[6.5rem] flex-none text-3xl leading-none sm:text-4xl ${look.number}`}>
            {item.value}
          </span>
          <span className="block text-sm font-semibold leading-snug [font-variation-settings:var(--mk-sharp)] lg:mt-3">
            {item.label}
          </span>
        </li>
      );
    })}
  </ul>
);
