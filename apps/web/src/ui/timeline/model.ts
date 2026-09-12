import type { Lane, Schedule, ScheduledTask, Task } from '@kitchen/domain';
import type { BlockTreatment } from '../theme';

/**
 * The chart, as data.
 *
 * Deliberately separate from the components that draw it: laying out a Gantt is arithmetic
 * with a lot of off-by-one in it, and arithmetic is much easier to be sure about when it
 * can be tested without a DOM. Nothing in here knows what a pixel looks like beyond the
 * scale it is handed.
 */

/** How wide a minute is when nothing has measured the container yet. */
export const PX_PER_MIN = 16;

/** Narrower than this and a block is a sliver; wider and an hour will not fit a laptop. */
export const MIN_SCALE = 9;
export const MAX_SCALE = 26;

/**
 * Pick a scale so the attended session fits the width it has been given.
 *
 * What must fit without scrolling is minute zero to the moment the last pair of hands comes
 * free, because that span *is* the claim — you can see two cooks overlapping, or you
 * cannot. The passive tail past it may scroll; nobody needs to watch a fridge to the pixel.
 */
export const scaleFor = (availablePx: number, makespanMin: number): number => {
  if (availablePx <= 0 || makespanMin <= 0) return PX_PER_MIN;
  const fit = availablePx / makespanMin;
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.floor(fit)));
};

/**
 * A block is never drawn wider than its own duration — the floor is exactly one minute.
 *
 * The tempting alternative, a fixed minimum width so a one-minute job stays readable, makes
 * the chart lie twice over: it draws a minute as though it were two, and it pushes the
 * block over the top of whatever starts a minute later, which on a cook's row is usually
 * the very next thing they do. A Gantt whose blocks overlap when the schedule does not is
 * worse than one with some small blocks in it. Legibility is solved by hovering (the block
 * widens to fit its name) and by the run sheet.
 */
export const minBlockPx = (pxPerMin: number): number => pxPerMin;

export type Block = {
  id: string;
  task: Task;
  scheduled: ScheduledTask;
  treatment: BlockTreatment;
  leftPx: number;
  widthPx: number;
  /** True where the block was widened past its real duration to stay legible. */
  padded: boolean;
};

export type Row = { lane: Lane; blocks: Block[] };
export type Group = { group: Lane['group']; label: string; rows: Row[] };

export const GROUP_LABEL: Record<Lane['group'], string> = {
  people: 'Hands',
  heat: 'Heat',
  tools: 'Tools',
  cold: 'Cold',
};

export const treatmentOf = (task: Task): BlockTreatment => {
  if (task.class === 'wash-up') return 'wash';
  if (task.phase === 'hold') return 'hold';
  return 'active';
};

/**
 * The chart spans the session, not the calendar.
 *
 * A cold brew steeps for twelve hours. Drawn to scale alongside it, an hour of cooking is
 * four pixels wide. So the overnight tasks come out of the chart and are listed separately
 * as what happens tomorrow, which is also how anyone would describe them.
 */
export const inSession = (schedule: Schedule): ScheduledTask[] =>
  schedule.scheduled.filter((s) => !schedule.overnight.includes(s.taskId));

/**
 * The chart runs to the last thing that finishes tonight, which is later than the makespan.
 * The makespan is when your hands come free; the fridge goes on chilling after you have
 * walked away, and cutting the chart off at the makespan would hide the tail that explains
 * why the session fits in the first place.
 */
export const spanOf = (schedule: Schedule): number =>
  Math.max(schedule.makespanMin, ...inSession(schedule).map((s) => s.endMin), 1);

/** Ruler ticks every `step` minutes, always including the right-hand edge. */
export const ticksFor = (spanMin: number, step = 5): number[] => {
  const ticks: number[] = [];
  for (let t = 0; t <= spanMin; t += step) ticks.push(t);
  if (ticks[ticks.length - 1] !== spanMin) ticks.push(spanMin);
  return ticks;
};

