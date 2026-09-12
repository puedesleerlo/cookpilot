import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { compileSession } from '@/app/compile';
import { demoIntake } from '@/app/demo';
import { Timeline } from '@/ui/screens/Timeline';
import {
  MAX_SCALE,
  MIN_SCALE,
  PX_PER_MIN,
  groupsOf,
  minBlockPx,
  scaleFor,
  spanOf,
  ticksFor,
  tomorrow,
  humanMinutes,
} from './model';

/**
 * The timeline, against a real compiled session rather than a hand-built fixture. A chart
 * that renders beautifully from invented data and falls over on the real thing is the
 * failure mode worth testing for.
 */

const outcome = compileSession(demoIntake());
if (!outcome.ok) throw new Error(`the demo must compile: ${outcome.reason}`);
const { plan, schedule, constraints } = outcome;

describe('the chart model', () => {
  it('spans tonight, not the twelve hours the cold brew steeps for', () => {
    // It runs past the makespan on purpose: the fridge is still chilling after the cooks
    // have walked away, and that tail is why the session fits.
    expect(spanOf(schedule)).toBeGreaterThanOrEqual(schedule.makespanMin);
    expect(spanOf(schedule)).toBeLessThan(180);
    expect(Math.max(...schedule.scheduled.map((s) => s.endMin))).toBeGreaterThan(600);
  });

  it('keeps every cook row, and only equipment rows that can clash', () => {
    const groups = groupsOf(schedule);
    const people = groups.find((g) => g.group === 'people');
    expect(people?.rows).toHaveLength(constraints.cooks.length);

    const kinds = new Map<string, number>();
    for (const g of groups) {
      if (g.group === 'people') continue;
      for (const row of g.rows) {
        expect(row.blocks.length).toBeGreaterThan(0);
        const kind = row.lane.id.split(':')[1]!;
        kinds.set(kind, Math.max(kinds.get(kind) ?? 0, row.blocks.length));
      }
    }
    // Every kind drawn has at least one instance used more than once.
    for (const [kind, most] of kinds) expect(most, kind).toBeGreaterThan(1);
    // And the burners, which the whole session contends for, are among them.
    expect([...kinds.keys()]).toContain('burner');
  });

  it('leaves out the containers each used once, so the cooks stay on screen', () => {
    const drawn = groupsOf(schedule).flatMap((g) => g.rows.map((r) => r.lane.id));
    const all = schedule.lanes.map((l) => l.id);
    expect(all.filter((id) => id.includes('storage-container')).length).toBeGreaterThan(3);
    expect(drawn.filter((id) => id.includes('storage-container'))).toEqual([]);
    expect(drawn.length).toBeLessThan(all.length);
  });

  it('draws no overnight work on the chart', () => {
    const drawn = groupsOf(schedule).flatMap((g) => g.rows.flatMap((r) => r.blocks.map((b) => b.task.id)));
    for (const id of schedule.overnight) expect(drawn).not.toContain(id);
  });

  it('never draws a block wider than its own minutes, at any scale', () => {
    for (const scale of [MIN_SCALE, PX_PER_MIN, MAX_SCALE]) {
      const blocks = groupsOf(schedule, scale).flatMap((g) => g.rows.flatMap((r) => r.blocks));
      expect(blocks.length).toBeGreaterThan(10);
      for (const b of blocks) {
        const minutes = b.scheduled.endMin - b.scheduled.startMin;
        expect(b.widthPx).toBeGreaterThanOrEqual(minBlockPx(scale));
        expect(b.widthPx).toBeLessThanOrEqual(Math.max(minutes, 1) * scale);
      }
    }
  });

  it('never lets two blocks on a row overlap, because the schedule does not', () => {
    for (const scale of [MIN_SCALE, PX_PER_MIN, MAX_SCALE]) {
      for (const group of groupsOf(schedule, scale)) {
        for (const row of group.rows) {
          for (let i = 1; i < row.blocks.length; i++) {
            const previous = row.blocks[i - 1]!;
            const next = row.blocks[i]!;
            expect(next.leftPx, `${row.lane.label} at ${scale}px/min`)
              .toBeGreaterThanOrEqual(previous.leftPx + previous.widthPx);
          }
        }
      }
    }
  });

  it('keeps the run sheet and the chart telling the same story', () => {
    const drawn = new Set(
      groupsOf(schedule)
        .flatMap((g) => g.rows.flatMap((r) => r.blocks.map((b) => b.task.id))),
    );
    const attended = schedule.scheduled
      .filter((s) => !schedule.overnight.includes(s.taskId))
      .filter((s) => schedule.tasks[s.taskId]?.phase !== 'hold')
      .map((s) => s.taskId);
    // Every attended task is on the chart somewhere, even when its tool row is collapsed.
    for (const id of attended) expect(drawn, id).toContain(id);
  });

  it('scales so the attended session fits the width it is given', () => {
    expect(scaleFor(900, 59)).toBe(15);
    expect(scaleFor(900, 59) * 59).toBeLessThanOrEqual(900);
    // A phone cannot fit an hour; it clamps and scrolls rather than drawing slivers.
    expect(scaleFor(260, 59)).toBe(MIN_SCALE);
    // A short session does not get absurdly stretched to fill a wide screen.
    expect(scaleFor(1400, 12)).toBe(MAX_SCALE);
    expect(scaleFor(0, 59)).toBe(PX_PER_MIN);
  });

  it('places a block where its minutes say it goes', () => {
    const blocks = groupsOf(schedule).flatMap((g) => g.rows.flatMap((r) => r.blocks));
    for (const b of blocks) expect(b.leftPx).toBe(b.scheduled.startMin * PX_PER_MIN);
  });

  it('marks holds as holds and washes as washes', () => {
    const blocks = groupsOf(schedule).flatMap((g) => g.rows.flatMap((r) => r.blocks));
    for (const b of blocks) {
      if (b.task.phase === 'hold') expect(b.treatment).toBe('hold');
      if (b.task.class === 'wash-up') expect(b.treatment).toBe('wash');
    }
  });

  it('always rules the far edge, whatever the span divides by', () => {
    expect(ticksFor(59)).toContain(59);
    expect(ticksFor(60)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]);
  });

  it('lists tomorrow in the order it happens, and leaves out the waiting', () => {
    const later = tomorrow(schedule);
    expect(later.length).toBeGreaterThan(0);
    for (const { task } of later) expect(task.phase).not.toBe('hold');
    const starts = later.map((l) => l.scheduled.startMin);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  it('says 1h 14m rather than 74 min', () => {
    expect(humanMinutes(59)).toBe('59 min');
    expect(humanMinutes(74)).toBe('1h 14m');
    expect(humanMinutes(120)).toBe('2h');
  });
});

describe('the compiled-session screen', () => {
  it('leads with whether it fits and what parallelism bought', () => {
    render(<Timeline plan={plan} schedule={schedule} constraints={constraints} />);
    expect(screen.getByText(String(schedule.makespanMin))).toBeInTheDocument();
    expect(
      screen.getByText(`minutes in the kitchen, of the ${schedule.timeBudgetMin} you had`),
    ).toBeInTheDocument();
    expect(screen.getByText(/saved by running things at the same time/)).toBeInTheDocument();
  });

  it('names every dish it is going to make', () => {
    render(<Timeline plan={plan} schedule={schedule} constraints={constraints} />);
    // getAllByText: a dish can be named twice, once in the legend and once in tomorrow's list.
    for (const dish of plan.dishes) expect(screen.getAllByText(dish.name).length).toBeGreaterThan(0);
  });

  it('draws a block for every in-session task, labelled for a screen reader', () => {
    render(<Timeline plan={plan} schedule={schedule} constraints={constraints} />);
    const drawn = groupsOf(schedule).flatMap((g) => g.rows.flatMap((r) => r.blocks));
    const first = drawn[0]!;
    expect(
      screen.getAllByRole('button', {
        name: new RegExp(`minute ${first.scheduled.startMin} to ${first.scheduled.endMin}`),
      }).length,
    ).toBeGreaterThan(0);
  });

  it('opens a task and explains it', async () => {
    const user = userEvent.setup();
    render(<Timeline plan={plan} schedule={schedule} constraints={constraints} />);
    const block = groupsOf(schedule).flatMap((g) => g.rows.flatMap((r) => r.blocks))[0]!;
    await user.click(screen.getAllByRole('button', { name: new RegExp(block.task.name) })[0]!);
    const panel = screen.getByRole('dialog');
    expect(within(panel).getByText('When')).toBeInTheDocument();
    expect(within(panel).getByText(`minute ${block.scheduled.startMin} to ${block.scheduled.endMin}`))
      .toBeInTheDocument();
  });

  it('switches to a run sheet that covers the same session', async () => {
    const user = userEvent.setup();
    render(<Timeline plan={plan} schedule={schedule} constraints={constraints} />);
    await user.click(screen.getByRole('button', { name: 'Run sheet' }));
    const attended = schedule.scheduled.filter(
      (s) => !schedule.overnight.includes(s.taskId) && schedule.tasks[s.taskId]?.phase !== 'hold',
    );
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(attended.length);
    expect(screen.getByText(attended[0] ? schedule.tasks[attended[0].taskId]!.name : '')).toBeInTheDocument();
  });

  it('opens with the cooks and the heat, and the tools one click away', async () => {
    const user = userEvent.setup();
    render(<Timeline plan={plan} schedule={schedule} constraints={constraints} />);

    const tools = screen.getByRole('button', { name: /^Tools · \d+ rows/ });
    expect(tools).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Cutting board 2')).not.toBeInTheDocument();

    // The argument itself is never behind a click.
    for (const cook of constraints.cooks) expect(screen.getByText(cook.name)).toBeInTheDocument();
    expect(screen.getByText('Burner')).toBeInTheDocument();

    await user.click(tools);
    expect(tools).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Cutting board 2')).toBeInTheDocument();
  });

  it('tells you what happens tomorrow instead of hiding it', () => {
    render(<Timeline plan={plan} schedule={schedule} constraints={constraints} />);
    const section = screen.getByRole('region', { name: 'Tomorrow morning' });
    expect(within(section).getByText(/None of this counts against your hour/)).toBeInTheDocument();
  });
});
