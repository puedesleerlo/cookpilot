import { useEffect, useMemo, useState } from 'react';
import type { Cook, Schedule } from '@kitchen/domain';
import {
  NO_STARTS,
  clockText,
  dishProgress,
  sessionProgress,
  slideFor,
  statusOf,
  stepsFor,
  windowOf,
  type Progress,
  type Starts,
  type Step,
  type StepStatus,
} from '@/app/story';
import { Button, Display, Glyph, Motif, Patch, cookGlyph } from '../primitives';
import { cookColor, dishHue } from '../theme';
import { humanMinutes } from '../timeline/model';
import { Dial, Icon, STAMP_IN, type DialTone } from './Paper';

/**
 * One cook's slide.
 *
 * The whole screen is one step and one number: what you are doing and how long the
 * compiler gave you to do it. The next step sits underneath, smaller, so a cook can see
 * what is coming without losing what is now. Everything on it is a fact the compiler
 * placed; the clock only decides which fact.
 *
 * The slide follows the clock on its own. A cook can also page back through what they did
 * and ahead through what is coming; the moment the clock moves the live step, a slide that
 * was left on it follows, and one that was paged away stays put until "Now" is tapped. The
 * action for the step in view is always on screen, pinned to the bottom, because a hand
 * that is wet does not scroll.
 *
 * It is drawn in Makitra's night kitchen (the parent wraps it in `mk-cook`): the step in
 * big paper-white type, the countdown as the 16-sided timer ring, and the next step on a
 * slip of paper laid underneath.
 */
type Props = {
  schedule: Schedule;
  cook: Cook;
  cookIndex: number;
  displayName: string;
  elapsedSec: number;
  completed: ReadonlySet<string>;
  /** Steps the cook started by hand, in seconds since the session began. */
  starts?: Starts;
  hues: Record<string, number>;
  onDone?: (taskId: string) => void;
  /** "Start it now": the step's timer runs from this moment, on every device. */
  onStart?: (taskId: string) => void;
  /** `full` is the phone in a hand; `compact` is one tile on the kitchen display. */
  size?: 'full' | 'compact';
};

