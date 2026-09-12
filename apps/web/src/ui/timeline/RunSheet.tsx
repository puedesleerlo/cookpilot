import type { Constraints, Schedule } from '@kitchen/domain';
import { humanMinutes, treatmentOf } from './model';

/**
 * The same schedule, as a list you can follow.
 *
 * The chart answers "does this fit"; the run sheet answers "what do I do now". Both come
 * from the same compiled schedule, so they cannot disagree — and the sheet is the one that
 * survives being printed and stuck on a cupboard door, which is how a lot of people will
 * actually use this.
 */

type Props = { schedule: Schedule; constraints: Constraints };

export const RunSheet = ({ schedule, constraints }: Props) => {
  const cookName = new Map(constraints.cooks.map((c) => [c.id, c.name]));
  const overnight = new Set(schedule.overnight);

  const rows = schedule.scheduled
    .filter((s) => !overnight.has(s.taskId))
    .filter((s) => schedule.tasks[s.taskId]?.phase !== 'hold')
    .sort((a, b) => a.startMin - b.startMin || (a.taskId < b.taskId ? -1 : 1));

  return (
    <ol className="rounded-md bg-cream-deep p-2">
      {rows.map((s) => {
        const task = schedule.tasks[s.taskId];
        if (!task) return null;
        const wash = treatmentOf(task) === 'wash';
        return (
          <li
            key={s.taskId}
            className="flex items-baseline gap-3 border-b border-line px-2 py-2 last:border-b-0"
          >
            <span className="voice-compiler w-14 flex-none text-xs text-ink-soft">
              {s.startMin}–{s.endMin}
            </span>
            <span className="w-20 flex-none truncate text-xs font-bold text-charcoal">
              {s.cookId ? cookName.get(s.cookId) : 'Unattended'}
            </span>
            <span className={`flex-1 text-sm ${wash ? 'text-ink-soft' : 'text-charcoal'}`}>
              {task.name}
              {s.isCritical ? (
                <span className="ml-2 rounded-xs bg-tomato-wash px-2 text-xs font-bold text-tomato-ink">
                  don't slip
                </span>
              ) : null}
            </span>
            <span className="voice-compiler flex-none text-xs text-ink-faint">
              {humanMinutes(task.durationMin)}
            </span>
          </li>
        );
      })}
    </ol>
  );
};
