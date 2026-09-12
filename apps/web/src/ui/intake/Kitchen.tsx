import { useState, type CSSProperties } from 'react';
import { OFFERED_EQUIPMENT, useSession } from '@/app/store';
import { EQUIPMENT_GLYPH, Glyph, Motif, cookGlyph } from '../primitives';
import type { EquipmentKind } from '@kitchen/domain';

/**
 * The kitchen and the crew, stated rather than asked.
 *
 * Every one of these has a defensible default, so none of them is a question standing
 * between someone and a compiled session. They start filled in and marked as assumed, and
 * the section stays shut until someone disagrees. The alternative — an interview before the
 * first result — is how a tool that could have taken thirty seconds takes five minutes.
 *
 * Drawn as a pegboard. What the kitchen has hangs on it as a paper cut-out on a peg; what
 * it does not have is the painted outline a pegboard keeps where a tool should be, which
 * is exactly the right picture for "the recipe needs one of these and you have not got it".
 */

const TIME = [30, 45, 60, 90];
const COOKS = [1, 2, 3, 4];
const SERVINGS = [2, 4, 6, 8];

/** Pegboard holes: a mask, so the colour stays a token and the SVG carries none. */
const HOLES: CSSProperties = {
  WebkitMaskImage:
    'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2728%27 height=%2728%27%3E%3Ccircle cx=%2714%27 cy=%2714%27 r=%272.6%27/%3E%3C/svg%3E")',
  maskImage:
    'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2728%27 height=%2728%27%3E%3Ccircle cx=%2714%27 cy=%2714%27 r=%272.6%27/%3E%3C/svg%3E")',
  WebkitMaskSize: '28px 28px',
  maskSize: '28px 28px',
};

