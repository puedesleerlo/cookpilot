import { useSession } from '@/app/store';

/**
 * The four things people change their mind about.
 *
 * Deliberately not a settings screen. Recompiling takes a few milliseconds, so these are
 * live controls sitting next to the result they change — pull the hour down to forty
 * minutes and the chart redraws with whatever had to give. That loop *is* the product; a
 * form behind a "recompile" button would hide the only thing worth showing.
 */

const TIME = [30, 45, 60, 90];
const COOKS = [1, 2, 3];
const SERVINGS = [2, 4, 6];

export const Controls = () => {
  const intake = useSession((s) => s.intake);
  const adjust = useSession((s) => s.adjust);

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-md bg-cream-deep p-4">
      <Group label="Time you have">
        {TIME.map((n) => (
          <Pick key={n} on={intake.timeBudgetMin.value === n} onClick={() => adjust('timeBudgetMin', n)}>
            {n}m
          </Pick>
        ))}
      </Group>

      <Group label="People cooking">
        {COOKS.map((n) => (
          <Pick key={n} on={intake.cookCount.value === n} onClick={() => adjust('cookCount', n)}>
            {n}
          </Pick>
        ))}
      </Group>

      <Group label="Servings each">
        {SERVINGS.map((n) => (
          <Pick key={n} on={intake.servings.value === n} onClick={() => adjust('servings', n)}>
            {n}
          </Pick>
        ))}
      </Group>

      <Group label="Drinks">
        <Pick on={intake.wantsBeverages.value} onClick={() => adjust('wantsBeverages', true)}>
          yes
        </Pick>
        <Pick on={!intake.wantsBeverages.value} onClick={() => adjust('wantsBeverages', false)}>
          no
        </Pick>
      </Group>
    </div>
  );
};

const Group = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <fieldset className="border-0 p-0">
    <legend className="mb-1 p-0 text-xs text-ink-soft">{label}</legend>
    <div className="flex gap-1">{children}</div>
  </fieldset>
);

const Pick = ({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={on}
    className={`min-h-[44px] min-w-[44px] rounded-xs border-[1.5px] px-3 text-sm font-bold
      transition-colors duration-fast
      ${on ? 'border-tomato-deep bg-cream text-tomato-ink shadow-1' : 'border-line bg-cream/50 text-ink-soft hover:border-line-strong hover:text-charcoal'}`}
  >
    {children}
  </button>
);
