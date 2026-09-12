import { describe, expect, it } from 'vitest';
import { TaskSchema, type ScheduledTask, type Task } from '@kitchen/domain';
import { aCook, aHelper } from '@kitchen/domain/testing';
import { compileSession } from './compile';
import { demoIntake } from './demo';
import {
  clockText,
  completedFrom,
  dishProgress,
  elapsedSeconds,
  everyoneHere,
  holdsAt,
  roleOf,
  sessionProgress,
  slideFor,
  slots,
  startedFrom,
  startsSince,
  statusOf,
  stepsFor,
  windowOf,
  type Step,
} from './story';

/**
 * Story mode's arithmetic, against a real compiled session and against hand-built steps
 * with minutes chosen to make the numbers checkable by eye. A timer that is wrong by a
 * minute is worse than no timer, so the numbers here are exact, not approximate.
 */

const outcome = compileSession(demoIntake());
if (!outcome.ok) throw new Error(`the demo must compile: ${outcome.reason}`);
const { schedule, constraints } = outcome;

const task = (id: string, durationMin: number): Task =>
  TaskSchema.parse({
    id,
    dishId: 'dish:test',
    name: id,
    class: 'knife-work',
    phase: 'start',
    durationMin,
    requiresCook: true,
    effort: 2,
    minSkill: 'beginner',
  });

const step = (id: string, startMin: number, endMin: number): Step => {
  const scheduled: ScheduledTask = {
    taskId: id,
    startMin,
    endMin,
    cookId: 'cook:test',
    resources: [],
    isCritical: false,
    slackMin: 0,
  };
  return { task: task(id, endMin - startMin), scheduled, dishName: 'Test dish' };
};

const none = new Set<string>();

describe('the steps one cook follows', () => {
  it('are that cook’s attended tasks, in the order they start', () => {
    for (const cook of constraints.cooks) {
      const steps = stepsFor(schedule, cook.id);
      expect(steps.length).toBeGreaterThan(0);
      for (const s of steps) {
        expect(s.scheduled.cookId).toBe(cook.id);
        expect(s.task.phase).not.toBe('hold');
        expect(schedule.overnight).not.toContain(s.task.id);
        expect(s.dishName).toBeTruthy();
      }
      const starts = steps.map((s) => s.scheduled.startMin);
      expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    }
  });

  it('never overlap, because the schedule does not give one cook two things at once', () => {
    for (const cook of constraints.cooks) {
      const steps = stepsFor(schedule, cook.id);
      for (let i = 1; i < steps.length; i++) {
        expect(steps[i]!.scheduled.startMin).toBeGreaterThanOrEqual(steps[i - 1]!.scheduled.endMin);
      }
    }
  });

  it('cover every attended task between the cooks', () => {
    const attended = schedule.scheduled.filter(
      (s) => s.cookId && !schedule.overnight.includes(s.taskId) && schedule.tasks[s.taskId]?.phase !== 'hold',
    );
    const shown = constraints.cooks.flatMap((c) => stepsFor(schedule, c.id).map((s) => s.task.id));
    expect(new Set(shown)).toEqual(new Set(attended.map((s) => s.taskId)));
  });
});

