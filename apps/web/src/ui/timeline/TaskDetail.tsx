import type { Constraints, Schedule, Task } from '@kitchen/domain';
import { Sheet } from '../primitives';
import { dishHue } from '../theme';
import { humanMinutes, treatmentOf } from './model';

/**
 * One task, opened.
 *
 * Everything shown here is something the compiler already decided and can defend: when it
 * runs, who has it, what it holds, and whether moving it moves the finish. Nothing is
 * generated prose. If a field would need a model to fill it in, it is not in this panel.
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

  return (
    <Sheet title={task.name} onClose={onClose}>
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-3 w-3 flex-none rounded-full"
          style={{ background: dishHue(task.dishId, hueIndex) }}
        />
        <span className="text-sm font-bold">{dish ?? 'This session'}</span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <Fact label="When">
          {scheduled ? `minute ${scheduled.startMin} to ${scheduled.endMin}` : 'not placed'}
        </Fact>
        <Fact label="Takes">{humanMinutes(task.durationMin)}</Fact>
        <Fact label="Who">
          {treatment === 'hold' ? 'Nobody — it looks after itself' : (cook?.name ?? 'Anyone free')}
        </Fact>
        <Fact label="Slack">
          {scheduled?.isCritical
            ? 'None. This one sets the finish time.'
            : `${scheduled?.slackMin ?? 0} min before it matters`}
        </Fact>
      </dl>

      {task.equipment.length > 0 ? (
        <p className="mt-4 text-sm text-ink-soft">
          Uses {task.equipment.map((e) => e.kind.replace('-', ' ')).join(', ')}
          {task.equipment.some((e) => e.heldThroughHold) && treatment !== 'hold'
            ? ' — and keeps it through the wait that follows.'
            : '.'}
        </p>
      ) : null}

      {task.ingredients.length > 0 ? (
        <p className="mt-2 text-sm text-ink-soft">With {task.ingredients.join(', ')}.</p>
      ) : null}

      {reasons.length > 0 ? (
        <div className="mt-4 rounded-sm bg-cream-deep p-3">
          <h3 className="text-xs font-bold uppercase tracking-wide text-ink-faint">
            Why it sits here
          </h3>
          <ul className="mt-2 space-y-2 text-sm">
            {reasons.map((r, i) => (
              <li key={`${r.type}-${i}`}>{r.explanation}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Sheet>
  );
};

const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <dt className="text-xs uppercase tracking-wide text-ink-faint">{label}</dt>
    <dd className="mt-1 font-semibold text-charcoal">{children}</dd>
  </div>
);
