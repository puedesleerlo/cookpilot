import { useEffect, useRef } from 'react';
import type { CookProgress } from '@kitchen/contracts';
import { useSession } from '@/app/store';
import { Button, Glyph, type GlyphName } from '../primitives';
import { Conveyor } from './entry/Conveyor';

/**
 * What it is doing, while it does it.
 *
 * The chain takes the better part of a minute: it reads two answers, writes searches, and
 * opens four strangers' web pages. A spinner for that long reads as broken, and a progress
 * bar would be a lie, because nothing here knows how long a page will take.
 *
 * So it narrates. Every line is something that actually happened, in the order it happened,
 * printed as a receipt on the kitchen's ticket rail, and nothing on this screen is on a
 * timer — if the log is still, the pipeline is still working on the last line. The belt
 * above it only says which kind of work the last line was. That is also why the failures are here rather than saved up for
 * the results screen: "that site would not let us read it" is interesting while you are
 * waiting and just noise once the food has arrived.
 */

export const Working = () => {
  const progress = useSession((s) => s.progress);
  const finding = useSession((s) => s.finding);
  const goTo = useSession((s) => s.goTo);
  const bottom = useRef<HTMLDivElement>(null);

  // Follow the tail, the way a terminal does. Guarded because `scrollIntoView` is missing
  // in jsdom and in some embedded webviews, and following the log is a nicety — losing it
  // should never take the screen down with it.
  useEffect(() => {
    bottom.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' });
  }, [progress.length]);

  const found = progress.filter((e) => e.kind === 'found').length;

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-[1120px] flex-col gap-7 px-5 pb-[40px] pt-6 sm:px-[40px] sm:pt-7">
      <header className="relative">
        <h1 className="voice-display leading-[0.9] [font-size:clamp(2.75rem,13vw,5.5rem)]">
          Finding your{' '}
          <span className={`relative inline-block px-[0.16em] pb-[0.04em] pt-[0.1em] text-plum-900 [rotate:-3deg] ${STAMP}`}>
            <span aria-hidden="true" className="absolute inset-0 bg-marigold [clip-path:var(--mk-cut-tag)]" />
            <span className="relative">week</span>
          </span>
        </h1>
        <p className="mt-4 max-w-[48ch] text-md text-muted">
          Reading real recipes off the web and working out the timings. It takes about a
          minute — most of that is other people's websites.
        </p>
      </header>

      <Conveyor progress={progress} finding={finding} />

      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-[48px]">
        <div>
          {/* The ticket rail the receipts hang from. */}
          <span aria-hidden="true" className="mb-3 block h-[12px] bg-plum-900 [clip-path:var(--mk-cut-patch)]" />
          <ol className="flex flex-col gap-3" aria-live="polite" aria-label="Progress">
            {progress.map((event, i) => (
              <Line key={`${event.kind}-${i}`} event={event} />
            ))}
            {finding ? (
              <li className="flex min-h-[56px] items-center gap-4 rounded-nick-md bg-sunken px-4 py-3 text-md text-muted">
                <Dots />
                {progress.length === 0 ? 'Listening to what you said…' : 'Still going…'}
              </li>
            ) : null}
            <div ref={bottom} />
          </ol>
        </div>

        <aside className="flex flex-col items-start gap-5 lg:sticky lg:top-6">
          {found > 0 ? (
            <div className="flex items-center gap-4">
              <span aria-hidden="true" className="relative grid h-[104px] w-[104px] flex-none place-items-center">
                <span key={found} className={`absolute inset-0 bg-marigold [clip-path:var(--mk-cut-burst)] [--stamp-from:-30deg] ${STAMP}`} />
                <span className="voice-display relative translate-y-[3px] text-[3.25rem] leading-none text-plum-900">{found}</span>
              </span>
              <p className="text-md font-semibold">
                {found} {found === 1 ? 'recipe' : 'recipes'} so far.
              </p>
            </div>
          ) : null}

          <footer>
            <Button variant="quiet" onClick={() => goTo('speak')} disabled={finding}>
              Start over
            </Button>
          </footer>
        </aside>
      </div>
    </main>
  );
};

const STAMP = 'motion-safe:animate-[mk-stamp_var(--d-slow)_var(--mk-ease-stamp)_both]';

/** Three paper squares taking turns: the only thing in the log that moves, and only while it works. */
const Dots = () => (
  <span aria-hidden="true" className="flex flex-none items-center gap-[5px]">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="block h-[10px] w-[10px] rounded-nick-xs bg-paprika motion-safe:animate-pulse"
        style={{ animationDelay: `${i * 200}ms` }}
      />
    ))}
  </span>
);

