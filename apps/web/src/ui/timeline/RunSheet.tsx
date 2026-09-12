import type { Constraints, Schedule } from '@kitchen/domain';
import { Glyph, cookGlyph } from '../primitives';
import { Icon } from './Icon';
import { humanMinutes, treatmentOf } from './model';

/**
 * The same schedule, as a list you can follow.
 *
 * The chart answers "does this fit"; the run sheet answers "what do I do now". Both come
 * from the same compiled schedule, so they cannot disagree — and the sheet is the one that
 * survives being printed and stuck on a cupboard door, which is how a lot of people will
 * actually use this.
 *
 * So it is drawn as that sheet: torn off the pad top and bottom, taped up, a box per line
 * to tick with a thumb instead of a pen. The ticks are this screen's own memory, never the
 * schedule's — ticking a line does not tell the compiler anything.
 */

type Props = {
  schedule: Schedule;
  constraints: Constraints;
  /** Task ids already ticked off. Held by the screen so switching tabs does not lose them. */
  ticked?: ReadonlySet<string>;
  onTick?: (taskId: string) => void;
};

export const RunSheet = ({ schedule, constraints, ticked, onTick }: Props) => {
  const cooks = new Map(constraints.cooks.map((c, i) => [c.id, { name: c.name, index: i }]));
  const overnight = new Set(schedule.overnight);

  const rows = schedule.scheduled
    .filter((s) => !overnight.has(s.taskId))
    .filter((s) => schedule.tasks[s.taskId]?.phase !== 'hold')
    .sort((a, b) => a.startMin - b.startMin || (a.taskId < b.taskId ? -1 : 1));

  const done = rows.filter((s) => ticked?.has(s.taskId)).length;

  return (
    <div className="relative mx-auto max-w-[56rem] pt-3">
      {/* A strip of tape holding the sheet up. */}
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-0 z-10 block h-6 w-[7.5rem] -translate-x-1/2 -rotate-3 bg-enamel [clip-path:var(--mk-cut-tag)]"
      />
      <span aria-hidden="true" className="block h-4 bg-surface [clip-path:var(--mk-cut-edge-top)]" />

      <div className="bg-surface px-4 pb-4 pt-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b-2 border-rule pb-3">
          <p className="voice-display text-xl sm:text-2xl">{`${rows.length} steps`}</p>
          <p className="text-sm text-muted" aria-live="polite">
            {done > 0 ? `${done} of ${rows.length} ticked off` : 'Tick each one off as it is done'}
          </p>
        </div>

        <ol className="divide-y-2 divide-dashed divide-rule">
          {rows.map((s) => {
            const task = schedule.tasks[s.taskId];
            if (!task) return null;
            const wash = treatmentOf(task) === 'wash';
            const cook = s.cookId ? cooks.get(s.cookId) : undefined;
            const isTicked = ticked?.has(s.taskId) ?? false;
            return (
              <li key={s.taskId}>
                <label
                  className="relative grid min-h-touch cursor-pointer grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-3
                    sm:grid-cols-[auto_5.25rem_7.5rem_minmax(0,1fr)_auto]"
                >
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={isTicked}
                    onChange={() => onTick?.(s.taskId)}
                  />
                  <span
                    aria-hidden="true"
                    className="col-start-1 row-span-2 row-start-1 grid h-[1.75rem] w-[1.75rem] place-items-center self-start rounded-nick-xs border-2 border-edge text-transparent
                      transition-transform duration-base ease-stamp
                      peer-checked:-rotate-6 peer-checked:border-success peer-checked:bg-success peer-checked:text-paper
                      peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[color:var(--mk-focus)]
                      sm:row-span-1 sm:self-center"
                  >
                    <Icon name="check" className="h-5 w-5 [stroke-width:3]" />
                  </span>

                  <span
                    className={`voice-compiler col-start-2 row-start-1 w-fit rounded-nick-xs px-2 py-1 text-sm font-bold
                      ${s.isCritical ? 'bg-plum-100 text-mk-plum' : 'bg-sunken text-ink'}`}
                  >
                    {s.startMin}–{s.endMin}
                  </span>

                  <span className="col-start-3 row-start-1 flex min-w-0 items-center gap-1 text-sm font-bold text-ink [font-variation-settings:var(--mk-sharp)]">
                    {cook ? (
                      <span aria-hidden="true" className="flex-none text-muted">
                        <Glyph name={cookGlyph(cook.index)} size={20} strokeWidth={1.8} />
                      </span>
                    ) : null}
                    <span className="truncate">{cook ? cook.name : 'Unattended'}</span>
                  </span>

                  <span
                    className={`col-span-3 col-start-2 row-start-2 text-md leading-snug transition-colors duration-fast
                      peer-checked:text-muted peer-checked:line-through
                      sm:col-span-1 sm:col-start-4 sm:row-start-1
                      ${wash ? 'text-muted' : 'text-ink'}`}
                  >
                    {task.name}
                    {s.isCritical ? (
                      <span className="ml-2 inline-flex translate-y-[-1px] items-center gap-1 rounded-nick-xs bg-plum-100 px-2 align-middle text-xs font-bold text-mk-plum">
                        <Icon name="clock" className="h-4 w-4" />
                        don't slip
                      </span>
                    ) : null}
                  </span>

                  <span className="voice-compiler col-start-4 row-start-1 text-right text-xs text-muted sm:col-start-5">
                    {humanMinutes(task.durationMin)}
                  </span>
                </label>
              </li>
            );
          })}
        </ol>
      </div>

      <span aria-hidden="true" className="block h-4 bg-surface [clip-path:var(--mk-cut-edge-bottom)]" />
    </div>
  );
};
