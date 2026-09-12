import { useSession } from '@/app/store';

/**
 * The four things people change their mind about.
 *
 * Deliberately not a settings screen. Recompiling takes a few milliseconds, so these are
 * live controls sitting next to the result they change — pull the hour down to forty
 * minutes and the chart redraws with whatever had to give. That loop *is* the product; a
 * form behind a "recompile" button would hide the only thing worth showing.
 *
 * Drawn as a board of paper dials: each question wears its own cut tag, the answers sit in
 * a bright well, and the one you picked is plum and knocked a few degrees off true, the way
 * a pressed stamp lands.
 */

const TIME = [30, 45, 60, 90];
const COOKS = [1, 2, 3];
const SERVINGS = [2, 4, 6];

export const Controls = () => {
  const intake = useSession((s) => s.intake);
  const adjust = useSession((s) => s.adjust);

  return (
    <div className="relative rounded-nick-lg bg-sunken px-4 pb-6 pt-5 sm:px-6">
      <div className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="voice-display text-xl sm:text-2xl">Change your mind</h2>
        <p className="text-sm text-muted">Tap an answer and the plan below redraws.</p>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-5">
        <Group label="Time you have" tag="bg-marigold -rotate-2">
          {TIME.map((n) => (
            <Pick key={n} on={intake.timeBudgetMin.value === n} onClick={() => adjust('timeBudgetMin', n)}>
              {n}m
            </Pick>
          ))}
        </Group>

        <Group label="People cooking" tag="bg-enamel rotate-1">
          {COOKS.map((n) => (
            <Pick key={n} on={intake.cookCount.value === n} onClick={() => adjust('cookCount', n)}>
              {n}
            </Pick>
          ))}
        </Group>

        <Group label="Servings each" tag="bg-garden-100 -rotate-1">
          {SERVINGS.map((n) => (
            <Pick key={n} on={intake.servings.value === n} onClick={() => adjust('servings', n)}>
              {n}
            </Pick>
          ))}
        </Group>

        <Group label="Drinks" tag="bg-cornflower-100 rotate-2">
          <Pick on={intake.wantsBeverages.value} onClick={() => adjust('wantsBeverages', true)}>
            yes
          </Pick>
          <Pick on={!intake.wantsBeverages.value} onClick={() => adjust('wantsBeverages', false)}>
            no
          </Pick>
        </Group>
      </div>
    </div>
  );
};

const Group = ({ label, tag, children }: { label: string; tag: string; children: React.ReactNode }) => (
  <fieldset className="m-0 min-w-0 border-0 p-0">
    <legend className="mb-2 p-0">
      {/* The legend is not focusable, so it can wear a scissor cut. */}
      <span
        className={`inline-block px-3 py-1 text-sm font-bold text-plum-900 [clip-path:var(--mk-cut-tag)] [font-variation-settings:var(--mk-sharp)] ${tag}`}
      >
        {label}
      </span>
    </legend>
    <div className="flex gap-1 rounded-nick-md bg-surface p-1">{children}</div>
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
    className={`min-h-touch min-w-touch rounded-nick-sm px-3 text-md font-bold [font-variation-settings:var(--mk-sharp)]
      transition-[transform,background-color,color] duration-base ease-stamp active:translate-y-px
      ${on ? '-rotate-3 bg-selected text-on-selected' : 'text-ink hover:-rotate-2 hover:bg-sunken'}`}
  >
    {children}
  </button>
);
