import { useMemo, useState } from 'react';
import { selectCompiled, selectMe, useSync } from '@/app/sync';
import { clockText, elapsedSeconds, holdsAt, type Watch } from '@/app/story';
import { Button, Glyph } from '../primitives';
import { allocateDishHues } from '../theme';
import { Story } from './Story';
import { useNow } from './useNow';

/**
 * Cooking, live.
 *
 * A phone in a hand shows its owner's slide, full size, with a Done button you can hit with
 * wet hands. A screen on the counter shows everyone's, one tile each. Both show what is
 * looking after itself on the stove, because those timers belong to the kitchen and not to
 * any one cook. All of it runs off the same compiled schedule and the same server clock, so
 * the phones agree with each other and with the display.
 */
export const Cooking = () => {
  const session = useSync((s) => s.session);
  const compiled = useSync(selectCompiled);
  const me = useSync(selectMe);
  const startedAtMs = useSync((s) => s.startedAtMs);
  const completed = useSync((s) => s.completed);
  const offline = useSync((s) => s.offline);
  const error = useSync((s) => s.error);
  const complete = useSync((s) => s.complete);
  const dismissError = useSync((s) => s.dismissError);
  const leave = useSync((s) => s.leave);
  const nowMs = useNow();

  const [view, setView] = useState<'me' | 'all'>(me ? 'me' : 'all');
  const completedSet = useMemo(() => new Set(completed), [completed]);

  if (!session) return null;

  if (!compiled) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-[640px] flex-col justify-center gap-5 px-5 py-8">
        <span className="text-tomato-ink">
          <Glyph name="state-impossible" size={64} />
        </span>
        <h1 className="voice-display text-2xl">This device has no timeline to show</h1>
        <p className="text-md text-ink-soft">
          It could not compile the session it was sent, which usually means it is running an
          older version of the app. Reload and join again.
        </p>
        <div>
          <Button variant="secondary" onClick={leave}>
            Leave
          </Button>
        </div>
      </main>
    );
  }

  const { plan, schedule } = compiled;
  const elapsedSec = startedAtMs === null ? 0 : elapsedSeconds(startedAtMs, nowMs);
  const hues = allocateDishHues(plan.dishes.map((d) => d.id));
  const stove = holdsAt(schedule, elapsedSec);
  const nameOf = (cookId: string, fallback: string): string =>
    session.members.find((m) => m.cookId === cookId)?.displayName ?? fallback;
  const myIndex = me ? session.crew.findIndex((c) => c.id === me.cookId) : -1;
  const mine = myIndex >= 0 ? session.crew[myIndex] : undefined;
  const showingMe = view === 'me' && mine !== undefined;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[1100px] flex-col gap-4 px-4 py-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">Cooking · {plan.name}</p>
          <p className="voice-numeral text-lg" aria-live="off">
            minute {Math.floor(elapsedSec / 60)} of {schedule.makespanMin}
          </p>
        </div>
        {mine ? (
          <div className="flex gap-1 rounded-sm bg-cream-deep p-1" role="tablist" aria-label="Whose steps">
            <Tab active={showingMe} onClick={() => setView('me')}>
              Me
            </Tab>
            <Tab active={!showingMe} onClick={() => setView('all')}>
              Everyone
            </Tab>
          </div>
        ) : null}
      </header>

      {offline ? (
        <p role="status" className="rounded-sm bg-orange-wash p-2 text-xs">
          Lost the server for a moment. The timers keep running; taps are saved when it is back.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="flex items-center justify-between gap-3 rounded-sm bg-tomato-wash p-3 text-sm">
          <span>{error}</span>
          <button type="button" onClick={dismissError} className="min-h-[44px] px-2 text-xs font-bold text-tomato-ink">
            ok
          </button>
        </p>
      ) : null}

      {showingMe && mine ? (
        <Story
          schedule={schedule}
          cook={mine}
          cookIndex={myIndex}
          displayName={nameOf(mine.id, mine.name)}
          elapsedSec={elapsedSec}
          completed={completedSet}
          hues={hues}
          onDone={(taskId) => void complete(taskId)}
          size="full"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {session.crew.map((cook, index) => (
            <Story
              key={cook.id}
              schedule={schedule}
              cook={cook}
              cookIndex={index}
              displayName={nameOf(cook.id, cook.name)}
              elapsedSec={elapsedSec}
              completed={completedSet}
              hues={hues}
              onDone={(taskId) => void complete(taskId)}
              size="compact"
            />
          ))}
        </div>
      )}

      {stove.length > 0 ? <Stove watches={stove} /> : null}

      <footer className="flex flex-wrap items-center gap-3 pb-4">
        <Button variant="quiet" onClick={leave}>
          Leave the session
        </Button>
        <p className="text-xs text-ink-soft">
          Every phone compiled this timeline for itself and counts on the same clock.
        </p>
      </footer>
    </main>
  );
};

const Stove = ({ watches }: { watches: Watch[] }) => (
  <section aria-label="Looking after itself" className="rounded-md bg-cream-deep p-4">
    <h2 className="text-sm font-bold">Looking after itself</h2>
    <ul className="mt-2 grid gap-2 sm:grid-cols-2">
      {watches.map((w) => (
        <li key={w.task.id} className="flex items-center justify-between gap-3 rounded-sm bg-cream p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{w.task.name}</p>
            <p className="text-xs text-ink-soft">{w.dishName}</p>
          </div>
          <span className="voice-numeral flex-none text-lg" aria-label={`${clockText(w.secondsLeft)} left`}>
            {clockText(w.secondsLeft)}
          </span>
        </li>
      ))}
    </ul>
  </section>
);

const Tab = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) => (
  <button
    type="button"
    role="tab"
    aria-selected={active}
    onClick={onClick}
    className={`min-h-[44px] rounded-xs px-4 text-sm font-bold transition-colors duration-fast ${
      active ? 'bg-cream text-charcoal shadow-1' : 'text-ink-soft hover:text-charcoal'
    }`}
  >
    {children}
  </button>
);
