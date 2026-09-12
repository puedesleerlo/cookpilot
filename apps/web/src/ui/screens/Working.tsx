import { useEffect, useRef } from 'react';
import type { CookProgress } from '@kitchen/contracts';
import { useSession } from '@/app/store';
import { Button, Glyph } from '../primitives';

/**
 * What it is doing, while it does it.
 *
 * The chain takes the better part of a minute: it reads two answers, writes searches, and
 * opens four strangers' web pages. A spinner for that long reads as broken, and a progress
 * bar would be a lie, because nothing here knows how long a page will take.
 *
 * So it narrates. Every line is something that actually happened, in the order it happened,
 * and nothing on this screen is on a timer — if the log is still, the pipeline is still
 * working on the last line. That is also why the failures are here rather than saved up for
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
    <main className="mx-auto flex min-h-dvh max-w-[760px] flex-col gap-5 px-5 py-7">
      <header>
        <h1 className="voice-display text-3xl">Finding your week</h1>
        <p className="mt-2 max-w-measure text-md text-ink-soft">
          Reading real recipes off the web and working out the timings. It takes about a
          minute — most of that is other people's websites.
        </p>
      </header>

      <ol className="flex flex-col gap-2" aria-live="polite" aria-label="Progress">
        {progress.map((event, i) => (
          <Line key={`${event.kind}-${i}`} event={event} />
        ))}
        {finding ? (
          <li className="flex items-center gap-3 text-sm text-ink-soft">
            <Pulse />
            {progress.length === 0 ? 'Listening to what you said…' : 'Still going…'}
          </li>
        ) : null}
        <div ref={bottom} />
      </ol>

      {found > 0 ? (
        <p className="text-sm text-ink-soft">
          {found} {found === 1 ? 'recipe' : 'recipes'} so far.
        </p>
      ) : null}

      <footer className="pb-4">
        <Button variant="quiet" onClick={() => goTo('speak')} disabled={finding}>
          Start over
        </Button>
      </footer>
    </main>
  );
};

/** A dot that breathes. The only thing on this screen that moves. */
const Pulse = () => (
  <span
    aria-hidden="true"
    className="h-2 w-2 flex-none rounded-full bg-tomato motion-safe:animate-pulse"
  />
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
            <span className="block text-tomato-ink">
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
        <Entry glyph="beverage-base" title={`Looking for "${event.query}"`}>
          <span className="text-xs text-ink-faint">
            search {event.index + 1} of {event.total}
          </span>
        </Entry>
      );
    case 'reading':
      return <Entry glyph="pantry" title={`Reading ${event.site}…`} />;
    case 'found':
      return (
        <Entry tone="good" glyph="protein-cooked" title={event.title}>
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
        <Entry tone="good" glyph="state-success" title="Working out the timings">
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
  glyph: 'produce' | 'pantry' | 'protein-cooked' | 'beverage-base' | 'state-empty' | 'state-success' | 'state-impossible';
  title: string;
  tone?: 'plain' | 'good' | 'quiet' | 'bad';
  children?: React.ReactNode;
};

const TONE = {
  plain: { box: 'bg-cream-deep', icon: 'text-ink-soft' },
  good: { box: 'bg-sage-wash', icon: 'text-sage-ink' },
  quiet: { box: 'bg-cream-deep/60', icon: 'text-ink-faint' },
  bad: { box: 'bg-tomato-wash', icon: 'text-tomato-ink' },
} as const;

const Entry = ({ glyph, title, tone = 'plain', children }: EntryProps) => (
  <li
    className={`flex items-start gap-3 rounded-sm p-3 ${TONE[tone].box}
      motion-safe:animate-[chip-settle_var(--d-base)_var(--ease-settle)_both]`}
  >
    <span className={`flex-none ${TONE[tone].icon}`}>
      <Glyph name={glyph} size={22} />
    </span>
    <span className="min-w-0 flex-1">
      <span className={`block text-sm ${tone === 'quiet' ? 'text-ink-soft' : 'font-semibold'}`}>
        {title}
      </span>
      <span className="block text-xs text-ink-soft">{children}</span>
    </span>
  </li>
);
