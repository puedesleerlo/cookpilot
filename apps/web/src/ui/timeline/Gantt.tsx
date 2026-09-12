import { useEffect, useRef, useState } from 'react';
import type { Schedule, Task } from '@kitchen/domain';
import { blockStyle } from '../theme';
import { PX_PER_MIN, groupsOf, scaleFor, spanOf, ticksFor, type Block } from './model';

/**
 * The chart.
 *
 * This is the screen the whole product exists to show, so it is drawn to answer one
 * question first — *what is happening at the same time as what* — and everything else
 * second. Hence rows of real resources rather than a list of steps: two cooks, the burners,
 * the pans. Overlap you can see is the argument.
 *
 * Time runs in pixels, not percentages, so that a one-minute label and a twenty-minute
 * steep stay honestly proportional to each other and the chart scrolls on a phone instead
 * of squeezing into something unreadable.
 */

const LABEL_PX = 116;

/** On a phone the row labels would take a third of the chart, so they give some back. */
const NARROW_PX = 520;
const NARROW_LABEL_PX = 80;
const labelWidth = (available: number): number =>
  available > 0 && available < NARROW_PX ? NARROW_LABEL_PX : LABEL_PX;

/**
 * The width the chart has to play with, measured rather than assumed.
 *
 * A fixed scale either overflows a phone or wastes half a desktop, and the one span that
 * must never need scrolling — minute zero to hands-free — is different for every session.
 * Falls back to the default scale where there is nothing to measure, which is jsdom and the
 * first paint.
 */
const useAvailableWidth = (): [React.RefObject<HTMLDivElement | null>, number] => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
};

type Props = {
  schedule: Schedule;
  onPick: (task: Task) => void;
  /** Dish id to hue index, allocated once for the whole plan so no two dishes collide. */
  hues: Record<string, number>;
  /** The task whose detail panel is open, if any. */
  activeTaskId?: string;
};

