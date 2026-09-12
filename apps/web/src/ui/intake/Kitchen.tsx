import { useState } from 'react';
import { OFFERED_EQUIPMENT, useSession } from '@/app/store';
import { EQUIPMENT_GLYPH, Glyph } from '../primitives';
import type { EquipmentKind } from '@kitchen/domain';

/**
 * The kitchen and the crew, stated rather than asked.
 *
 * Every one of these has a defensible default, so none of them is a question standing
 * between someone and a compiled session. They start filled in and marked as assumed, and
 * the section stays shut until someone disagrees. The alternative — an interview before the
 * first result — is how a tool that could have taken thirty seconds takes five minutes.
 */

const TIME = [30, 45, 60, 90];
const COOKS = [1, 2, 3, 4];
const SERVINGS = [2, 4, 6, 8];

export const Kitchen = () => {
  const [open, setOpen] = useState(false);
  const intake = useSession((s) => s.intake);
  const answer = useSession((s) => s.answer);
  const toggleEquipment = useSession((s) => s.toggleEquipment);

  const have = new Set(intake.equipment.value.map((e) => e.kind));
  const assumptions = [
    intake.timeBudgetMin,
    intake.servings,
    intake.cookCount,
    intake.equipment,
  ].filter((a) => a.source === 'assumed').length;

  return (
    <section className="rounded-md bg-cream-deep p-4" aria-label="The kitchen and the crew">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 text-left"
      >
        <span>
          <span className="text-sm font-bold text-charcoal">The kitchen and the crew</span>
          <span className="block text-xs text-ink-soft">
            {intake.timeBudgetMin.value} minutes · {intake.servings.value} servings ·{' '}
            {intake.cookCount.value} cooking · {have.size} things in the kitchen
            {assumptions > 0 ? ` · ${assumptions} of these still assumed` : ''}
          </span>
        </span>
        <span aria-hidden="true" className="text-md text-ink-soft">
          {open ? '−' : '+'}
        </span>
      </button>

      {open ? (
        <div className="mt-4 flex flex-col gap-4">
          <Row label="How long have you got?" answer={intake.timeBudgetMin}>
            {TIME.map((n) => (
              <Pick
                key={n}
                on={intake.timeBudgetMin.value === n}
                onClick={() => answer('timeBudgetMin', n)}
              >
                {n}m
              </Pick>
            ))}
          </Row>

          <Row label="How many is each dish for?" answer={intake.servings}>
            {SERVINGS.map((n) => (
              <Pick key={n} on={intake.servings.value === n} onClick={() => answer('servings', n)}>
                {n}
              </Pick>
            ))}
          </Row>

          <Row label="Who is cooking?" answer={intake.cookCount}>
            {COOKS.map((n) => (
              <Pick
                key={n}
                on={intake.cookCount.value === n}
                onClick={() => answer('cookCount', n)}
              >
                {n}
              </Pick>
            ))}
          </Row>
          <p className="-mt-2 max-w-measure text-xs text-ink-soft">
            The first person is assumed to know their way around a stove and everyone else is
            assumed to be helping — washing, chopping, portioning. That is the cautious guess:
            handing a helper the wok is how a session falls apart in the kitchen.
          </p>

          <Row label="Drinks as well?" answer={intake.wantsBeverages}>
            <Pick on={intake.wantsBeverages.value} onClick={() => answer('wantsBeverages', true)}>
              yes
            </Pick>
            <Pick on={!intake.wantsBeverages.value} onClick={() => answer('wantsBeverages', false)}>
              no
            </Pick>
          </Row>

          <fieldset className="border-0 p-0">
            <legend className="p-0 text-xs font-bold text-ink-soft">
              What is in the kitchen?
              {intake.equipment.source === 'assumed' ? (
                <span className="ml-2 font-normal italic">assumed</span>
              ) : null}
            </legend>
            <p className="mb-2 max-w-measure text-xs text-ink-soft">
              A recipe that needs something you do not have is never offered, so this is worth
              a glance. Turning the blender on is usually worth a drink.
            </p>
            <div className="flex flex-wrap gap-2">
              {OFFERED_EQUIPMENT.map((e) => {
                const on = have.has(e.kind);
                return (
                  <button
                    key={e.kind}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() => toggleEquipment(e.kind)}
                    className={`inline-flex min-h-[44px] items-center gap-2 rounded-chip border-[1.5px] px-3 text-sm
                      ${on
                        ? 'border-sage-deep bg-cream font-semibold text-charcoal shadow-1'
                        : 'border-line bg-cream/40 text-ink-faint'}`}
                  >
                    <span className={on ? 'text-sage-ink' : 'text-ink-faint'}>
                      <Glyph name={EQUIPMENT_GLYPH[e.kind as EquipmentKind]} size={20} />
                    </span>
                    {e.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>
      ) : null}
    </section>
  );
};

const Row = ({
  label,
  answer,
  children,
}: {
  label: string;
  answer: { source: 'stated' | 'assumed' };
  children: React.ReactNode;
}) => (
  <fieldset className="border-0 p-0">
    <legend className="mb-1 p-0 text-xs font-bold text-ink-soft">
      {label}
      {answer.source === 'assumed' ? (
        <span className="ml-2 font-normal italic">assumed</span>
      ) : null}
    </legend>
    <div className="flex flex-wrap gap-1">{children}</div>
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
      ${on
        ? 'border-tomato-deep bg-cream text-tomato-ink shadow-1'
        : 'border-line bg-cream/50 text-ink-soft hover:border-line-strong hover:text-charcoal'}`}
  >
    {children}
  </button>
);