describe('which slide is showing', () => {
  const steps = [step('a', 0, 5), step('b', 5, 10)];

  it('opens on the first step with the whole of its time left', () => {
    const slide = slideFor(steps, 0, none);
    expect(slide.kind).toBe('now');
    if (slide.kind !== 'now') return;
    expect(slide.step.task.id).toBe('a');
    expect(slide.secondsLeft).toBe(300);
    expect(slide.overBy).toBe(0);
    expect(slide.progress).toBe(0);
    expect(slide.next?.task.id).toBe('b');
  });

  it('counts down through the step', () => {
    const slide = slideFor(steps, 150, none);
    if (slide.kind !== 'now') throw new Error(slide.kind);
    expect(slide.secondsLeft).toBe(150);
    expect(slide.progress).toBe(0.5);
  });

  it('moves to the next step when the clock does, without anyone tapping', () => {
    const slide = slideFor(steps, 301, none);
    if (slide.kind !== 'now') throw new Error(slide.kind);
    // Nothing was marked done, so the older step is still the one to show — running over.
    expect(slide.step.task.id).toBe('a');
    expect(slide.overBy).toBe(1);
    expect(slide.secondsLeft).toBe(0);
    expect(slide.progress).toBe(1);
  });

  it('shows the older of two overdue steps first, so a late cook catches up in order', () => {
    const slide = slideFor(steps, 700, none);
    if (slide.kind !== 'now') throw new Error(slide.kind);
    expect(slide.step.task.id).toBe('a');
    expect(slide.overBy).toBe(400);
    expect(slide.next?.task.id).toBe('b');
  });

  it('waits for the next step after an early finish, counting down to when it is due', () => {
    const slide = slideFor(steps, 120, new Set(['a']));
    expect(slide.kind).toBe('wait');
    if (slide.kind !== 'wait') return;
    expect(slide.until.task.id).toBe('b');
    expect(slide.secondsUntil).toBe(180);
    expect(slide.next).toBeNull();
  });

  it('waits across a gap in the schedule', () => {
    const gapped = [step('a', 0, 5), step('c', 20, 25)];
    const slide = slideFor(gapped, 600, new Set(['a']));
    if (slide.kind !== 'wait') throw new Error(slide.kind);
    expect(slide.until.task.id).toBe('c');
    expect(slide.secondsUntil).toBe(600);
  });

  it('starts a step the moment its minute arrives, even straight after a wait', () => {
    const gapped = [step('a', 0, 5), step('c', 20, 25)];
    const slide = slideFor(gapped, 1200, new Set(['a']));
    if (slide.kind !== 'now') throw new Error(slide.kind);
    expect(slide.step.task.id).toBe('c');
    expect(slide.secondsLeft).toBe(300);
  });

  it('is done when everything is done, and says when the plan expected that', () => {
    const slide = slideFor(steps, 100, new Set(['a', 'b']));
    expect(slide).toEqual({ kind: 'done', finishedMin: 10 });
  });

  it('is done from the start for a cook with nothing to do', () => {
    expect(slideFor([], 0, none)).toEqual({ kind: 'done', finishedMin: 0 });
  });
});

describe('starting a step by hand', () => {
  const steps = [step('a', 0, 5), step('b', 10, 15), step('c', 20, 25)];

  it('moves the step’s timer to the tap, for the minutes the compiler gave it', () => {
    expect(windowOf(steps[1]!)).toEqual({ startSec: 600, endSec: 900, byHand: false });
    expect(windowOf(steps[1]!, new Map([['b', 120]]))).toEqual({ startSec: 120, endSec: 420, byHand: true });
  });

  it('skips the wait: the tapped step is now, with its whole time ahead of it', () => {
    const slide = slideFor(steps, 120, new Set(['a']), new Map([['b', 120]]));
    if (slide.kind !== 'now') throw new Error(slide.kind);
    expect(slide.step.task.id).toBe('b');
    expect(slide.secondsLeft).toBe(300);
    expect(slide.progress).toBe(0);
    expect(slide.next?.task.id).toBe('c');
  });

  it('runs over from the tap, not from the plan', () => {
    const slide = slideFor(steps, 421, new Set(['a']), new Map([['b', 120]]));
    if (slide.kind !== 'now') throw new Error(slide.kind);
    expect(slide.overBy).toBe(1);
    expect(slide.secondsLeft).toBe(0);
  });

  it('shows the most recent tap, whatever the plan’s order says', () => {
    const slide = slideFor(steps, 100, none, new Map([['c', 60], ['b', 90]]));
    if (slide.kind !== 'now') throw new Error(slide.kind);
    expect(slide.step.task.id).toBe('b');
    // The step the plan wanted first is still owed, so it is what comes next.
    expect(slide.next?.task.id).toBe('a');
  });

  it('ignores a tap that has not happened yet on this clock', () => {
    const slide = slideFor(steps, 100, new Set(['a']), new Map([['b', 500]]));
    expect(slide.kind).toBe('wait');
  });

  it('tells each step’s status for paging through the list', () => {
    const starts = new Map([['c', 30]]);
    const done = new Set(['a']);
    expect(statusOf(steps[0]!, 100, done, starts)).toBe('done');
    expect(statusOf(steps[1]!, 100, done, starts)).toBe('upcoming');
    expect(statusOf(steps[1]!, 700, done, starts)).toBe('now');
    expect(statusOf(steps[1]!, 901, done, starts)).toBe('overdue');
    expect(statusOf(steps[2]!, 100, done, starts)).toBe('now');
  });

  it('folds starts from the log, last tap winning, stamped by the server', () => {
    const started = startedFrom([
      { type: 'task-started', taskId: 't1', atMs: 5_000, payload: { startedAtMs: 4_000 } },
      { type: 'task-completed', taskId: 't1', atMs: 6_000, payload: {} },
      { type: 'task-started', taskId: 't2', atMs: 7_000, payload: {} },
      { type: 'task-started', taskId: 't1', atMs: 9_000, payload: { startedAtMs: 9_000 } },
    ]);
    expect(started).toEqual({ t1: 9_000, t2: 7_000 });
    expect(startsSince(started, 1_000)).toEqual(new Map([['t1', 8], ['t2', 6]]));
    expect(startsSince({ early: 500 }, 1_000).get('early')).toBe(0);
  });
});

