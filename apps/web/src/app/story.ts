import type { Cook, Schedule, ScheduledTask, Task } from '@kitchen/domain';
import type { SessionMember } from '@kitchen/contracts';

/**
 * Story mode, as data.
 *
 * A cook holding a phone in a kitchen needs exactly one thing: what am I doing now, and for
 * how much longer. This module turns a compiled schedule, a cook and a clock into that one
 * thing — one slide — and the slide after it. Nothing here knows what a pixel is, so the
 * arithmetic can be tested without a screen, which matters because a timer that is wrong
 * by a minute is worse than no timer.
 *
 * The schedule is the only source. A slide is never invented: it is a task the compiler
 * placed, at the minute the compiler placed it. What the clock adds is *which* task, and
 * what a finished tap adds is skipping past it.
 */

export type Step = { task: Task; scheduled: ScheduledTask; dishName: string };

const byStart = (a: Step, b: Step): number =>
  a.scheduled.startMin - b.scheduled.startMin || (a.task.id < b.task.id ? -1 : 1);

/**
 * What one cook does tonight, in order. A `hold` is the pan's job, not the cook's, and
 * overnight work is tomorrow's — neither is a step someone stands over.
 */
export const stepsFor = (schedule: Schedule, cookId: string): Step[] =>
  schedule.scheduled
    .filter((s) => s.cookId === cookId && !schedule.overnight.includes(s.taskId))
    .flatMap((s) => {
      const task = schedule.tasks[s.taskId];
      return task && task.phase !== 'hold'
        ? [{ task, scheduled: s, dishName: schedule.dishNames[task.dishId] ?? 'This session' }]
        : [];
    })
    .sort(byStart);

export type Slide =
  | {
      kind: 'now';
      step: Step;
      /** Seconds until the compiler expected this to be finished; zero once it is late. */
      secondsLeft: number;
      /** Seconds past that expectation; zero until it is late. */
      overBy: number;
      /** 0..1 through the task's minutes. Stays at 1 while late. */
      progress: number;
      next: Step | null;
    }
  | {
      kind: 'wait';
      /** The step the cook is waiting to start. */
      until: Step;
      secondsUntil: number;
      next: Step | null;
    }
  | { kind: 'done'; finishedMin: number };

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * The slide for a cook at a moment.
 *
 * The current step is the earliest one not yet finished whose minute has come. That
 * definition is what makes a late cook see the right thing: two steps behind, they see the
 * older one first, marked as running over, and the newer one waits its turn. Finishing
 * early moves on to the next step with a countdown to when it is due, which is the honest
 * answer — the pan is not ready sooner because the chopping was.
 */
export const slideFor = (steps: Step[], elapsedSec: number, completed: ReadonlySet<string>): Slide => {
  const pending = steps.filter((s) => !completed.has(s.task.id));
  if (pending.length === 0) {
    return { kind: 'done', finishedMin: steps.length > 0 ? steps[steps.length - 1]!.scheduled.endMin : 0 };
  }

  const elapsedMin = elapsedSec / 60;
  const index = pending.findIndex((s) => s.scheduled.startMin <= elapsedMin);
  if (index >= 0) {
    const step = pending[index]!;
    const startSec = step.scheduled.startMin * 60;
    const endSec = step.scheduled.endMin * 60;
    return {
      kind: 'now',
      step,
      secondsLeft: Math.max(0, Math.ceil(endSec - elapsedSec)),
      overBy: Math.max(0, Math.floor(elapsedSec - endSec)),
      progress: endSec > startSec ? clamp01((elapsedSec - startSec) / (endSec - startSec)) : 1,
      next: pending[index + 1] ?? null,
    };
  }

  const until = pending[0]!;
  return {
    kind: 'wait',
    until,
    secondsUntil: Math.max(0, Math.ceil(until.scheduled.startMin * 60 - elapsedSec)),
    next: pending[1] ?? null,
  };
};

// ------------------------------------------------------------ on the stove

export type Watch = { task: Task; scheduled: ScheduledTask; dishName: string; secondsLeft: number; progress: number };

/**
 * Everything looking after itself right now — the rice simmering, the tea steeping — with
 * how long it has left. These are the timers a kitchen actually runs on, and they belong to
 * nobody's hands, so every phone shows all of them.
 */
export const holdsAt = (schedule: Schedule, elapsedSec: number): Watch[] =>
  schedule.scheduled
    .filter((s) => !schedule.overnight.includes(s.taskId))
    .flatMap((s) => {
      const task = schedule.tasks[s.taskId];
      if (!task || task.phase !== 'hold') return [];
      const startSec = s.startMin * 60;
      const endSec = s.endMin * 60;
      if (elapsedSec < startSec || elapsedSec >= endSec) return [];
      return [
        {
          task,
          scheduled: s,
          dishName: schedule.dishNames[task.dishId] ?? 'This session',
          secondsLeft: Math.ceil(endSec - elapsedSec),
          progress: clamp01((elapsedSec - startSec) / Math.max(1, endSec - startSec)),
        },
      ];
    })
    .sort((a, b) => a.secondsLeft - b.secondsLeft || (a.task.id < b.task.id ? -1 : 1));

// -------------------------------------------------------------- the roster

export type Slot = { cook: Cook; index: number; member: SessionMember | null };

/** Every cook the plan needs, and who has claimed each, in crew order. */
export const slots = (crew: Cook[], members: SessionMember[]): Slot[] =>
  crew.map((cook, index) => ({
    cook,
    index,
    member: members.find((m) => m.cookId === cook.id) ?? null,
  }));

export const everyoneHere = (crew: Cook[], members: SessionMember[]): boolean =>
  slots(crew, members).every((s) => s.member !== null);

/**
 * How the crew screen described this cook: the first is assumed to know the kitchen and the
 * rest to be helping. Said in words rather than as a skill enum, because "beginner" on a
 * button is an insult and "helping" is a job.
 */
export const roleOf = (cook: Cook): string =>
  cook.skill === 'beginner' ? 'helping — washing, chopping, portioning' : 'knows the kitchen';

// ----------------------------------------------------------------- the clock

/** Whole seconds since the session started, never negative. */
export const elapsedSeconds = (startedAtMs: number, nowMs: number): number =>
  Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));

/** `754` -> `12:34`. Minutes are not capped: an hour reads `61:05`, which is what a timer says. */
export const clockText = (seconds: number): string => {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};

/** Task ids finished so far, folded from the log. */
export const completedFrom = (events: { type: string; taskId: string | null }[]): Set<string> =>
  new Set(events.filter((e) => e.type === 'task-completed' && e.taskId).map((e) => e.taskId!));
