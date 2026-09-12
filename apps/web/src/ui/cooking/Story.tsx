import { useMemo } from 'react';
import type { Cook, Schedule } from '@kitchen/domain';
import { clockText, slideFor, stepsFor, type Step } from '@/app/story';
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
 */
type Props = {
  schedule: Schedule;
  cook: Cook;
  cookIndex: number;
  displayName: string;
  elapsedSec: number;
  completed: ReadonlySet<string>;
  hues: Record<string, number>;
  onDone?: (taskId: string) => void;
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
  hues,
  onDone,
  size = 'full',
}: Props) => {
  const steps = useMemo(() => stepsFor(schedule, cook.id), [schedule, cook.id]);
  const slide = slideFor(steps, elapsedSec, completed);
  const done = steps.filter((s) => completed.has(s.task.id)).length;
  const full = size === 'full';

  return (
    <section
      aria-label={`${displayName}'s steps`}
      className={`flex flex-col rounded-lg bg-cream shadow-2 ${full ? 'p-5' : 'p-4'}`}
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

      {slide.kind === 'now' ? (
        <Now
          step={slide.step}
          secondsLeft={slide.secondsLeft}
          overBy={slide.overBy}
          progress={slide.progress}
          next={slide.next}
          elapsedSec={elapsedSec}
          hues={hues}
          full={full}
          onDone={onDone}
        />
      ) : null}

      {slide.kind === 'wait' ? (
        <Wait until={slide.until} secondsUntil={slide.secondsUntil} next={slide.next} elapsedSec={elapsedSec} hues={hues} full={full} />
      ) : null}

      {slide.kind === 'done' ? (
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
    </section>
  );
};

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

type NowProps = {
  step: Step;
  secondsLeft: number;
  overBy: number;
  progress: number;
  next: Step | null;
  elapsedSec: number;
  hues: Record<string, number>;
  full: boolean;
  onDone?: (taskId: string) => void;
};

const Now = ({ step, secondsLeft, overBy, progress, next, elapsedSec, hues, full, onDone }: NowProps) => {
  const late = overBy > 0;
  const { task, scheduled } = step;
  const uses = [
    task.ingredients.length > 0 ? task.ingredients.join(', ') : null,
    task.equipment.length > 0 ? task.equipment.map((e) => e.kind.replace('-', ' ')).join(', ') : null,
  ].filter(Boolean);

  return (
    <>
      <DishTag step={step} hues={hues} />
      <h2 className={`voice-display mt-1 ${full ? 'text-3xl' : 'text-lg'}`}>{task.name}</h2>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <div
            role="timer"
            aria-live="off"
            aria-label={late ? `${clockText(overBy)} over` : `${clockText(secondsLeft)} left`}
            className={`voice-numeral leading-none ${full ? 'text-5xl' : 'text-2xl'} ${
              late ? 'text-tomato-ink' : 'text-charcoal'
            }`}
          >
            {late ? clockText(overBy) : clockText(secondsLeft)}
          </div>
          <p className="mt-1 text-xs text-ink-soft">
            {late
              ? 'over what was planned — finish it, then tap done'
              : `left, of ${humanMinutes(task.durationMin)}`}
          </p>
        </div>
        {scheduled.isCritical ? (
          <span className="flex-none rounded-xs bg-tomato-wash px-2 py-1 text-xs font-bold text-tomato-ink">
            sets the finish
          </span>
        ) : null}
      </div>

      <div
        role="progressbar"
        aria-label="Progress through this step"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        className="mt-3 h-[10px] overflow-hidden rounded-full bg-cream-sunk"
      >
        <div
          className={`h-full transition-[width] duration-base ease-out ${late ? 'bg-tomato' : 'bg-sage'}`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {full && uses.length > 0 ? (
        <p className="mt-3 text-sm text-ink-soft">{uses.join(' · ')}</p>
      ) : null}

      {onDone ? (
        <Button
          variant="primary"
          size={full ? 'lg' : 'md'}
          className="mt-4 w-full"
          onClick={() => onDone(task.id)}
        >
          Done
        </Button>
      ) : null}

      {next ? (
        <Next label="Next" step={next} elapsedSec={elapsedSec} hues={hues} />
      ) : (
        <p className="mt-3 text-xs text-ink-soft">Last one for you.</p>
      )}
    </>
  );
};

type WaitProps = {
  until: Step;
  secondsUntil: number;
  next: Step | null;
  elapsedSec: number;
  hues: Record<string, number>;
  full: boolean;
};

const Wait = ({ until, secondsUntil, next, elapsedSec, hues, full }: WaitProps) => (
  <>
    <p className="mt-3 text-xs font-bold text-ink-soft">Nothing in your hands right now</p>
    <h2 className={`voice-display mt-1 ${full ? 'text-2xl' : 'text-md'}`}>Up next: {until.task.name}</h2>
    <div className="mt-4">
      <div
        role="timer"
        aria-live="off"
        aria-label={`${clockText(secondsUntil)} until it starts`}
        className={`voice-numeral leading-none text-charcoal ${full ? 'text-5xl' : 'text-2xl'}`}
      >
        {clockText(secondsUntil)}
      </div>
      <p className="mt-1 text-xs text-ink-soft">until it starts · {until.dishName}</p>
    </div>
    {next ? <Next label="Then" step={next} elapsedSec={elapsedSec} hues={hues} /> : null}
  </>
);

const Next = ({
  label,
  step,
  elapsedSec,
  hues,
}: {
  label: string;
  step: Step;
  elapsedSec: number;
  hues: Record<string, number>;
}) => {
  const inSec = step.scheduled.startMin * 60 - elapsedSec;
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
