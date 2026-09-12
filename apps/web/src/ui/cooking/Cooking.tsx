import { useMemo, useState } from 'react';
import emptyTimers from '@/assets/makitra/illustrations/empty-timers.svg';
import { selectCompiled, selectMe, useSync } from '@/app/sync';
import { clockText, elapsedSeconds, holdsAt, startsSince, type Watch } from '@/app/story';
import { Button, Display, Glyph, Patch, type PatchTone } from '../primitives';
import { allocateDishHues } from '../theme';
import { InvitePanel, InvitePocket } from './Invite';
import { Dial, Icon } from './Paper';
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
 *
 * The whole flow is Makitra's night kitchen (`mk-cook`): it stays dark whatever the rest of
 * the app is doing, because it is read across a stove, not at a desk.
 */
export const Cooking = () => {
  const session = useSync((s) => s.session);
  const role = useSync((s) => s.role);
  const compiled = useSync(selectCompiled);
  const me = useSync(selectMe);
  const startedAtMs = useSync((s) => s.startedAtMs);
  const completed = useSync((s) => s.completed);
  const started = useSync((s) => s.started);
  const offline = useSync((s) => s.offline);
  const error = useSync((s) => s.error);
  const complete = useSync((s) => s.complete);
  const startNow = useSync((s) => s.startNow);
  const dismissError = useSync((s) => s.dismissError);
  const leave = useSync((s) => s.leave);
  const nowMs = useNow();

  const [view, setView] = useState<'me' | 'all'>(me ? 'me' : 'all');
  const completedSet = useMemo(() => new Set(completed), [completed]);
  const starts = useMemo(() => startsSince(started, startedAtMs ?? 0), [started, startedAtMs]);

  if (!session) return null;

  if (!compiled) {
    return (
      <div className="mk-cook min-h-dvh">
        <main className="mx-auto flex min-h-dvh max-w-[640px] flex-col justify-center gap-5 px-5 py-8">
          <span aria-hidden="true" className="relative grid h-[8rem] w-[8rem] place-items-center">
            <Patch tone="soup" cut="burst" className="absolute inset-0 [rotate:-8deg] motion-safe:animate-[mk-stamp_var(--d-slow)_var(--mk-ease-stamp)_both]" />
            <span className="relative text-paper">
              <Glyph name="state-impossible" size={60} strokeWidth={2.2} />
            </span>
          </span>
          <Display as="h1" className="text-[length:var(--mk-text-2xl)] sm:text-[length:var(--mk-text-3xl)]">
            This device has no timeline to show
          </Display>
          <p className="text-md text-muted">
            It could not compile the session it was sent, which usually means it is running an
            older version of the app. Reload and join again.
          </p>
          <div>
            <Button variant="secondary" onClick={leave}>
              Leave
            </Button>
          </div>
        </main>
      </div>
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
  /** The device that opened the session keeps its join code on screen until the end. */
  const host = role === 'host';

  return (
    <div className="mk-cook min-h-dvh">
      <main className="mx-auto flex min-h-dvh w-full max-w-[1240px] flex-col gap-4 px-4 pt-3 sm:px-6 sm:pt-5">
        {/* Two rows so a phone has room for the invite beside the plan's name. */}
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
          <p className="truncate text-xs font-bold uppercase tracking-[0.14em] text-muted">Cooking · {plan.name}</p>
          {host ? (
            <InvitePocket joinCode={session.joinCode} className="col-start-2 row-start-1 lg:hidden" />
          ) : null}
          <p
            className="voice-numeral col-start-1 row-start-2 inline-block justify-self-start whitespace-nowrap bg-marigold pb-[3px] pl-2 pr-3 pt-[2px] text-md leading-tight text-charcoal [clip-path:var(--mk-cut-tag)] sm:text-lg"
            style={{ rotate: '-2deg' }}
            aria-live="off"
          >
            minute {Math.floor(elapsedSec / 60)} of {schedule.makespanMin}
          </p>
          {mine ? (
            <div className="col-start-2 row-start-2 flex flex-none gap-1 justify-self-end rounded-nick-md bg-sunken p-1" role="tablist" aria-label="Whose steps">
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
          <p role="status" className="mk-tag mk-tag--warning self-start whitespace-normal py-2 text-sm">
            <Icon name="clock" />
            Lost the server for a moment. The timers keep running; taps are saved when it is back.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="flex items-center justify-between gap-3 rounded-nick-md bg-danger-bg py-1 pl-4 pr-1 text-sm text-charcoal">
            <span className="flex items-center gap-2">
              <Icon name="alert" className="flex-none text-danger" />
              {error}
            </span>
            <button type="button" onClick={dismissError} className="mk-btn mk-btn--quiet flex-none text-sm text-danger">
              ok
            </button>
          </p>
        ) : null}

        {showingMe && mine ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-7">
            <Story
              schedule={schedule}
              cook={mine}
              cookIndex={myIndex}
              displayName={nameOf(mine.id, mine.name)}
              elapsedSec={elapsedSec}
              completed={completedSet}
              starts={starts}
              hues={hues}
              onDone={(taskId) => void complete(taskId)}
              onStart={(taskId) => void startNow(taskId)}
              size="full"
            />
            <div className="flex flex-col gap-6 lg:sticky lg:top-5">
              {stove.length > 0 ? <Stove watches={stove} layout="side" /> : <NothingOnTheStove />}
              {host ? <InvitePanel joinCode={session.joinCode} className="hidden lg:flex" /> : null}
            </div>
          </div>
        ) : (
          <div className={`grid grid-cols-1 gap-6 ${host ? 'lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-7' : ''}`}>
            <div className="flex min-w-0 flex-col gap-6">
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {session.crew.map((cook, index) => (
                  <Story
                    key={cook.id}
                    schedule={schedule}
                    cook={cook}
                    cookIndex={index}
                    displayName={nameOf(cook.id, cook.name)}
                    elapsedSec={elapsedSec}
                    completed={completedSet}
                    starts={starts}
                    hues={hues}
                    onDone={(taskId) => void complete(taskId)}
                    onStart={(taskId) => void startNow(taskId)}
                    size="compact"
                  />
                ))}
              </div>
              {stove.length > 0 ? <Stove watches={stove} layout="wide" /> : null}
            </div>
            {host ? <InvitePanel joinCode={session.joinCode} className="hidden lg:sticky lg:top-5 lg:flex" /> : null}
          </div>
        )}

        <footer className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pb-5 pt-4">
          <Button variant="quiet" onClick={leave}>
            Leave the session
          </Button>
          <p className="text-xs text-muted">
            Every phone compiled this timeline for itself and counts on the same clock.
          </p>
        </footer>
      </main>
    </div>
  );
};

/** Grounds for the hands-free timers: the pale patches, where plum ink is legal at any size. */
const STOVE_TONES: PatchTone[] = ['dough', 'preserve', 'drink'];
const STOVE_TILT = [-1.5, 1, -0.5, 1.5];

const Stove = ({ watches, layout }: { watches: Watch[]; layout: 'side' | 'wide' }) => (
  <section aria-label="Looking after itself">
    <div className="flex items-center gap-3">
      <span className="text-enamel">
        <Glyph name="pot" size={30} strokeWidth={1.8} />
      </span>
      <Display as="h2" className="text-[length:var(--mk-text-xl)]">
        Looking after itself
      </Display>
    </div>
    <ul className={`mt-4 grid grid-cols-1 gap-3 ${layout === 'side' ? 'sm:grid-cols-2 lg:grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-4'}`}>
      {watches.map((w, i) => (
        <li key={w.task.id} className="relative text-charcoal">
          <Patch
            tone={STOVE_TONES[i % STOVE_TONES.length]!}
            cut="patch"
            aria-hidden="true"
            className="absolute inset-0"
            style={{ rotate: `${STOVE_TILT[i % STOVE_TILT.length]}deg` }}
          />
          <div className="relative flex items-center gap-3 px-4 py-3">
            <Dial fraction={1 - w.progress} tone="ink" stroke={34} plate={false} track="var(--mk-paper-bright)" className="w-[3.25rem]">
              <Icon name="timer" className="!h-4 !w-4" />
            </Dial>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-bold leading-snug [font-variation-settings:var(--mk-sharp)]">{w.task.name}</p>
              <p className="truncate text-xs">{w.dishName}</p>
            </div>
            <span className="voice-numeral flex-none text-lg leading-none" aria-label={`${clockText(w.secondsLeft)} left`}>
              {clockText(w.secondsLeft)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  </section>
);

/** The side column on a wide screen when nothing is simmering on its own. */
const NothingOnTheStove = () => (
  <div className="hidden flex-col items-center gap-3 rounded-nick-lg bg-surface p-6 text-center lg:flex">
    <img src={emptyTimers} alt="" className="w-[8rem]" />
    <p className="text-sm text-muted">Nothing is looking after itself right now. When something simmers or chills, its timer lands here.</p>
  </div>
);

const Tab = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) => (
  <button
    type="button"
    role="tab"
    aria-selected={active}
    onClick={onClick}
    className={`min-h-touch rounded-nick-sm px-4 text-sm font-bold transition-colors duration-fast [font-variation-settings:var(--mk-sharp)] ${
      active ? 'bg-enamel text-charcoal' : 'text-muted hover:text-ink'
    }`}
  >
    {children}
  </button>
);
