import { useState } from 'react';
import type { Constraints, MealPlan, Schedule, Task } from '@kitchen/domain';
import { useSession } from '@/app/store';
import { useSync } from '@/app/sync';
import { Button, Glyph, Motif } from '../primitives';
import { allocateDishHues } from '../theme';
import { posterDrawings } from '../timeline/collage';
import { Controls } from '../timeline/Controls';
import { DishTags } from '../timeline/DishTags';
import { Gantt } from '../timeline/Gantt';
import { Icon, type IconName } from '../timeline/Icon';
import { Legend } from '../timeline/Legend';
import { RunSheet } from '../timeline/RunSheet';
import { FitPoster, StatStrip } from '../timeline/Stats';
import { TaskDetail } from '../timeline/TaskDetail';
import { humanMinutes, tomorrow } from '../timeline/model';

/**
 * The compiled session.
 *
 * The order of this screen is the order of the questions people actually ask: does it fit,
 * what did overlapping buy me, what am I making, what do I do, and why is it arranged like
 * that. The chart sits third because it is the answer to the second question, not the
 * first — the first is a number, and a number should be shown as a number.
 *
 * Everything round the chart is a collage — the title stamped on a sheet, the fit as a
 * poster, the dishes as tags, tomorrow on a night-plum ground — and the chart itself stays
 * quiet on its bright page, because it is the one thing here that has to be read closely.
 */

type Props = { plan: MealPlan; schedule: Schedule; constraints: Constraints };

