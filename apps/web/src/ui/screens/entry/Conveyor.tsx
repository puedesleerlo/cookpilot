import type { CookProgress } from '@kitchen/contracts';
import garlic from '@/assets/makitra/ingredients/garlic.svg';
import tomato from '@/assets/makitra/ingredients/tomato.svg';
import carrot from '@/assets/makitra/ingredients/carrot.svg';
import { Glyph, Motif, type GlyphName } from '../../primitives';

/**
 * The workshop belt: four stations the answers travel along, from being heard to being
 * timed. Which station is lit comes from the events that have actually arrived, never from
 * a clock — a station says "now" because the pipeline has reported starting that kind of
 * work, and the belt's drums only turn while the pipeline is running.
 */

const STATIONS: { label: string; glyph: GlyphName }[] = [
  { label: 'Hear', glyph: 'cook-2' },
  { label: 'Search', glyph: 'colander' },
  { label: 'Read', glyph: 'cutting-board' },
  { label: 'Plan', glyph: 'burner' },
];

/** The station an event says the work has reached. Hearing is done once it has been heard. */
const REACHED: Record<CookProgress['kind'], number> = {
  heard: 1,
  searching: 1,
  reading: 2,
  found: 2,
  skipped: 2,
  finished: 3,
  failed: 0,
};

type State = 'done' | 'now' | 'next' | 'stopped';

const LOOK: Record<State, { plate: string; ink: string; tag: string; word: string }> = {
  done: { plate: 'bg-garden', ink: 'text-paper', tag: 'mk-tag--success', word: 'done' },
  now: { plate: 'bg-paprika', ink: 'text-paper', tag: '[--tag-bg:var(--mk-paprika-100)] [--tag-fg:var(--mk-paprika-700)]', word: 'now' },
  next: { plate: 'bg-flour-deep', ink: 'text-muted', tag: 'text-muted', word: 'next' },
  stopped: { plate: 'bg-beet', ink: 'text-paper', tag: 'mk-tag--danger', word: 'stopped' },
};

const STAMP = 'motion-safe:animate-[mk-stamp_var(--d-slow)_var(--mk-ease-stamp)_both]';

export const Conveyor = ({ progress, finding }: { progress: CookProgress[]; finding: boolean }) => {
  const at = progress.reduce((max, event) => Math.max(max, REACHED[event.kind]), 0);
  const failed = progress.some((event) => event.kind === 'failed');
  const finished = progress.some((event) => event.kind === 'finished');

  const stateOf = (i: number): State => {
    if (i < at) return 'done';
    if (i > at) return 'next';
    if (failed) return 'stopped';
    return finished && !finding ? 'done' : 'now';
  };

  return (
    <div className="relative pb-1">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[26px] sm:top-[38px]">
        <span className="block h-[20px] bg-mk-plum [clip-path:var(--mk-cut-patch)] sm:h-[24px]" />
        <Drum className="-left-[6px]" turning={finding} />
        <Drum className="-right-[6px]" turning={finding} />
        <span className="absolute inset-x-[12%] -top-[40px] hidden h-[44px] items-end justify-around sm:flex">
          <img src={tomato} alt="" className="ml-[6%] w-[46px] translate-y-[4px] [rotate:-8deg]" />
          <img src={garlic} alt="" className="w-[34px] translate-y-[2px] [rotate:6deg]" />
          <img src={carrot} alt="" className="mr-[4%] w-[70px] translate-y-[2px] [rotate:-3deg]" />
        </span>
      </div>

      <ol aria-label="Stages" className="relative grid grid-cols-4 gap-1 sm:gap-4">
        {STATIONS.map((station, i) => {
          const state = stateOf(i);
          const look = LOOK[state];
          return (
            <li key={station.label} className="flex flex-col items-center gap-2 text-center">
              <span
                key={state}
                aria-hidden="true"
                className={`relative grid h-[72px] w-[72px] place-items-center sm:h-[100px] sm:w-[100px] ${state === 'next' ? '' : STAMP}`}
              >
                <span className={`absolute inset-0 ${look.plate} [clip-path:var(--mk-cut-plate)]`} />
                <span className={`relative ${look.ink}`}>
                  <Glyph name={station.glyph} size={40} strokeWidth={2} className="sm:h-[52px] sm:w-[52px]" />
                </span>
              </span>
              <span className="text-md font-bold leading-tight [font-variation-settings:var(--mk-sharp)]">
                {station.label}
              </span>
              <span className={`mk-tag px-[6px] sm:px-[9px] ${look.tag}`}>
                <StateMark state={state} />
                {look.word}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

/** A belt drum: a paper daisy that turns while the pipeline runs and rests when it stops. */
const Drum = ({ className, turning }: { className: string; turning: boolean }) => (
  <span className={`absolute -top-[10px] block h-[40px] w-[40px] sm:-top-[8px] ${className}`}>
    <Motif
      name="daisy"
      m1="var(--mk-plum-900)"
      m3="var(--mk-marigold)"
      className={`h-full w-full ${turning ? 'motion-safe:animate-[spin_2.4s_linear_infinite]' : ''}`}
    />
  </span>
);

const StateMark = ({ state }: { state: State }) => {
  if (state === 'now') {
    return (
      <span aria-hidden="true" className="block h-[12px] w-[12px] bg-paprika [clip-path:var(--mk-cut-burst)] motion-safe:animate-spin" />
    );
  }
  const path = state === 'done' ? 'M4.5 12.5l5 5 10-11' : state === 'stopped' ? 'M5.5 5.5l13 13M18.5 5.5l-13 13' : 'M5 12h14';
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" aria-hidden="true">
      <path d={path} />
    </svg>
  );
};
