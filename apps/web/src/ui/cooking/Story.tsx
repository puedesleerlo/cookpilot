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
import { Button, Glyph, cookGlyph } from '../primitives';
import { cookColor, dishHue } from '../theme';
import { humanMinutes } from '../timeline/model';

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
      className={`flex flex-col rounded-lg bg-cream shadow-2 ${full ? 'px-5 pt-5' : 'p-4'}`}
      style={{ borderTop: `6px solid ${cookColor(cookIndex)}` }}
    >
      <header className="flex items-center gap-2">
        <span style={{ color: cookColor(cookIndex) }}>
          <Glyph name={cookGlyph(cookIndex)} size={full ? 32 : 26} />
        </span>
        <span className="text-sm font-bold">{displayName}</span>
        <span className="text-xs text-ink-soft">
          {cook.name} · {done} of {steps.length} done
        </span>
      </header>

      <div className="mt-3 flex flex-col gap-2">
        <Bar label="Whole session" progress={overall} tone="sage" />
        {viewed && ofDish ? <Bar label={viewed.dishName} progress={ofDish} tone="dish" hue={dishHue(viewed.task.dishId, hues[viewed.task.dishId])} /> : null}
      </div>

      {steps.length > 0 ? (
        <nav aria-label="Steps" className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="Previous step"
            disabled={viewedIndex <= 0}
            onClick={() => setPinned(Math.max(0, viewedIndex - 1))}
            className="grid h-11 w-11 place-items-center rounded-full border-[1.5px] border-line-strong bg-cream text-md font-bold text-charcoal disabled:opacity-30"
          >
            <span aria-hidden="true">&lsaquo;</span>
          </button>
          <span className="text-xs font-bold text-ink-soft">
            Step {viewedIndex + 1} of {steps.length}
            {following ? null : (
              <button type="button" onClick={() => setPinned(null)} className="ml-2 min-h-[44px] text-tomato-ink underline underline-offset-4">
                Now
              </button>
            )}
          </span>
          <button
            type="button"
            aria-label="Next step"
            disabled={viewedIndex >= steps.length - 1}
            onClick={() => setPinned(Math.min(steps.length - 1, viewedIndex + 1))}
            className="grid h-11 w-11 place-items-center rounded-full border-[1.5px] border-line-strong bg-cream text-md font-bold text-charcoal disabled:opacity-30"
          >
            <span aria-hidden="true">&rsaquo;</span>
          </button>
        </nav>
      ) : null}

      {viewed ? (
        <StepView
          step={viewed}
          status={statusOf(viewed, elapsedSec, completed, starts)}
          elapsedSec={elapsedSec}
          starts={starts}
          live={following && slide.kind !== 'done'}
          waiting={following && slide.kind === 'wait'}
          next={following && slide.kind !== 'done' ? slide.next : null}
          hues={hues}
          full={full}
        />
      ) : null}

      {slide.kind === 'done' && following ? (
        <div className="mt-4 flex items-center gap-3 text-sage-ink">
          <Glyph name="state-success" size={full ? 56 : 40} />
          <div>
            <h2 className={`voice-display ${full ? 'text-2xl' : 'text-lg'}`}>You&rsquo;re done</h2>
            <p className="text-sm text-ink-soft">
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

const Bar = ({
  label,
  progress,
  tone,
  hue,
}: {
  label: string;
  progress: Progress;
  tone: 'sage' | 'dish';
  hue?: string;
}) => {
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="truncate font-bold text-ink-soft">{label}</span>
        <span className="voice-numeral flex-none text-charcoal">
          {progress.done} of {progress.total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label}: ${progress.done} of ${progress.total} steps done`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-1 h-[6px] overflow-hidden rounded-full bg-cream-sunk"
      >
        <div
          className={`h-full transition-[width] duration-base ease-out ${tone === 'sage' ? 'bg-sage' : ''}`}
          style={{ width: `${pct}%`, ...(tone === 'dish' && hue ? { background: hue } : {}) }}
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- the step

const DishTag = ({ step, hues }: { step: Step; hues: Record<string, number> }) => (
  <p className="mt-3 flex items-center gap-2 text-xs font-bold text-ink-soft">
    <span
      aria-hidden="true"
      className="h-3 w-3 flex-none rounded-full"
      style={{ background: dishHue(step.task.dishId, hues[step.task.dishId]) }}
    />
    {step.dishName}
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
};

const StepView = ({ step, status, elapsedSec, starts, live, waiting, next, hues, full }: StepViewProps) => {
  const { task, scheduled } = step;
  const { startSec, endSec, byHand } = windowOf(step, starts);
  const uses = [
    task.ingredients.length > 0 ? task.ingredients.join(', ') : null,
    task.equipment.length > 0 ? task.equipment.map((e) => e.kind.replace('-', ' ')).join(', ') : null,
  ].filter(Boolean);

  const timer = (() => {
    if (status === 'done') return null;
    if (status === 'upcoming') {
      const until = Math.max(0, Math.ceil(startSec - elapsedSec));
      return { text: clockText(until), label: `${clockText(until)} until it starts`, note: `until it starts · at minute ${Math.round(startSec / 60)}`, late: false, progress: 0 };
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
      late,
      progress: endSec > startSec ? Math.max(0, Math.min(1, (elapsedSec - startSec) / (endSec - startSec))) : 1,
    };
  })();

  return (
    <>
      {waiting ? <p className="mt-3 text-xs font-bold text-ink-soft">Nothing in your hands right now</p> : null}
      {!live && status !== 'done' ? (
        <p className="mt-3 text-xs font-bold text-ink-soft">{status === 'upcoming' ? 'Coming up' : 'Also due'}</p>
      ) : null}
      <DishTag step={step} hues={hues} />
      <h2 className={`voice-display mt-1 ${full ? 'text-3xl' : 'text-lg'}`}>
        {waiting ? 'Up next: ' : ''}
        {task.name}
      </h2>

      {status === 'done' ? (
        <div className="mt-4 flex items-center gap-3 text-sage-ink">
          <Glyph name="state-success" size={full ? 40 : 28} />
          <p className="text-sm">
            Done. The plan had this at minute {scheduled.startMin} to {scheduled.endMin}.
          </p>
        </div>
      ) : timer ? (
        <>
          <div className="mt-4 flex items-end justify-between gap-4">
            <div>
              <div
                role="timer"
                aria-live="off"
                aria-label={timer.label}
                className={`voice-numeral leading-none ${full ? 'text-5xl' : 'text-2xl'} ${
                  timer.late ? 'text-tomato-ink' : 'text-charcoal'
                }`}
              >
                {timer.text}
              </div>
              <p className="mt-1 text-xs text-ink-soft">{timer.note}</p>
            </div>
            {scheduled.isCritical ? (
              <span className="flex-none rounded-xs bg-tomato-wash px-2 py-1 text-xs font-bold text-tomato-ink">
                sets the finish
              </span>
            ) : null}
          </div>
          {status !== 'upcoming' ? (
            <div
              role="progressbar"
              aria-label="Progress through this step"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(timer.progress * 100)}
              className="mt-3 h-[10px] overflow-hidden rounded-full bg-cream-sunk"
            >
              <div
                className={`h-full transition-[width] duration-base ease-out ${timer.late ? 'bg-tomato' : 'bg-sage'}`}
                style={{ width: `${timer.progress * 100}%` }}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {full && uses.length > 0 ? <p className="mt-3 text-sm text-ink-soft">{uses.join(' · ')}</p> : null}

      {next ? (
        <Next label={waiting ? 'Then' : 'Next'} step={next} elapsedSec={elapsedSec} starts={starts} hues={hues} />
      ) : live && status !== 'done' ? (
        <p className="mt-3 text-xs text-ink-soft">Last one for you.</p>
      ) : null}
    </>
  );
};

const Next = ({
  label,
  step,
  elapsedSec,
  starts,
  hues,
}: {
  label: string;
  step: Step;
  elapsedSec: number;
  starts: Starts;
  hues: Record<string, number>;
}) => {
  const inSec = windowOf(step, starts).startSec - elapsedSec;
  return (
    <div className="mt-4 rounded-md bg-cream-deep p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="mt-1 flex items-center gap-2 text-sm font-bold">
        <span
          aria-hidden="true"
          className="h-2 w-2 flex-none rounded-full"
          style={{ background: dishHue(step.task.dishId, hues[step.task.dishId]) }}
        />
        {step.task.name}
      </p>
      <p className="text-xs text-ink-soft">
        {step.dishName} · {humanMinutes(step.task.durationMin)}
        {inSec > 0 ? ` · in ${clockText(inSec)}` : ' · ready when you are'}
      </p>
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
        ? { label: 'Done', onClick: () => onDone(step.task.id) }
        : null
      : status === 'upcoming'
        ? onStart
          ? { label: 'Start it now', onClick: () => onStart(step.task.id) }
          : null
        : null;
  const secondary =
    status === 'upcoming' && onDone
      ? { label: 'Mark done', onClick: () => onDone(step.task.id) }
      : !following
        ? { label: 'Back to now', onClick: onNow }
        : null;

  if (!primary && !secondary && (allDone || status === 'done')) return <div className={full ? 'pb-5' : ''} />;

  return (
    <div
      className={
        full
          ? 'sticky bottom-0 -mx-5 mt-4 flex items-center gap-3 border-t border-line bg-cream px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3'
          : 'mt-3 flex items-center gap-3'
      }
    >
      {primary ? (
        <Button variant="primary" size={full ? 'lg' : 'md'} className="flex-1" onClick={primary.onClick}>
          {primary.label}
        </Button>
      ) : null}
      {secondary ? (
        <Button variant={primary ? 'quiet' : 'secondary'} size="md" onClick={secondary.onClick}>
          {secondary.label}
        </Button>
      ) : null}
    </div>
  );
};