const Line = ({ event }: { event: CookProgress }) => {
  switch (event.kind) {
    case 'heard': {
      const urgent = event.pantry.filter((p) => p.urgent).map((p) => p.name);
      return (
        <Entry tone="good" glyph="produce" title="Here is what I heard">
          <span className="block">
            {event.pantry.length > 0
              ? event.pantry.map((p) => p.name).join(', ')
              : 'nothing in the fridge yet'}
          </span>
          {urgent.length > 0 ? (
            <span className="block font-semibold text-paprika-700">
              {urgent.join(' and ')} {urgent.length === 1 ? 'needs' : 'need'} using first.
            </span>
          ) : null}
          <span className="block">
            {event.cookCount === 1 ? 'One of you cooking' : `${event.cookCount} of you cooking`} —
            aiming for {event.portionTarget} portions, a week of meals.
          </span>
        </Entry>
      );
    }
    case 'searching':
      return (
        <Entry glyph="colander" title={`Looking for "${event.query}"`}>
          <span>
            search {event.index + 1} of {event.total}
          </span>
        </Entry>
      );
    case 'reading':
      return <Entry tone="reading" glyph="cutting-board" title={`Reading ${event.site}…`} />;
    case 'found':
      return (
        <Entry tone="found" glyph="protein-cooked" title={event.title} stamp="found">
          <span>
            {event.site} · {event.steps} steps · scaled to serve {event.servings}
          </span>
        </Entry>
      );
    case 'skipped':
      return (
        <Entry tone="quiet" glyph="state-empty" title={`Skipped ${event.site}`}>
          <span>{event.reason}</span>
        </Entry>
      );
    case 'finished':
      return (
        <Entry tone="found" glyph="state-success" title="Working out the timings">
          <span>
            {event.recipes} {event.recipes === 1 ? 'recipe' : 'recipes'} to schedule.
          </span>
        </Entry>
      );
    case 'failed':
      return (
        <Entry tone="bad" glyph="state-impossible" title="That did not work">
          <span>{event.reason}</span>
        </Entry>
      );
  }
};

type EntryProps = {
  glyph: GlyphName;
  title: string;
  tone?: 'plain' | 'good' | 'reading' | 'found' | 'quiet' | 'bad';
  /** A word stamped on the corner of the receipt, for the lines that are results. */
  stamp?: string;
  children?: React.ReactNode;
};

/** The slip each tone is printed on, and the stub its drawing sits in. */
const TONE = {
  plain: { slip: 'bg-surface', stub: 'bg-cornflower-100', ink: 'text-cornflower-700', title: 'font-semibold' },
  good: { slip: 'bg-surface', stub: 'bg-garden-100', ink: 'text-garden-700', title: 'font-semibold' },
  reading: { slip: 'bg-surface', stub: 'bg-marigold-100', ink: 'text-plum-900', title: 'font-semibold' },
  found: { slip: 'bg-surface', stub: 'bg-garden', ink: 'text-paper', title: 'font-bold' },
  quiet: { slip: 'bg-sunken', stub: 'bg-flour-deep', ink: 'text-muted', title: 'text-muted' },
  bad: { slip: 'bg-danger-bg', stub: 'bg-beet', ink: 'text-paper', title: 'font-bold' },
} as const;

/** A receipt torn off the printer: tilted a hair, slid onto the rail, ragged at the bottom. */
const Entry = ({ glyph, title, tone = 'plain', stamp, children }: EntryProps) => (
  <li
    className="relative odd:[rotate:-0.4deg] even:[rotate:0.35deg]
      motion-safe:animate-[mk-slide_var(--d-slow)_var(--mk-ease-simmer)_both] [--slide-from:-20px]"
  >
    <span aria-hidden="true" className={`absolute inset-0 ${TONE[tone].slip} [clip-path:var(--mk-cut-edge-bottom)]`} />
    <span className="relative flex items-start gap-4 px-4 pb-[26px] pt-4 sm:px-5">
      <span aria-hidden="true" className="relative grid h-[48px] w-[48px] flex-none place-items-center">
        <span className={`absolute inset-0 ${TONE[tone].stub} [clip-path:var(--mk-cut-plate)]`} />
        <span className={`relative ${TONE[tone].ink}`}>
          <Glyph name={glyph} size={28} strokeWidth={2} />
        </span>
      </span>
      <span className="min-w-0 flex-1 pt-[2px]">
        <span className={`block text-md leading-snug ${TONE[tone].title}`}>{title}</span>
        <span className="mt-1 block text-sm text-muted">{children}</span>
      </span>
      {stamp ? (
        <span className="mk-tag mk-tag--success flex-none [rotate:-6deg]">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square" aria-hidden="true">
            <path d="M4.5 12.5l5 5 10-11" />
          </svg>
          {stamp}
        </span>
      ) : null}
    </span>
  </li>
);