export const Timeline = ({ plan, schedule, constraints }: Props) => {
  const [view, setView] = useState<'chart' | 'sheet'>('chart');
  const [open, setOpen] = useState<Task | null>(null);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set());
  const reset = useSession((s) => s.reset);
  const goTo = useSession((s) => s.goTo);
  const intake = useSession((s) => s.intake);
  const host = useSync((s) => s.host);

  const hues = allocateDishHues(plan.dishes.map((d) => d.id));
  const m = schedule.metrics;
  const later = tomorrow(schedule);

  const tick = (taskId: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });

  return (
    <main className="mx-auto flex min-h-dvh max-w-[1100px] flex-col overflow-x-clip gap-7 px-4 pb-7 pt-5 sm:gap-8 sm:px-6 sm:pt-7">
      <header className="grid items-center gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,25rem)] lg:gap-7">
        <div className="relative rounded-nick-lg bg-surface px-5 pb-7 pt-5 sm:px-7 sm:pb-8 sm:pt-7">
          <p className="voice-compiler inline-block -rotate-2 bg-mk-plum px-3 py-1 text-xs uppercase tracking-wide text-paper [clip-path:var(--mk-cut-tag)]">
            compiled · {schedule.inputHash.slice(0, 8)}
          </p>
          <h1
            className="voice-display mt-4 text-4xl leading-[0.9] [--stamp-from:-7deg] [--stamp-to:0deg] sm:text-5xl lg:text-[length:5.5rem]
              motion-safe:animate-[mk-stamp_var(--d-slow)_var(--mk-ease-stamp)_both]"
          >
            {plan.name}
          </h1>
          <span
            aria-hidden="true"
            className="mt-4 block h-4 w-[45%] max-w-[16rem] -rotate-1 bg-paprika [clip-path:var(--mk-cut-edge-bottom)]"
          />
          <p className="mt-4 max-w-measure text-md text-muted">{plan.tagline}</p>
          <Motif
            name="leaf"
            className="pointer-events-none absolute -right-2 -top-5 w-[2.75rem] rotate-[28deg]"
            m1="var(--mk-garden)"
            m3="var(--mk-paper-bright)"
          />
        </div>

        <FitPoster
          makespanMin={schedule.makespanMin}
          budgetMin={schedule.timeBudgetMin}
          drawings={posterDrawings(plan)}
        />
      </header>

      <StatStrip
        items={[
          { value: humanMinutes(m.minutesSavedByParallelism), label: 'saved by running things at the same time' },
          { value: m.portions, label: `portions, across ${m.dishCount} things` },
          {
            value: `${m.urgentIngredientsUsed}/${m.urgentIngredientsTotal}`,
            label: 'of the ingredients that had to go today',
          },
        ]}
      />

      <Controls />

      <DishTags plan={plan} hues={hues} />

      <section aria-label="The session" className="relative">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
          <div role="group" aria-label="Show the session as" className="inline-flex gap-1 rounded-nick-md bg-sunken p-1">
            <Tab active={view === 'chart'} icon="chart" onClick={() => setView('chart')}>
              Timeline
            </Tab>
            <Tab active={view === 'sheet'} icon="list" onClick={() => setView('sheet')}>
              Run sheet
            </Tab>
          </div>
          {/* On its own scrap of paper: this line can land on the cut-outs round the page edge. */}
          <p className="rounded-nick-xs bg-bg px-2 py-1 text-sm text-muted">
            {view === 'chart'
              ? 'One row per thing you only have one of.'
              : 'The same session, as a list to follow.'}
          </p>
        </div>

        {view === 'chart' ? (
          <>
            <div className="relative">
              <Motif
                name="spark"
                className="pointer-events-none absolute -right-3 -top-6 -z-10 w-[3rem] rotate-[18deg]"
                m1="var(--mk-cornflower)"
              />
              <Gantt schedule={schedule} onPick={setOpen} hues={hues} activeTaskId={open?.id} />
            </div>
            <Legend hues={plan.dishes.map((d) => hues[d.id] ?? 0)} />
          </>
        ) : (
          <RunSheet schedule={schedule} constraints={constraints} ticked={ticked} onTick={tick} />
        )}
      </section>

      {later.length > 0 ? (
        <section
          aria-label="Tomorrow morning"
          className="relative grid gap-5 overflow-hidden rounded-nick-lg bg-mk-plum px-5 pb-7 pt-6 text-paper sm:px-7 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-7"
        >
          <Motif
            name="poppy"
            className="pointer-events-none absolute -right-2 bottom-3 w-[6rem] rotate-12 opacity-40"
            m1="var(--mk-plum-100)"
          />
          <div className="relative">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid h-[3.5rem] w-[3.5rem] flex-none -rotate-6 place-items-center bg-enamel text-plum-900 [clip-path:var(--mk-cut-plate)]"
              >
                <Glyph name="jar" size={30} strokeWidth={2} />
              </span>
              <h2 className="voice-display text-xl sm:text-2xl">Tomorrow morning</h2>
            </div>
            <p className="mt-3 max-w-measure text-sm text-plum-100">
              Started tonight, finished when you get up. None of this counts against your hour.
            </p>
          </div>
          <ol className="relative grid gap-2">
            {later.map(({ task }, i) => (
              <li key={task.id} className="flex items-baseline gap-3 rounded-nick-md bg-plum-900 px-4 py-3">
                <span aria-hidden="true" className="voice-display w-[1.75rem] flex-none text-xl leading-none text-enamel">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 text-md">
                  {task.name}
                  {/* Name the dish once per run of tasks, not against every line. */}
                  {later[i - 1]?.task.dishId === task.dishId ? null : (
                    <span className="ml-2 inline-block rounded-nick-xs bg-mk-plum px-2 text-xs text-plum-100">
                      {schedule.dishNames[task.dishId]}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {schedule.rationale.length > 0 ? (
        <section aria-label="Why it looks like this">
          <div className="flex items-end gap-3">
            <h2 className="voice-display text-xl sm:text-2xl">Why it looks like this</h2>
            <Motif name="mushroom" className="mb-1 w-[2.25rem] -rotate-6" m1="var(--mk-paprika)" m3="var(--mk-paper)" />
          </div>
          <ul className="mt-4 grid gap-3 md:grid-cols-2">
            {schedule.rationale.slice(0, 8).map((r, i) => (
              <li
                key={`${r.type}-${i}`}
                className="flex items-start gap-4 rounded-nick-md bg-surface px-4 pb-4 pt-3"
              >
                <div className="min-w-0 flex-1">
                  <span className="voice-compiler inline-block rounded-nick-xs bg-sunken px-2 text-xs text-muted">
                    {r.type.replace('-', ' ')}
                  </span>
                  <p className="mt-2 text-sm text-ink">{r.explanation}</p>
                </div>
                {r.minutes !== undefined ? (
                  <span className="voice-display flex-none pt-1 text-xl normal-case leading-none text-paprika-700">
                    {r.minutes}m
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {schedule.degradations.length > 0 ? (
        <section aria-label="What had to give" className="rounded-nick-lg bg-warning-bg px-5 pb-5 pt-4 sm:px-6">
          <h2 className="flex items-center gap-2 text-md font-bold text-warning">
            <Icon name="alert" className="h-5 w-5" />
            What had to give
          </h2>
          <ul className="mt-3 grid gap-2">
            {schedule.degradations.map((d) => (
              <li
                key={`${d.rung}-${d.order}`}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-nick-md bg-surface px-4 py-3 text-sm text-ink"
              >
                {d.reason}
                <span className="mk-tag mk-tag--warning text-xs font-bold">saved {d.minutesSaved} min</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section
        aria-label="Cook it together"
        className="relative grid items-center gap-5 rounded-nick-lg bg-surface px-5 py-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:px-7 lg:grid-cols-[auto_minmax(0,1fr)_auto]"
      >
        <div aria-hidden="true" className="relative h-[6.5rem] w-[9rem] flex-none">
          <span className="absolute left-0 top-1 grid h-[5.25rem] w-[5.25rem] -rotate-6 place-items-center bg-enamel text-plum-900 [clip-path:var(--mk-cut-plate)]">
            <Glyph name="cook-0" size={48} strokeWidth={2} />
          </span>
          <span className="absolute bottom-0 right-0 grid h-[5.25rem] w-[5.25rem] rotate-6 place-items-center bg-marigold text-plum-900 [clip-path:var(--mk-cut-plate)]">
            <Glyph name="cook-1" size={48} strokeWidth={2} />
          </span>
          <Motif name="spark" className="absolute -top-2 right-2 w-[1.75rem]" m1="var(--mk-paprika)" />
        </div>
        <div className="max-w-measure">
          <h2 className="voice-display text-xl sm:text-2xl">Cooking with someone?</h2>
          <p className="mt-2 text-sm text-muted">
            Each phone scans a code, picks a cook, and gets its own steps with timers that count
            down together.
          </p>
        </div>
        <Button
          variant="primary"
          size="lg"
          icon="cook-1"
          className="justify-self-start sm:col-span-2 lg:col-span-1 lg:justify-self-end"
          onClick={() => void host(intake, { ok: true, plan, schedule, constraints })}
        >
          Cook this together
        </Button>
      </section>

      <footer className="mb-4 flex flex-wrap items-center gap-3 rounded-nick-lg bg-bg px-4 py-4">
        <Button variant="secondary" onClick={() => goTo('intake')}>
          Change the fridge
        </Button>
        <Button variant="quiet" onClick={reset}>
          Start again
        </Button>
        <p className="text-xs text-muted">
          Everything above was worked out on this device. No account, no server, no key.
        </p>
      </footer>

      {open ? (
        <TaskDetail
          schedule={schedule}
          constraints={constraints}
          task={open}
          hueIndex={hues[open.dishId]}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </main>
  );
};

const Tab = ({
  active,
  icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: IconName;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`inline-flex min-h-touch items-center gap-2 rounded-nick-sm px-4 text-md font-bold [font-variation-settings:var(--mk-sharp)]
      transition-[transform,background-color,color] duration-base ease-stamp
      ${active ? '-rotate-1 bg-selected text-on-selected' : 'text-muted hover:bg-surface hover:text-ink'}`}
  >
    <Icon name={icon} className="h-5 w-5" />
    {children}
  </button>
);
