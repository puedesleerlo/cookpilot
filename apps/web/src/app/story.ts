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
 * The schedule is the only source of steps. A slide is never invented: it is a task the
 * compiler placed, at the minute the compiler placed it. What the clock adds is *which*
 * task. What the cook adds, through the shared log, is two corrections the plan cannot
 * know: "I finished this" and "I am starting this now". Both move the slide for every
 * device, because both are events every device folds.
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

/** Task id -> the second of the session at which a cook started it by hand. */
export type Starts = ReadonlyMap<string, number>;
export const NO_STARTS: Starts = new Map();

export type Window = {
  startSec: number;
  endSec: number;
  /** True when the cook started it by hand rather than when the plan said. */
  byHand: boolean;
};

/**
 * When a step runs. The plan's minutes, unless the cook tapped "start now" — then the step
 * runs from that second for the minutes the compiler gave it. A tap is not a shortcut
 * through the work; it moves the work's timer to when the work actually began.
 */
export const windowOf = (step: Step, starts: Starts = NO_STARTS): Window => {
  const tapped = starts.get(step.task.id);
  if (tapped !== undefined) {
    return { startSec: tapped, endSec: tapped + step.task.durationMin * 60, byHand: true };
  }
  return { startSec: step.scheduled.startMin * 60, endSec: step.scheduled.endMin * 60, byHand: false };
};

export type Slide =
  | {
      kind: 'now';
      step: Step;
      /** Seconds until the compiler expected this to be finished; zero once it is late. */
      secondsLeft: number;
      /** Seconds past that expectation; zero until it is late. */
      overBy: number;
      /** 0..1 through the step's minutes. Stays at 1 while late. */
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
 * A step the cook started by hand is what they are doing, whatever the plan said; the most
 * recent such tap wins. Otherwise the current step is the earliest one not yet finished
 * whose minute has come. That second rule is what makes a late cook see the right thing:
 * two steps behind, they see the older one first, marked as running over, and the newer one
 * waits its turn. Finishing early moves on to the next step with a countdown to when it is
 * due, which is the honest answer — the pan is not ready sooner because the chopping was —
 * and "start it now" is how the cook overrules that when the pan is ready.
 */
export const slideFor = (
  steps: Step[],
  elapsedSec: number,
  completed: ReadonlySet<string>,
  starts: Starts = NO_STARTS,
): Slide => {
  const pending = steps.filter((s) => !completed.has(s.task.id));
  if (pending.length === 0) {
    return { kind: 'done', finishedMin: steps.length > 0 ? steps[steps.length - 1]!.scheduled.endMin : 0 };
  }

  const tapped = pending
    .filter((s) => (starts.get(s.task.id) ?? Infinity) <= elapsedSec)
    .sort((a, b) => starts.get(b.task.id)! - starts.get(a.task.id)!)[0];
  const current = tapped ?? pending.find((s) => windowOf(s, starts).startSec <= elapsedSec);

  if (current) {
    const { startSec, endSec } = windowOf(current, starts);
    return {
      kind: 'now',
      step: current,
      secondsLeft: Math.max(0, Math.ceil(endSec - elapsedSec)),
      overBy: Math.max(0, Math.floor(elapsedSec - endSec)),
      progress: endSec > startSec ? clamp01((elapsedSec - startSec) / (endSec - startSec)) : 1,
      next: pending.find((s) => s !== current) ?? null,
    };
  }

  const until = pending[0]!;
  return {
    kind: 'wait',
    until,
    secondsUntil: Math.max(0, Math.ceil(windowOf(until, starts).startSec - elapsedSec)),
    next: pending[1] ?? null,
  };
};

export type StepStatus = 'done' | 'now' | 'overdue' | 'upcoming';

/** Where one step stands at a moment, for looking back and ahead through the list. */
export const statusOf = (
  step: Step,
  elapsedSec: number,
  completed: ReadonlySet<string>,
  starts: Starts = NO_STARTS,
): StepStatus => {
  if (completed.has(step.task.id)) return 'done';
  const { startSec, endSec } = windowOf(step, starts);
  if (elapsedSec < startSec) return 'upcoming';
  return elapsedSec < endSec ? 'now' : 'overdue';
};

// --------------------------------------------------------------- progress

export type Progress = { done: number; total: number };

/** The attended work of the session: every task somebody's hands do tonight. */
const attended = (schedule: Schedule): ScheduledTask[] =>
  schedule.scheduled.filter(
    (s) => s.cookId && !schedule.overnight.includes(s.taskId) && schedule.tasks[s.taskId]?.phase !== 'hold',
  );

/** How far the whole meal has come: steps finished over steps there are, across every cook. */
export const sessionProgress = (schedule: Schedule, completed: ReadonlySet<string>): Progress => {
  const all = attended(schedule);
  return { done: all.filter((s) => completed.has(s.taskId)).length, total: all.length };
};

/** The same, for one dish. */
export const dishProgress = (schedule: Schedule, dishId: string, completed: ReadonlySet<string>): Progress => {
  const all = attended(schedule).filter((s) => schedule.tasks[s.taskId]?.dishId === dishId);
  return { done: all.filter((s) => completed.has(s.taskId)).length, total: all.length };
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

/**
 * Task id -> the server millisecond a cook started it by hand, folded from the log. A later
 * tap on the same task restarts it, so the last one wins.
 */
export const startedFrom = (
  events: { type: string; taskId: string | null; atMs: number; payload: Record<string, unknown> }[],
): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const e of events) {
    if (e.type !== 'task-started' || !e.taskId) continue;
    const stamped = e.payload['startedAtMs'];
    out[e.taskId] = typeof stamped === 'number' ? stamped : e.atMs;
  }
  return out;
};

/** The same, in seconds since the session started, which is what the slide arithmetic uses. */
export const startsSince = (started: Record<string, number>, sessionStartedAtMs: number): Starts =>
  new Map(
    Object.entries(started).map(([taskId, ms]) => [taskId, Math.max(0, (ms - sessionStartedAtMs) / 1000)]),
  );