export const Story = ({
  schedule,
  cook,
  cookIndex,
  displayName,
  elapsedSec,
  completed,
  starts = NO_STARTS,
  hues,
  onDone,
  onStart,
  size = 'full',
}: Props) => {
  const steps = useMemo(() => stepsFor(schedule, cook.id), [schedule, cook.id]);
  const slide = slideFor(steps, elapsedSec, completed, starts);
  const full = size === 'full';

  // Where the clock says the cook is: the live step, or the one they are waiting for.
  const liveIndex =
    slide.kind === 'now'
      ? steps.indexOf(slide.step)
      : slide.kind === 'wait'
        ? steps.indexOf(slide.until)
        : steps.length - 1;

  /** Null follows the clock; a number is a step the cook paged to. */
  const [pinned, setPinned] = useState<number | null>(null);
  // A paged-to step that the clock has since caught up with is live again; stop pinning it.
  useEffect(() => {
    if (pinned !== null && pinned === liveIndex) setPinned(null);
  }, [pinned, liveIndex]);

  const viewedIndex = pinned ?? liveIndex;
  const viewed = steps[viewedIndex];
  const following = pinned === null;
  const done = steps.filter((s) => completed.has(s.task.id)).length;
  const overall = sessionProgress(schedule, completed);
  const ofDish = viewed ? dishProgress(schedule, viewed.task.dishId, completed) : null;

  return (
    <section
      aria-label={`${displayName}'s steps`}
      className={`relative flex flex-col text-ink ${full ? '' : 'overflow-hidden rounded-nick-lg bg-surface px-4 pb-4 pt-0'}`}
    >
      {full ? null : (
        <span
          aria-hidden="true"
          className="-mx-4 mb-3 block h-3 [clip-path:var(--mk-cut-edge-bottom)]"
          style={{ background: cookColor(cookIndex) }}
        />
      )}
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className={`inline-flex items-center gap-2 pb-1 pl-2 pr-4 pt-1 text-paper [clip-path:var(--mk-cut-tag)] ${STAMP_IN}`}
          style={{ background: cookColor(cookIndex), rotate: '-2deg' }}
        >
          <Glyph name={cookGlyph(cookIndex)} size={full ? 30 : 26} strokeWidth={1.8} />
          <span className="text-md font-bold leading-tight [font-variation-settings:var(--mk-sharp)]">{displayName}</span>
        </span>
        <span className="text-sm text-muted">
          {cook.name} · {done} of {steps.length} done
        </span>
      </header>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Bar label="Whole session" progress={overall} fill="var(--mk-marigold)" />
        {viewed && ofDish ? <Bar label={viewed.dishName} progress={ofDish} fill={dishHue(viewed.task.dishId, hues[viewed.task.dishId])} /> : null}
      </div>

      {steps.length > 0 ? (
        <nav aria-label="Steps" className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="Previous step"
            disabled={viewedIndex <= 0}
            onClick={() => setPinned(Math.max(0, viewedIndex - 1))}
            className="mk-btn mk-btn--icon flex-none"
          >
            <Icon name="prev" />
          </button>
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="flex min-h-touch flex-wrap items-center justify-center gap-x-2 text-sm font-bold [font-variation-settings:var(--mk-sharp)]">
              Step {viewedIndex + 1} of {steps.length}
              {following ? null : (
                <button
                  type="button"
                  onClick={() => setPinned(null)}
                  className="mk-btn bg-enamel px-4 text-sm text-charcoal hover:bg-enamel-100"
                >
                  Now
                </button>
              )}
            </span>
            <Ticks count={steps.length} viewed={viewedIndex} live={liveIndex} completed={completed} steps={steps} />
          </div>
          <button
            type="button"
            aria-label="Next step"
            disabled={viewedIndex >= steps.length - 1}
            onClick={() => setPinned(Math.min(steps.length - 1, viewedIndex + 1))}
            className="mk-btn mk-btn--icon flex-none"
          >
            <Icon name="next" />
          </button>
        </nav>
      ) : null}

      {viewed ? (
        <StepView
          key={viewed.task.id}
          step={viewed}
          status={statusOf(viewed, elapsedSec, completed, starts)}
          elapsedSec={elapsedSec}
          starts={starts}
          live={following && slide.kind !== 'done'}
          waiting={following && slide.kind === 'wait'}
          next={following && slide.kind !== 'done' ? slide.next : null}
          hues={hues}
          full={full}
          accent={cookColor(cookIndex)}
        />
      ) : null}

      {slide.kind === 'done' && following ? (
        <div className={`relative mt-5 flex items-center gap-4 ${full ? 'py-2' : ''}`}>
          <span aria-hidden="true" className={`relative grid flex-none place-items-center ${full ? 'h-[7rem] w-[7rem]' : 'h-[4.5rem] w-[4.5rem]'}`}>
            <Patch tone="garden" cut="burst" className={`absolute inset-0 [rotate:-8deg] ${STAMP_IN}`} />
            <span className="relative text-paper">
              <Glyph name="state-success" size={full ? 52 : 34} strokeWidth={2.2} />
            </span>
            <Motif name="daisy" className="absolute -right-3 -top-2 w-[1.75rem]" m1="var(--mk-enamel)" m3="var(--mk-marigold)" />
          </span>
          <div className="min-w-0">
            <Display as="h2" className={full ? 'text-[length:var(--mk-text-3xl)]' : 'text-[length:var(--mk-text-xl)]'}>
              You&rsquo;re done
            </Display>
            <p className="mt-1 text-sm text-muted">
              Everything of yours is finished
              {slide.finishedMin > 0 ? `; the plan had you free at minute ${slide.finishedMin}` : ''}.
            </p>
          </div>
        </div>
      ) : null}

      <Actions
        step={viewed ?? null}
        status={viewed ? statusOf(viewed, elapsedSec, completed, starts) : null}
        allDone={slide.kind === 'done'}
        following={following}
        onDone={onDone}
        onStart={onStart}
        onNow={() => setPinned(null)}
        full={full}
      />
    </section>
  );
};

// ---------------------------------------------------------------- progress

