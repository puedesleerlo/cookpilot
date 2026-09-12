import type { Constraints, Schedule, Task } from '@kitchen/domain';
import { EQUIPMENT_GLYPH, Glyph, Sheet } from '../primitives';
import { dishHue, dishWash } from '../theme';
import { Icon, type IconName } from './Icon';
import { humanMinutes, treatmentOf } from './model';

/**
 * One task, opened.
 *
 * Everything shown here is something the compiler already decided and can defend: when it
 * runs, who has it, what it holds, and whether moving it moves the finish. Nothing is
 * generated prose. If a field would need a model to fill it in, it is not in this panel.
 *
 * Laid out as scraps of paper on the sheet: the dish tag this block belongs to (its stub
 * the same tint as the block), four facts on bright cards, the tools as tags with their
 * drawings, and the scheduler's reasons on a butter-yellow note.
 */

type Props = {
  schedule: Schedule;
  constraints: Constraints;
  task: Task;
  hueIndex?: number;
  onClose: () => void;
};

export const TaskDetail = ({ schedule, constraints, task, hueIndex, onClose }: Props) => {
  const scheduled = schedule.scheduled.find((s) => s.taskId === task.id);
  const cook = constraints.cooks.find((c) => c.id === scheduled?.cookId);
  const dish = schedule.dishNames[task.dishId];
  const treatment = treatmentOf(task);
  const reasons = schedule.rationale.filter((r) => r.taskIds.includes(task.id));

  const mark: { icon: IconName; word: string } | null = scheduled?.isCritical
    ? { icon: 'clock', word: 'sets the finish time' }
    : treatment === 'hold'
      ? { icon: 'timer', word: 'looks after itself' }
      : treatment === 'wash'
        ? { icon: 'drop', word: 'washing in between' }
        : null;

  return (
    <Sheet title={task.name} onClose={onClose}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex min-h-[2.5rem] items-stretch overflow-hidden rounded-nick-sm bg-surface">
          <span
            aria-hidden="true"
            className="relative w-[2.25rem] flex-none"
            style={{ background: dishWash(task.dishId, hueIndex) }}
          >
            <span
              className="absolute left-1/2 top-1/2 block h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-bg"
              style={{ borderColor: dishHue(task.dishId, hueIndex) }}
            />
          </span>
          <span className="flex items-center px-3 text-sm font-bold [font-variation-settings:var(--mk-sharp)]">
            {dish ?? 'This session'}
          </span>
        </span>
        {mark ? (
          <span
            className={`inline-flex min-h-[2.5rem] items-center gap-1 rounded-nick-sm px-3 text-sm font-bold
              ${scheduled?.isCritical ? 'bg-plum-100 text-mk-plum' : 'bg-sunken text-ink'}`}
          >
            <Icon name={mark.icon} className="h-5 w-5" />
            {mark.word}
          </span>
        ) : null}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <Fact label="When">
          {scheduled ? `minute ${scheduled.startMin} to ${scheduled.endMin}` : 'not placed'}
        </Fact>
        <Fact label="Takes">{humanMinutes(task.durationMin)}</Fact>
        <Fact label="Who">
          {treatment === 'hold' ? 'Nobody — it looks after itself' : (cook?.name ?? 'Anyone free')}
        </Fact>
        <Fact label="Slack" tone={scheduled?.isCritical ? 'bg-plum-100' : undefined}>
          {scheduled?.isCritical
            ? 'None. This one sets the finish time.'
            : `${scheduled?.slackMin ?? 0} min before it matters`}
        </Fact>
      </dl>

      {task.equipment.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted">Uses</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {task.equipment.map((e, i) => (
              <li
                key={`${e.kind}-${i}`}
                className="mk-tag min-h-[2.5rem] gap-2 px-3 [--tag-bg:var(--mk-surface)]"
              >
                <span aria-hidden="true" className="text-muted">
                  <Glyph name={EQUIPMENT_GLYPH[e.kind]} size={22} strokeWidth={1.8} />
                </span>
                {e.kind.replace('-', ' ')}
              </li>
            ))}
          </ul>
          {task.equipment.some((e) => e.heldThroughHold) && treatment !== 'hold' ? (
            <p className="mt-2 text-sm text-muted">And keeps it through the wait that follows.</p>
          ) : null}
        </div>
      ) : null}

      {task.ingredients.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-xs font-bold uppercase tracking-wide text-muted">With</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {task.ingredients.map((name, i) => (
              <li key={`${name}-${i}`} className="mk-tag [--tag-bg:var(--mk-paper-bright)]">
                {name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {reasons.length > 0 ? (
        <div className="mt-5 rounded-nick-md bg-marigold-100 px-4 pb-4 pt-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-warning">Why it sits here</h3>
          <ul className="mt-2 space-y-2 text-sm text-ink">
            {reasons.map((r, i) => (
              <li key={`${r.type}-${i}`}>{r.explanation}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Sheet>
  );
};

const Fact = ({ label, tone = 'bg-surface', children }: { label: string; tone?: string; children: React.ReactNode }) => (
  <div className={`rounded-nick-md px-3 pb-3 pt-2 ${tone}`}>
    <dt className="text-xs font-bold uppercase tracking-wide text-muted">{label}</dt>
    <dd className="mt-1 text-md font-semibold leading-snug text-ink">{children}</dd>
  </div>
);
