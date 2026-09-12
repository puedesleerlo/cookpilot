import { useState } from 'react';
import type { Constraints, MealPlan, Schedule, Task } from '@kitchen/domain';
import { useSession } from '@/app/store';
import { Button, Glyph, Stat } from '../primitives';
import { allocateDishHues, dishHue } from '../theme';
import { Controls } from '../timeline/Controls';
import { Gantt } from '../timeline/Gantt';
import { Legend } from '../timeline/Legend';
import { RunSheet } from '../timeline/RunSheet';
import { TaskDetail } from '../timeline/TaskDetail';
import { humanMinutes, tomorrow } from '../timeline/model';

/**
 * The compiled session.
 *
 * The order of this screen is the order of the questions people actually ask: does it fit,
 * what did overlapping buy me, what am I making, what do I do, and why is it arranged like
 * that. The chart sits third because it is the answer to the second question, not the
 * first — the first is a number, and a number should be shown as a number.
 */

type Props = { plan: MealPlan; schedule: Schedule; constraints: Constraints };

export const Timeline = ({ plan, schedule, constraints }: Props) => {
  const [view, setView] = useState<'chart' | 'sheet'>('chart');
  const [open, setOpen] = useState<Task | null>(null);
  const reset = useSession((s) => s.reset);
  const goTo = useSession((s) => s.goTo);

  const hues = allocateDishHues(plan.dishes.map((d) => d.id));
  const m = schedule.metrics;
  const later = tomorrow(schedule);
  const fits = schedule.makespanMin <= schedule.timeBudgetMin;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[1100px] flex-col gap-5 px-5 py-7">
      <header>
        <p className="voice-compiler text-xs uppercase tracking-wide text-ink-faint">
          compiled · {schedule.inputHash.slice(0, 8)}
        </p>
        <h1 className="voice-display mt-1 text-3xl">{plan.name}</h1>
        <p className="mt-2 max-w-measure text-md text-ink-soft">{plan.tagline}</p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          tone={fits ? 'good' : 'warn'}
          value={`${schedule.makespanMin}`}
          label={`minutes in the kitchen, of the ${schedule.timeBudgetMin} you had`}
        />
        <Stat
          value={humanMinutes(m.minutesSavedByParallelism)}
          label="saved by running things at the same time"
        />
        <Stat value={m.portions} label={`portions, across ${m.dishCount} things`} />
        <Stat
          value={`${m.urgentIngredientsUsed}/${m.urgentIngredientsTotal}`}
          label="of the ingredients that had to go today"
        />
      </div>

      <Controls />

      <section aria-label="What you end up with">
        <ul className="flex flex-wrap gap-2">
          {plan.dishes.map((dish) => (
            <li
              key={dish.id}
              className="flex items-center gap-2 rounded-chip border-[1.5px] border-line-strong bg-cream py-2 pl-3 pr-4 shadow-1"
            >
              <span
                aria-hidden="true"
                className="h-3 w-3 flex-none rounded-full"
                style={{ background: dishHue(dish.id, hues[dish.id]) }}
              />
              <span className="text-sm font-semibold">{dish.name}</span>
              <span className="text-xs text-ink-soft">
                {dish.servings} servings{dish.keepsDays ? ` · keeps ${dish.keepsDays}d` : ''}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="The session">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="flex gap-1 rounded-sm bg-cream-deep p-1">
            <Tab active={view === 'chart'} onClick={() => setView('chart')}>
              Timeline
            </Tab>
            <Tab active={view === 'sheet'} onClick={() => setView('sheet')}>
              Run sheet
            </Tab>
          </div>
          {view === 'chart' ? (
            <p className="hidden text-xs text-ink-soft sm:block">
              One row per thing you only have one of.
            </p>
          ) : null}
        </div>

        {view === 'chart' ? (
          <>
            <Gantt schedule={schedule} onPick={setOpen} hues={hues} activeTaskId={open?.id} />
            <Legend />
          </>
        ) : (
          <RunSheet schedule={schedule} constraints={constraints} />
        )}
      </section>

      {later.length > 0 ? (
        <section aria-label="Tomorrow morning" className="rounded-md bg-plum-wash p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <span className="text-plum-ink">
              <Glyph name="jar" size={24} />
            </span>
            Tomorrow morning
          </h2>
          <p className="mt-1 text-xs text-ink-soft">
            Started tonight, finished when you get up. None of this counts against your hour.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {later.map(({ task }, i) => (
              <li key={task.id}>
                {task.name}
                {/* Name the dish once per run of tasks, not against every line. */}
                {later[i - 1]?.task.dishId === task.dishId ? null : (
                  <span className="ml-2 text-xs text-ink-soft">
                    {schedule.dishNames[task.dishId]}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {schedule.rationale.length > 0 ? (
        <section aria-label="Why it looks like this">
          <h2 className="voice-display text-lg">Why it looks like this</h2>
          <ul className="mt-2 space-y-2">
            {schedule.rationale.slice(0, 8).map((r, i) => (
              <li
                key={`${r.type}-${i}`}
                className="flex items-baseline gap-3 border-b border-line pb-2 text-sm last:border-b-0"
              >
                <span className="voice-compiler w-24 flex-none text-xs text-ink-faint">
                  {r.type.replace('-', ' ')}
                </span>
                <span className="flex-1">{r.explanation}</span>
                {r.minutes !== undefined ? (
                  <span className="voice-numeral flex-none text-sm text-ink-soft">
                    {r.minutes}m
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {schedule.degradations.length > 0 ? (
        <section aria-label="What had to give" className="rounded-md bg-orange-wash p-4">
          <h2 className="text-sm font-bold">What had to give</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {schedule.degradations.map((d) => (
              <li key={`${d.rung}-${d.order}`}>
                {d.reason}
                <span className="ml-2 text-xs text-ink-soft">saved {d.minutesSaved} min</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="flex flex-wrap items-center gap-3 pb-4">
        <Button variant="secondary" onClick={() => goTo('intake')}>
          Change the fridge
        </Button>
        <Button variant="quiet" onClick={reset}>
          Start again
        </Button>
        <p className="text-xs text-ink-soft">
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
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`rounded-xs px-4 py-2 text-sm font-bold transition-colors duration-fast
      ${active ? 'bg-cream text-charcoal shadow-1' : 'text-ink-soft hover:text-charcoal'}`}
  >
    {children}
  </button>
);