const Bar = ({ label, progress, fill }: { label: string; progress: Progress; fill: string }) => {
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate font-bold text-muted">{label}</span>
        <span className="voice-numeral flex-none">
          {progress.done} of {progress.total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label}: ${progress.done} of ${progress.total} steps done`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-1 h-[10px] overflow-hidden bg-sunken [clip-path:var(--mk-cut-tag)]"
      >
        <div className="h-full transition-[width] duration-base ease-out" style={{ width: `${pct}%`, background: fill }} />
      </div>
    </div>
  );
};

/** One torn ticket per step: done, the one in view, and the rest. Decoration beside "Step n of m". */
const Ticks = ({
  count,
  viewed,
  live,
  completed,
  steps,
}: {
  count: number;
  viewed: number;
  live: number;
  completed: ReadonlySet<string>;
  steps: Step[];
}) => (
  <span aria-hidden="true" className="flex w-full max-w-[260px] items-end gap-[3px]" style={{ height: 14 }}>
    {Array.from({ length: count }, (_, i) => {
      const finished = completed.has(steps[i]!.task.id);
      const here = i === viewed;
      return (
        <span
          key={steps[i]!.task.id}
          className={`block min-w-0 flex-1 [clip-path:var(--mk-cut-tag)] ${
            here ? 'h-[14px] bg-paprika' : finished ? 'h-[8px] bg-marigold' : i === live ? 'h-[8px] bg-enamel' : 'h-[8px] bg-sunken'
          }`}
        />
      );
    })}
  </span>
);

// ---------------------------------------------------------------- the step

const DishTag = ({ step, hues }: { step: Step; hues: Record<string, number> }) => (
  <p className="mt-4 flex">
    <span
      className="inline-block max-w-full truncate pb-1 pl-3 pr-4 pt-1 text-sm font-bold text-charcoal [clip-path:var(--mk-cut-tag)] [font-variation-settings:var(--mk-sharp)]"
      style={{ background: dishHue(step.task.dishId, hues[step.task.dishId]), rotate: '1deg' }}
    >
      {step.dishName}
    </span>
  </p>
);

type StepViewProps = {
  step: Step;
  status: StepStatus;
  elapsedSec: number;
  starts: Starts;
  /** The clock is on this step (or waiting for it), rather than the cook having paged to it. */
  live: boolean;
  /** The clock is waiting for this step to start. */
  waiting: boolean;
  next: Step | null;
  hues: Record<string, number>;
  full: boolean;
  /** The cook's colour: the torn shard the timer ring is laid on. */
  accent: string;
};

const StepView = ({ step, status, elapsedSec, starts, live, waiting, next, hues, full, accent }: StepViewProps) => {
  const { task, scheduled } = step;
  const wide = LAYOUT[full ? 'full' : 'compact'];
  const { startSec, endSec, byHand } = windowOf(step, starts);
  const uses = [
    task.ingredients.length > 0 ? task.ingredients.join(', ') : null,
    task.equipment.length > 0 ? task.equipment.map((e) => e.kind.replace('-', ' ')).join(', ') : null,
  ].filter(Boolean);

  const timer = (() => {
    if (status === 'done') return null;
    if (status === 'upcoming') {
      const until = Math.max(0, Math.ceil(startSec - elapsedSec));
      return {
        text: clockText(until),
        label: `${clockText(until)} until it starts`,
        note: `until it starts · at minute ${Math.round(startSec / 60)}`,
        word: 'to start',
        tone: 'wait' as DialTone,
        late: false,
        progress: 0,
      };
    }
    const left = Math.max(0, Math.ceil(endSec - elapsedSec));
    const over = Math.max(0, Math.floor(elapsedSec - endSec));
    const late = status === 'overdue';
    return {
      text: late ? clockText(over) : clockText(left),
      label: late ? `${clockText(over)} over` : `${clockText(left)} left`,
      note: late
        ? 'over what was planned — finish it, then tap done'
        : `left, of ${humanMinutes(task.durationMin)}${byHand ? ' · started by hand' : ''}`,
      word: late ? 'over' : 'left',
      tone: (late ? 'late' : 'run') as DialTone,
      late,
      progress: endSec > startSec ? Math.max(0, Math.min(1, (elapsedSec - startSec) / (endSec - startSec))) : 1,
    };
  })();
  /** Beside the ring when there is one, across the whole slide when there is not. */
  const side = timer ? wide.beside : 'col-span-2';

  return (
    <>
      {waiting ? (
        <p className="mt-4 flex items-center gap-2 text-sm font-bold text-muted">
          <Icon name="hand" className="flex-none" />
          Nothing in your hands right now
        </p>
      ) : null}
      {!live && status !== 'done' ? (
        <p className="mt-4 flex items-center gap-2 text-sm font-bold text-muted">
          <Icon name={status === 'upcoming' ? 'clock' : 'flame'} className="flex-none" />
          {status === 'upcoming' ? 'Coming up' : 'Also due'}
        </p>
      ) : null}
      <DishTag step={step} hues={hues} />
      <h2
        className={`mt-2 font-bold [font-variation-settings:var(--mk-sharp)] ${
          full
            ? 'text-[length:var(--mk-text-xl)] leading-[1.18] sm:text-[length:var(--mk-text-2xl)] lg:text-[length:var(--mk-text-3xl)]'
            : 'text-[length:var(--mk-text-lg)] leading-snug'
        } motion-safe:animate-[mk-slide_var(--d-slow)_var(--mk-ease-simmer)_both]`}
      >
        {waiting ? 'Up next: ' : ''}
        {task.name}
      </h2>

      <div className={`mt-4 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 ${wide.grid}`}>
      {status === 'done' ? (
        <p className="col-span-2 flex">
          <span className="mk-tag mk-tag--success whitespace-normal py-2 text-sm">
            <Icon name="check" />
            Done. The plan had this at minute {scheduled.startMin} to {scheduled.endMin}.
          </span>
        </p>
      ) : timer ? (
        <>
          <div className={`relative flex-none ${wide.dial}`}>
            {full ? (
              <span
                aria-hidden="true"
                className="absolute -left-4 -top-3 block h-[62%] w-[62%] [clip-path:var(--mk-cut-shard)] [rotate:-12deg]"
                style={{ background: accent }}
              />
            ) : null}
            <Dial
              fraction={timer.late ? 1 : timer.tone === 'wait' ? 0 : 1 - timer.progress}
              tone={timer.late ? 'late' : timer.tone}
              stroke={full ? 20 : 22}
              progress={status !== 'upcoming' ? { label: 'Progress through this step', value: Math.round(timer.progress * 100) } : undefined}
              className={full ? 'w-[min(12.5rem,50vw)] sm:w-[15rem] lg:w-[17rem]' : 'w-[7.5rem]'}
            >
              <div
                role="timer"
                aria-live="off"
                aria-label={timer.label}
                className={`mk-display mk-num leading-none ${
                  full
                    ? 'text-[length:var(--mk-text-3xl)] min-[380px]:text-[length:var(--mk-text-4xl)] sm:text-[length:var(--mk-text-5xl)]'
                    : 'text-[length:var(--mk-text-xl)]'
                } ${timer.late ? 'text-marigold' : 'text-ink'}`}
              >
                {timer.text}
              </div>
              <span aria-hidden="true" className={`mt-1 font-bold uppercase tracking-[0.16em] text-muted ${full ? 'text-xs' : 'text-[0.6875rem]'}`}>
                {timer.word}
              </span>
            </Dial>
          </div>
          <div className={`flex min-w-0 flex-col items-start gap-2 ${wide.notes}`}>
            {timer.late ? (
              <span className="mk-tag mk-tag--warning">
                <Icon name="flame" />
                Running over
              </span>
            ) : null}
            <p className={`text-muted ${full ? 'text-sm' : 'text-xs'}`}>{timer.note}</p>
            {scheduled.isCritical ? (
              <span className="mk-tag bg-paprika-100 text-paprika-700">
                <Icon name="flag" />
                sets the finish
              </span>
            ) : null}
          </div>
        </>
      ) : null}

      {full && uses.length > 0 ? (
        <p className={`text-sm text-muted ${timer ? wide.uses : 'col-span-2 mt-4'}`}>{uses.join(' · ')}</p>
      ) : null}

      {next ? (
        <Next
          label={waiting ? 'Then' : 'Next'}
          step={next}
          elapsedSec={elapsedSec}
          starts={starts}
          hues={hues}
          full={full}
          className={`mt-5 ${side} ${wide.tight}`}
        />
      ) : live && status !== 'done' ? (
        <p className={`mt-4 text-sm text-muted ${side} ${wide.tight}`}>Last one for you.</p>
      ) : null}
      </div>
    </>
  );
};

/**
 * Where the step's facts sit around the ring. On a phone the ring and its notes share a row
 * and everything else runs underneath at full width; with room, the ring holds the left
 * column and the notes, the ingredients and the next slip stack beside it. The phone slide
 * spreads out from tablet width, a kitchen-display tile only once the tiles are wide.
 */
const LAYOUT = {
  full: {
    grid: 'md:grid-rows-[auto_auto_auto_1fr] md:items-start md:gap-x-7',
    dial: 'row-span-2 md:row-span-4',
    notes: 'self-end md:self-start md:pt-4',
    /** What the step uses always sits beside the ring: it is a note on the step, not a step. */
    uses: 'col-start-2 mt-2 self-start md:mt-4',
    beside: 'col-span-2 md:col-span-1 md:col-start-2',
    tight: 'md:mt-4',
  },
  compact: {
    grid: 'lg:grid-rows-[auto_auto_auto_1fr] lg:items-start lg:gap-x-5',
    dial: 'lg:row-span-4',
    notes: 'lg:pt-3',
    uses: 'col-span-2 lg:col-span-1 lg:col-start-2 mt-4 lg:mt-3',
    beside: 'col-span-2 lg:col-span-1 lg:col-start-2',
    tight: 'lg:mt-3',
  },
} as const;

/** What comes after, on a slip of paper laid under the step, taped at one corner. */
const Next = ({
  label,
  step,
  elapsedSec,
  starts,
  hues,
  full,
  className,
}: {
  label: string;
  step: Step;
  elapsedSec: number;
  starts: Starts;
  hues: Record<string, number>;
  full: boolean;
  className: string;
}) => {
  const inSec = windowOf(step, starts).startSec - elapsedSec;
  return (
    <div className={`relative ${full ? 'max-w-[560px]' : ''} ${className}`} style={{ rotate: '-1deg' }}>
      <span aria-hidden="true" className="absolute -top-2 left-6 z-[1] block h-4 w-[3.5rem] bg-enamel [clip-path:var(--mk-cut-tag)] [rotate:-6deg]" />
      <div className={`bg-paper text-charcoal [clip-path:var(--mk-cut-patch)] ${full ? 'px-5 pb-4 pt-4' : 'px-4 pb-3 pt-3'}`}>
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-1 block h-4 w-4 flex-none [clip-path:var(--mk-cut-plate)]"
            style={{ background: dishHue(step.task.dishId, hues[step.task.dishId]) }}
          />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-soft">{label}</p>
            <p className={`mt-1 font-bold leading-snug [font-variation-settings:var(--mk-sharp)] ${full ? 'text-md' : 'text-sm'}`}>
              {step.task.name}
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              {step.dishName} · {humanMinutes(step.task.durationMin)}
              {inSec > 0 ? ` · in ${clockText(inSec)}` : ' · ready when you are'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------ actions

type ActionsProps = {
  step: Step | null;
  status: StepStatus | null;
  allDone: boolean;
  following: boolean;
  onDone?: (taskId: string) => void;
  onStart?: (taskId: string) => void;
  onNow: () => void;
  full: boolean;
};

/**
 * The one control that matters, always on screen. Pinned to the bottom of the slide on a
 * phone so it never needs scrolling to: Done for a step in progress, "Start it now" for one
 * that has not begun, and the way back to the live step when the cook has paged away.
 */
const Actions = ({ step, status, allDone, following, onDone, onStart, onNow, full }: ActionsProps) => {
  if (!step || !status || (!onDone && !onStart)) return <div className={full ? 'pb-5' : ''} />;

  const primary =
    status === 'now' || status === 'overdue'
      ? onDone
        ? { label: 'Done', icon: 'check' as const, onClick: () => onDone(step.task.id) }
        : null
      : status === 'upcoming'
        ? onStart
          ? { label: 'Start it now', icon: 'play' as const, onClick: () => onStart(step.task.id) }
          : null
        : null;
  const secondary =
    status === 'upcoming' && onDone
      ? { label: 'Mark done', onClick: () => onDone(step.task.id) }
      : !following
        ? { label: 'Back to now', onClick: onNow }
        : null;

  if (!primary && !secondary && (allDone || status === 'done')) return <div className={full ? 'pb-5' : ''} />;

  const buttons = (
    <>
      {primary ? (
        full ? (
          <Button
            variant="primary"
            size="lg"
            className={`flex-1 whitespace-nowrap ${secondary ? '!px-5' : '!text-[length:var(--mk-text-xl)]'}`}
            onClick={primary.onClick}
          >
            <Icon name={primary.icon} className={secondary ? '[stroke-width:2.8]' : '!h-[1.75rem] !w-[1.75rem] [stroke-width:2.8]'} />
            {primary.label}
          </Button>
        ) : (
          // On the kitchen display every tile has one; they are not each the screen's primary.
          <Button variant="secondary" size="md" className="flex-1" onClick={primary.onClick}>
            <Icon name={primary.icon} />
            {primary.label}
          </Button>
        )
      ) : null}
      {secondary ? (
        <Button variant={primary ? 'quiet' : 'secondary'} size="md" onClick={secondary.onClick}>
          {secondary.label}
        </Button>
      ) : null}
    </>
  );

  if (!full) return <div className="mt-4 flex flex-wrap items-center gap-3">{buttons}</div>;

  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-5 sm:-mx-6">
      <span aria-hidden="true" className="block h-3 bg-surface [clip-path:var(--mk-cut-edge-top)]" />
      <div className="flex items-center gap-3 bg-surface px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-2 sm:px-6">{buttons}</div>
    </div>
  );
};