export const blockFor = (
  scheduled: ScheduledTask,
  task: Task,
  pxPerMin: number,
  laneId: string,
): Block => {
  const rawPx = (scheduled.endMin - scheduled.startMin) * pxPerMin;
  const widthPx = Math.max(minBlockPx(pxPerMin), rawPx);
  return {
    id: `${laneId}:${scheduled.taskId}`,
    task,
    scheduled,
    treatment: treatmentOf(task),
    leftPx: scheduled.startMin * pxPerMin,
    widthPx,
    padded: widthPx > rawPx,
  };
};

/** `lane:cutting-board:1` -> `cutting-board`. Cook lanes have no kind. */
const kindOfLane = (laneId: string): string | null => {
  const parts = laneId.split(':');
  return parts[1] === 'cook' || parts.length < 3 ? null : parts[1]!;
};

/**
 * Which equipment rows earn their space.
 *
 * An equipment row exists to show contention — the one pan, used three times, with the
 * washing in between. A row with a single block on it shows none: it says "this task used a
 * jar", which the block itself already said. Drawn anyway, the chart grew to five identical
 * storage-container rows holding one two-minute block each, and the two rows that carry the
 * whole argument — the cooks — were pushed off the top of the screen.
 *
 * So a *kind* is kept when any one of its instances is used more than once, and then all of
 * its instances are drawn: showing "Cutting board 2" without "Cutting board" would be a
 * stranger omission than leaving both out. Nothing is lost — the run sheet lists every task.
 */
const CONTENDED_MIN_BLOCKS = 2;

const contendedKinds = (rows: Row[]): Set<string> => {
  const most = new Map<string, number>();
  for (const row of rows) {
    const kind = kindOfLane(row.lane.id);
    if (!kind) continue;
    most.set(kind, Math.max(most.get(kind) ?? 0, row.blocks.length));
  }
  return new Set([...most].filter(([, n]) => n >= CONTENDED_MIN_BLOCKS).map(([kind]) => kind));
};

/** The rows to draw, grouped, with empty equipment rows dropped but cooks always kept. */
export const groupsOf = (schedule: Schedule, pxPerMin = PX_PER_MIN): Group[] => {
  const byId = new Map(schedule.scheduled.map((s) => [s.taskId, s]));
  const hidden = new Set(schedule.overnight);

  const rows: Row[] = schedule.lanes.map((lane) => ({
    lane,
    blocks: lane.taskIds
      .filter((id) => !hidden.has(id))
      .flatMap((id) => {
        const scheduled = byId.get(id);
        const task = schedule.tasks[id];
        return scheduled && task ? [blockFor(scheduled, task, pxPerMin, lane.id)] : [];
      })
      .sort((a, b) => a.leftPx - b.leftPx),
  }));

  const contended = contendedKinds(rows);
  const keep = (row: Row): boolean => {
    if (row.lane.group === 'people') return true;
    const kind = kindOfLane(row.lane.id);
    return row.blocks.length > 0 && kind !== null && contended.has(kind);
  };

  const order: Lane['group'][] = ['people', 'heat', 'tools', 'cold'];
  return order
    .map((group) => ({
      group,
      label: GROUP_LABEL[group],
      rows: rows.filter((r) => r.lane.group === group && keep(r)),
    }))
    .filter((g) => g.rows.length > 0);
};

/** What happens after everyone has gone to bed, in the order it happens. */
export const tomorrow = (schedule: Schedule): { task: Task; scheduled: ScheduledTask }[] =>
  schedule.overnight
    .flatMap((id) => {
      const task = schedule.tasks[id];
      const scheduled = schedule.scheduled.find((s) => s.taskId === id);
      return task && scheduled ? [{ task, scheduled }] : [];
    })
    .filter(({ task }) => task.phase !== 'hold')
    .sort((a, b) => a.scheduled.startMin - b.scheduled.startMin);

/** `74` -> `1h 14m`, `59` -> `59 min`. Used for durations, never for clock times. */
export const humanMinutes = (min: number): string => {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};