describe('progress', () => {
  it('counts the whole meal as attended steps done over attended steps there are', () => {
    const all = sessionProgress(schedule, none);
    const attended = schedule.scheduled.filter(
      (s) => s.cookId && !schedule.overnight.includes(s.taskId) && schedule.tasks[s.taskId]?.phase !== 'hold',
    );
    expect(all).toEqual({ done: 0, total: attended.length });
    expect(sessionProgress(schedule, new Set(attended.slice(0, 3).map((s) => s.taskId)))).toEqual({
      done: 3,
      total: attended.length,
    });
  });

  it('counts one dish on its own, and the dishes add up to the meal', () => {
    const dishIds = [...new Set(Object.values(schedule.tasks).map((t) => t.dishId))];
    const perDish = dishIds.map((id) => dishProgress(schedule, id, none));
    expect(perDish.reduce((n, p) => n + p.total, 0)).toBe(sessionProgress(schedule, none).total);
    const first = stepsFor(schedule, constraints.cooks[0]!.id)[0]!;
    expect(dishProgress(schedule, first.task.dishId, new Set([first.task.id])).done).toBe(1);
  });
});

describe('what is looking after itself', () => {
  it('lists the holds in progress at a moment, soonest to finish first, and nothing overnight', () => {
    const holds = schedule.scheduled.filter(
      (s) => schedule.tasks[s.taskId]?.phase === 'hold' && !schedule.overnight.includes(s.taskId),
    );
    expect(holds.length).toBeGreaterThan(0);
    const probe = holds[0]!;
    const at = (probe.startMin * 60 + probe.endMin * 60) / 2;
    const watching = holdsAt(schedule, at);
    expect(watching.map((w) => w.task.id)).toContain(probe.taskId);
    for (const w of watching) {
      expect(w.secondsLeft).toBeGreaterThan(0);
      expect(w.progress).toBeGreaterThanOrEqual(0);
      expect(w.progress).toBeLessThanOrEqual(1);
      expect(schedule.overnight).not.toContain(w.task.id);
    }
    const left = watching.map((w) => w.secondsLeft);
    expect([...left].sort((a, b) => a - b)).toEqual(left);
  });

  it('shows nothing before anything has started', () => {
    // A hold can only begin after somebody has done its start phase.
    expect(holdsAt(schedule, 0)).toEqual([]);
  });
});

describe('the roster', () => {
  const crew = [aCook({ name: 'Cook 1' }), aHelper({ name: 'Cook 2' })];

  it('pairs every cook with whoever claimed them, in crew order', () => {
    const members = [{ deviceId: 'd2', cookId: crew[1]!.id, displayName: 'Ben', isHost: false }];
    const roster = slots(crew, members);
    expect(roster.map((s) => s.cook.id)).toEqual(crew.map((c) => c.id));
    expect(roster[0]!.member).toBeNull();
    expect(roster[1]!.member?.displayName).toBe('Ben');
    expect(everyoneHere(crew, members)).toBe(false);
    expect(
      everyoneHere(crew, [...members, { deviceId: 'd1', cookId: crew[0]!.id, displayName: 'Ana', isHost: true }]),
    ).toBe(true);
  });

  it('describes a role as a job, not a skill level', () => {
    expect(roleOf(crew[0]!)).toBe('knows the kitchen');
    expect(roleOf(crew[1]!)).toContain('helping');
  });
});

describe('the clock', () => {
  it('reads like a kitchen timer', () => {
    expect(clockText(0)).toBe('0:00');
    expect(clockText(754)).toBe('12:34');
    expect(clockText(3665)).toBe('61:05');
    expect(clockText(-4)).toBe('0:00');
  });

  it('counts whole seconds from the start and never runs backwards past it', () => {
    expect(elapsedSeconds(1000, 1000 + 12_999)).toBe(12);
    expect(elapsedSeconds(5000, 1000)).toBe(0);
  });

  it('folds finished tasks out of the log', () => {
    expect(
      completedFrom([
        { type: 'member-joined', taskId: null },
        { type: 'task-completed', taskId: 'task:a' },
        { type: 'task-completed', taskId: 'task:b' },
        { type: 'task-completed', taskId: 'task:a' },
      ]),
    ).toEqual(new Set(['task:a', 'task:b']));
  });
});