/** Paper for the glyph plate on each hung tool, cycled so the board reads as a collage. */
const PLATES = [
  'bg-marigold text-plum-900',
  'bg-enamel text-plum-900',
  'bg-garden-100 text-garden-700',
  'bg-cornflower-100 text-cornflower-700',
  'bg-paprika-100 text-paprika-700',
];
const TILT = ['-rotate-2', 'rotate-1', '-rotate-1', 'rotate-2', 'rotate-0'];

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
    <section
      className="relative isolate rounded-nick-lg bg-plum-100"
      aria-label="The kitchen and the crew"
    >
      <span aria-hidden="true" className="absolute inset-0 -z-10 rounded-[inherit] bg-mk-plum opacity-[0.16]" style={HOLES} />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="group relative flex min-h-touch w-full items-start justify-between gap-4 p-5 text-left"
      >
        <span className="min-w-0">
          <span className="block text-md font-bold text-ink [font-variation-settings:var(--mk-sharp)]">
            The kitchen and the crew
          </span>
          <span className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2 text-ink">
            <Figure value={intake.timeBudgetMin.value} unit="minutes" />
            <Figure value={intake.servings.value} unit="servings" />
            <Figure value={intake.cookCount.value} unit="cooking" />
            <Figure value={have.size} unit="things in the kitchen" />
          </span>
          {assumptions > 0 ? (
            <span className="mt-3 inline-flex rounded-nick-xs border-2 border-dashed border-edge px-2 text-xs italic text-muted">
              {assumptions} of these still assumed
            </span>
          ) : null}
        </span>
        <span
          aria-hidden="true"
          className="grid h-[48px] w-[48px] flex-none place-items-center rounded-nick-md bg-surface text-ink
            transition-transform duration-base ease-stamp group-hover:-rotate-6"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square">
            {open ? <path d="M5 12h14" /> : <path d="M12 5v14M5 12h14" />}
          </svg>
        </span>
      </button>

      {open ? (
        <div className="flex flex-col gap-6 px-5 pb-6">
          <Row label="How long have you got?" answer={intake.timeBudgetMin}>
            {TIME.map((n) => (
              <Pick
                key={n}
                on={intake.timeBudgetMin.value === n}
                onClick={() => answer('timeBudgetMin', n)}
              >
                <span className="voice-display text-xl leading-none">{n}</span>
                <span className="text-xs font-bold">m</span>
              </Pick>
            ))}
          </Row>

          <Row label="How many is each dish for?" answer={intake.servings}>
            {SERVINGS.map((n) => (
              <Pick key={n} on={intake.servings.value === n} onClick={() => answer('servings', n)}>
                <span className="voice-display text-xl leading-none">{n}</span>
              </Pick>
            ))}
          </Row>

          <div className="flex flex-col gap-2">
            <Row label="Who is cooking?" answer={intake.cookCount}>
              {COOKS.map((n) => (
                <Pick
                  key={n}
                  on={intake.cookCount.value === n}
                  onClick={() => answer('cookCount', n)}
                  className="flex-col py-1 sm:flex-row sm:py-0"
                >
                  <span className="voice-display text-xl leading-none">{n}</span>
                  <span aria-hidden="true" className="flex -space-x-2">
                    {Array.from({ length: n }, (_, i) => (
                      <Glyph key={i} name={cookGlyph(i)} size={16} strokeWidth={2} />
                    ))}
                  </span>
                </Pick>
              ))}
            </Row>
            <p className="max-w-measure text-xs text-muted">
              The first person is assumed to know their way around a stove and everyone else is
              assumed to be helping — washing, chopping, portioning. That is the cautious guess:
              handing a helper the wok is how a session falls apart in the kitchen.
            </p>
          </div>

          <Row label="Drinks as well?" answer={intake.wantsBeverages}>
            <Pick on={intake.wantsBeverages.value} onClick={() => answer('wantsBeverages', true)}>
              yes
            </Pick>
            <Pick on={!intake.wantsBeverages.value} onClick={() => answer('wantsBeverages', false)}>
              no
            </Pick>
          </Row>

          <fieldset className="relative m-0 min-w-0 border-0 p-0">
            <legend className="p-0 text-sm font-bold text-ink [font-variation-settings:var(--mk-sharp)]">
              What is in the kitchen?
              {intake.equipment.source === 'assumed' ? <Assumed /> : null}
            </legend>
            <p className="mb-4 mt-1 max-w-measure text-xs text-muted">
              A recipe that needs something you do not have is never offered, so this is worth
              a glance. Turning the blender on is usually worth a drink.
            </p>
            <Motif
              name="spark"
              className="pointer-events-none absolute -top-2 right-0 w-[32px] rotate-12"
              m1="var(--mk-cornflower)"
            />
            <div className="flex flex-wrap gap-x-3 gap-y-4">
              {OFFERED_EQUIPMENT.map((e, i) => {
                const on = have.has(e.kind);
                return (
                  <button
                    key={e.kind}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() => toggleEquipment(e.kind)}
                    className={`relative inline-flex min-h-touch items-center gap-2 rounded-nick-md py-1 pl-1 pr-3 text-sm
                      transition-transform duration-base ease-stamp active:translate-y-px
                      [font-variation-settings:var(--mk-sharp)]
                      ${on
                        ? `bg-surface font-semibold text-ink hover:rotate-0 ${TILT[i % TILT.length]}`
                        : 'border-2 border-dashed border-edge bg-transparent text-muted hover:-rotate-1'}`}
                  >
                    {on ? (
                      <span
                        aria-hidden="true"
                        className="absolute -top-[5px] left-1/2 h-[10px] w-[10px] -translate-x-1/2 rounded-full bg-plum-900"
                      />
                    ) : null}
                    <span
                      aria-hidden="true"
                      className={`grid h-[38px] w-[38px] flex-none place-items-center rounded-nick-sm
                        ${on ? PLATES[i % PLATES.length] : 'text-muted'}`}
                    >
                      <Glyph name={EQUIPMENT_GLYPH[e.kind as EquipmentKind]} size={24} />
                    </span>
                    {e.label}
                    <svg
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="square"
                      aria-hidden="true"
                      className={on ? 'text-success' : 'text-muted'}
                    >
                      {on ? <polyline points="4.5,12.5 9.5,17.5 19.5,6.5" /> : <path d="M12 5v14M5 12h14" />}
                    </svg>
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

/** One of the summary numbers on the shut board. Big numbers are display type. */
const Figure = ({ value, unit }: { value: number; unit: string }) => (
  <span className="inline-flex items-baseline gap-1">
    <span className="voice-display text-xl leading-none">{value}</span>
    <span className="text-xs font-semibold text-muted">{unit}</span>
  </span>
);

const Assumed = () => (
  <span className="ml-2 inline-block -rotate-2 rounded-nick-xs border-2 border-dashed border-edge px-2 align-middle text-xs font-normal italic text-muted">
    assumed
  </span>
);

const Row = ({
  label,
  answer,
  children,
}: {
  label: string;
  answer: { source: 'stated' | 'assumed' };
  children: React.ReactNode;
}) => (
  <fieldset className="m-0 min-w-0 border-0 p-0">
    <legend className="mb-2 p-0 text-sm font-bold text-ink [font-variation-settings:var(--mk-sharp)]">
      {label}
      {answer.source === 'assumed' ? <Assumed /> : null}
    </legend>
    <div className="grid grid-flow-col gap-1 rounded-nick-md bg-surface p-1 [grid-auto-columns:minmax(0,1fr)] sm:inline-grid">
      {children}
    </div>
  </fieldset>
);

const Pick = ({
  on,
  onClick,
  children,
  className = '',
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={on}
    className={`inline-flex min-h-touch min-w-[56px] items-center justify-center gap-1 rounded-nick-sm px-2 text-sm font-bold sm:px-3 ${className}
      transition-[background-color,transform] duration-fast ease-stamp active:translate-y-px
      [font-variation-settings:var(--mk-sharp)]
      ${on
        ? 'bg-selected text-on-selected motion-safe:animate-[mk-stamp_var(--d-base)_var(--mk-ease-stamp)_both] [--stamp-from:-6deg]'
        : 'bg-transparent text-muted hover:bg-sunken hover:text-ink'}`}
  >
    {children}
  </button>
);