export const Gantt = ({ schedule, onPick, hues, activeTaskId }: Props) => {
  const [ref, available] = useAvailableWidth();
  /**
   * The tools open closed.
   *
   * Hands and heat are the argument — two cooks overlapping, two burners never idle. The
   * pans and boards are the evidence, and there are fifteen rows of it; left open they push
   * the argument off the top of the screen. So they are one click away rather than gone.
   */
  const [showTools, setShowTools] = useState(false);

  const labelPx = labelWidth(available);
  const pxPerMin = available > 0 ? scaleFor(available - labelPx - 24, schedule.makespanMin) : PX_PER_MIN;

  const spanMin = spanOf(schedule);
  const groups = groupsOf(schedule, pxPerMin);
  const ticks = ticksFor(spanMin, pxPerMin < 12 ? 10 : 5);
  const chartPx = spanMin * pxPerMin;
  const budgetPx = schedule.timeBudgetMin * pxPerMin;
  const donePx = schedule.makespanMin * pxPerMin;

  return (
    <div ref={ref} className="overflow-x-auto overscroll-x-contain rounded-md bg-cream-deep">
      <div style={{ width: labelPx + chartPx + 16 }} className="min-w-full p-2">
        <Ruler
          ticks={ticks}
          spanMin={spanMin}
          budgetPx={budgetPx}
          donePx={donePx}
          chartPx={chartPx}
          pxPerMin={pxPerMin}
          labelPx={labelPx}
          doneMin={schedule.makespanMin}
        />

        {groups.map((group) => {
          const collapsible = group.group === 'tools';
          const open = !collapsible || showTools;
          return (
          <section key={group.group} aria-label={group.label}>
            <h3 className="sticky left-0 z-10 mt-3 w-fit px-1 text-xs font-bold text-ink-faint">
              {collapsible ? (
                <button
                  type="button"
                  onClick={() => setShowTools((v) => !v)}
                  aria-expanded={open}
                  className="hover:text-charcoal"
                >
                  {group.label} · {group.rows.length} rows {open ? '−' : '+'}
                </button>
              ) : (
                group.label
              )}
            </h3>
            {(open ? group.rows : []).map((row) => (
              <div key={row.lane.id} className="flex items-stretch">
                <div
                  style={{ width: labelPx }}
                  className="sticky left-0 z-10 flex flex-none items-center bg-cream-deep pr-3 text-xs font-semibold text-ink-soft"
                >
                  <span className="truncate">{row.lane.label}</span>
                </div>
                <div
                  className="relative my-1 h-8 flex-none rounded-xs bg-cream/60"
                  style={{ width: chartPx }}
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 bg-cream-sunk/50"
                    style={{ left: donePx, width: Math.max(0, chartPx - donePx) }}
                  />
                  <Gridlines ticks={ticks} pxPerMin={pxPerMin} />
                  {row.blocks.map((block) => (
                    <BlockChip
                      key={block.id}
                      block={block}
                      dishName={schedule.dishNames[block.task.dishId] ?? 'Session'}
                      hueIndex={hues[block.task.dishId]}
                      active={block.task.id === activeTaskId}
                      onPick={onPick}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
          );
        })}
      </div>
    </div>
  );
};

const Gridlines = ({ ticks, pxPerMin }: { ticks: number[]; pxPerMin: number }) => (
  <div aria-hidden="true" className="absolute inset-0">
    {ticks.map((t) => (
      <span key={t} className="absolute top-0 h-full w-px bg-line/70" style={{ left: t * pxPerMin }} />
    ))}
  </div>
);

type RulerProps = {
  ticks: number[];
  spanMin: number;
  budgetPx: number;
  donePx: number;
  doneMin: number;
  chartPx: number;
  pxPerMin: number;
  labelPx: number;
};

/**
 * The ruler carries both lines that matter: the budget, because "did it fit" is the second
 * question everyone asks, and the point where the last pair of hands comes free, because
 * everything drawn to the right of it is the kitchen working without you.
 */
const Ruler = ({ ticks, budgetPx, donePx, doneMin, chartPx, pxPerMin, labelPx }: RulerProps) => (
  <div className="flex items-end">
    <div style={{ width: labelPx }} className="sticky left-0 z-10 flex-none bg-cream-deep" />
    <div className="relative h-6 flex-none" style={{ width: chartPx }}>
      {ticks.map((t) => (
        <span
          key={t}
          className="voice-compiler absolute bottom-0 text-xs text-ink-faint"
          style={{ left: t * pxPerMin, transform: 'translateX(-50%)' }}
        >
          {t % 10 === 0 ? t : '·'}
        </span>
      ))}
      <span
        className="absolute -top-1 bottom-0 w-px bg-sage-deep"
        style={{ left: donePx }}
        aria-hidden="true"
      />
      <span
        className="voice-compiler absolute -top-1 whitespace-nowrap text-xs font-bold text-sage-ink"
        style={{ left: donePx - 6, transform: 'translateX(-100%)' }}
      >
        hands free · {doneMin}m
      </span>
      {budgetPx <= chartPx ? (
        <span
          className="absolute bottom-0 top-0 w-px bg-tomato"
          style={{ left: budgetPx }}
          aria-hidden="true"
        />
      ) : null}
    </div>
  </div>
);

type ChipProps = {
  block: Block;
  dishName: string;
  hueIndex?: number;
  active: boolean;
  onPick: (task: Task) => void;
};

/**
 * Below this a task name is more ellipsis than name, so the block carries its duration
 * instead and the name arrives on hover, in the tooltip and in the detail panel.
 */
const NAME_FITS_PX = 92;

/** Narrow blocks give their whole width to the number; there is no room for padding. */
const PAD = (widthPx: number): string => (widthPx < 44 ? 'px-0' : 'px-1');

const BlockChip = ({ block, dishName, hueIndex, active, onPick }: ChipProps) => {
  const { task, scheduled, treatment } = block;
  const [hovered, setHovered] = useState(false);
  const minutes = scheduled.endMin - scheduled.startMin;
  const wide = block.widthPx >= NAME_FITS_PX;

  return (
    <button
      type="button"
      onClick={() => onPick(task)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`${task.name} — ${dishName}`}
      aria-label={`${task.name}, ${dishName}, minute ${scheduled.startMin} to ${scheduled.endMin}${
        scheduled.isCritical ? ', on the critical path' : ''
      }`}
      style={{
        left: block.leftPx,
        // Hovering widens a narrow block enough to read its name, rather than showing an
        // ellipsis and making people open a panel to find out what a two-minute job is.
        width: hovered ? Math.max(block.widthPx, 170) : block.widthPx,
        zIndex: hovered ? 20 : undefined,
        ...blockStyle(task.dishId, treatment, scheduled.isCritical, hueIndex),
      }}
      className={`absolute inset-y-0 overflow-hidden rounded-xs border-[1.5px] ${PAD(block.widthPx)}
        text-xs leading-8 transition-[width,box-shadow] duration-fast ease-out
        hover:shadow-2
        ${wide || hovered ? 'text-left' : 'text-center'}
        ${active ? 'z-20 shadow-2' : ''}`}
    >
      <span className="voice-ui block truncate font-semibold text-charcoal">
        {wide || hovered ? task.name : block.widthPx >= 24 ? `${minutes}m` : ''}
      </span>
    </button>
  );
};
