import type { CSSProperties } from 'react';
import emptyPantry from '@/assets/makitra/illustrations/empty-pantry.svg';
import { URGENCY_CYCLE, URGENCY_LABEL, useSession } from '@/app/store';
import { Button, Chip, Display, Glyph, INGREDIENT_GLYPH, Motif, Patch } from '../primitives';
import { IngredientSearch } from '../intake/IngredientSearch';
import { Kitchen } from '../intake/Kitchen';
import { DRAWING, drawingsFor, type DrawingName } from '../intake/drawings';

/**
 * Your own fridge.
 *
 * One screen, in the order the information matters. The food comes first because it is the
 * only thing the compiler cannot guess; everything else arrives pre-filled and marked as an
 * assumption. Nothing here blocks compiling except an empty fridge, which is the one case
 * where there is genuinely nothing to compile.
 *
 * What this screen does not ask for is quantities. The compiler matches on what you have,
 * not how much — a plan is not changed by whether there are four lemons or six — so a
 * quantity field would be seventeen more things to type in exchange for nothing. When
 * something starts consuming them, that is when to start asking.
 *
 * Laid out as a pantry table: what is in the fridge lies on it as paper cut-outs, the
 * common things wait as dashed coupons still to be cut out, the kitchen hangs on a
 * pegboard beside it, and compiling is the one paprika button on the page.
 */

/** Somewhere to start, for a fridge that is empty because the screen just opened. */
const STARTERS = [
  'chicken breast', 'eggs', 'jasmine rice', 'bok choy', 'spinach', 'tomatoes',
  'bell peppers', 'mushrooms', 'onions', 'garlic', 'lemons', 'potatoes',
];

/** Paper never lands square on a table. Deterministic, so a re-render does not shuffle it. */
const TILTS = [-2, 1.5, -1, 2.5, 0.5, -1.5, 1];
const tilt = (deg: number): CSSProperties => ({ rotate: `${deg}deg` });

const STAMP = 'motion-safe:animate-[mk-stamp_var(--d-slow)_var(--mk-ease-stamp)_both]';

/**
 * The fast way to fill a fridge.
 *
 * Tapping is quicker than typing for the dozen things most kitchens actually contain, and
 * the row stays on screen while the pantry is small rather than vanishing the moment the
 * first thing is added — which is the point at which someone still has six more to enter.
 *
 * Drawn as coupons with a dashed cut line: things not on the table yet.
 */
const Starters = ({
  taken,
  onAdd,
  className = '',
}: {
  taken: string[];
  onAdd: (name: string) => boolean;
  className?: string;
}) => {
  const held = new Set(taken);
  const left = STARTERS.filter((name) => !held.has(name));
  if (left.length === 0) return null;

  return (
    <div className={`mt-3 flex flex-wrap gap-2 ${className}`}>
      {left.map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => onAdd(name)}
          className="min-h-touch rounded-nick-sm border-2 border-dashed border-edge bg-transparent px-4 text-sm
            font-semibold text-ink transition-[transform,background-color] duration-fast ease-stamp
            [font-variation-settings:var(--mk-sharp)] hover:-rotate-2 hover:bg-surface active:translate-y-px"
        >
          + {name}
        </button>
      ))}
    </div>
  );
};

/** A few of Makitra's drawings spilling off the corner of the title. */
const HeaderArt = () => (
  <div
    aria-hidden="true"
    className="pointer-events-none relative col-start-2 row-start-1 h-[92px] w-[132px] self-center
      sm:h-[140px] sm:w-[200px] lg:row-span-3 lg:h-[250px] lg:w-[340px] lg:self-end"
  >
    <Patch tone="soup" cut="shard" className={`absolute inset-[4%_2%_14%_20%] ${STAMP}`} style={tilt(8)} />
    <Patch
      tone="dough"
      cut="plate"
      className={`absolute bottom-0 left-0 h-[52%] w-[44%] ${STAMP} [animation-delay:80ms]`}
      style={tilt(-12)}
    />
    <img src={DRAWING.garlic} alt="" className={`absolute left-[44%] top-[16%] w-[24%] ${STAMP} [animation-delay:140ms]`} style={tilt(10)} />
    <img src={DRAWING.tomato} alt="" className={`absolute bottom-[10%] left-[5%] w-[33%] ${STAMP} [animation-delay:200ms]`} style={tilt(-12)} />
    <img src={DRAWING.dill} alt="" className={`absolute right-[3%] top-[-4%] w-[16%] ${STAMP} [animation-delay:260ms]`} style={tilt(18)} />
    <img src={DRAWING.cabbage} alt="" className={`absolute bottom-[-2%] right-[10%] w-[30%] ${STAMP} [animation-delay:320ms]`} style={tilt(-6)} />
    <Motif name="poppy" className="absolute -left-[6%] top-[6%] w-[20%]" style={tilt(-18)} m1="var(--mk-plum-900)" />
  </div>
);

export const Intake = () => {
  const pantry = useSession((s) => s.intake.pantry);
  const addByName = useSession((s) => s.addByName);
  const dropIngredient = useSession((s) => s.dropIngredient);
  const cycleUrgency = useSession((s) => s.cycleUrgency);
  const findFromPantry = useSession((s) => s.findFromPantry);
  const finding = useSession((s) => s.finding);
  const reset = useSession((s) => s.reset);
  const outcome = useSession((s) => s.outcome);

  const urgent = pantry.filter((i) => i.urgency === 'use-today').length;
  const taken = pantry.map((i) => i.canonicalName);
  const failed = outcome && !outcome.ok ? outcome.reason : null;

  /* What is on the table gets drawn beside it; oil and pepper are in every kitchen anyway. */
  // The mushroom is paper-coloured and would vanish into the table.
  const drawn = drawingsFor(taken).filter((d) => d !== 'mushroom').slice(0, 4);
  const basics: DrawingName[] = ['sunflowerOil', 'pepperGrinder'];
  const onTable = drawn.length >= 2 ? drawn : [...drawn, ...basics].slice(0, 3);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1180px] flex-col gap-[40px] px-4 pb-[64px] pt-6 sm:px-8 lg:gap-[48px] lg:pt-[48px]">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-4 gap-y-3">
        <p
          className={`col-start-1 row-start-1 self-end justify-self-start bg-cornflower px-4 pb-1 pt-2 text-sm font-bold text-plum-900
            [clip-path:var(--mk-cut-tag)] [font-variation-settings:var(--mk-sharp)] ${STAMP}`}
          style={{ ...tilt(-4), '--stamp-from': '-16deg' } as CSSProperties}
        >
          Your own fridge
        </p>
        <HeaderArt />
        <Display as="h1" className="col-span-2 text-4xl leading-[0.95] sm:text-5xl lg:col-span-1">
          Tell me what you{' '}
          <span className="relative isolate inline-block">
            <span
              aria-hidden="true"
              className="absolute -inset-x-3 bottom-[-6%] top-[8%] -z-10 bg-marigold [clip-path:var(--mk-cut-patch)]"
              style={tilt(-2)}
            />
            have
          </span>
        </Display>
        <p className="col-span-2 max-w-[46ch] text-md text-muted lg:col-span-1">
          Six or seven things is plenty. Say which ones have to go first and the session gets
          built around them.
        </p>
      </header>

      <div className="grid items-start gap-[40px] lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <IngredientSearch onAdd={addByName} taken={taken} />

          <section aria-label="In the fridge">
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
              <h2 className="flex items-center gap-3 text-md font-bold [font-variation-settings:var(--mk-sharp)]">
                In the fridge
                {pantry.length > 0 ? (
                  <span className="relative isolate grid h-[52px] min-w-[52px] place-items-center px-2">
                    <span
                      aria-hidden="true"
                      className={`absolute inset-0 -z-10 bg-mk-plum [clip-path:var(--mk-cut-plate)] ${STAMP}`}
                      style={tilt(6)}
                    />
                    <span className="mk-visually-hidden"> · </span>
                    <span className="voice-display text-xl leading-none text-paper">{pantry.length}</span>
                  </span>
                ) : null}
              </h2>
              {pantry.length > 0 ? (
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  {urgent > 0 ? (
                    <span className="mk-tag [--tag-bg:var(--mk-paprika-600)] [--tag-fg:var(--mk-paper)]">
                      <svg viewBox="0 0 24 24" className="mk-icon" aria-hidden="true">
                        <polygon points="12,3 18.4,5.5 21,12 18.4,18.5 12,21 5.6,18.5 3,12 5.6,5.5" />
                        <polyline points="12,7.5 12,12 15.5,14.5" />
                      </svg>
                      {urgent} to use today
                    </span>
                  ) : null}
                  tap one to change when it has to go
                </p>
              ) : null}
            </div>

            <div className="relative mt-3 rounded-nick-lg bg-sunken px-4 pb-5 pt-5 sm:px-6">
              {pantry.length === 0 ? (
                <div className="mk-empty !gap-2 !px-0 !pb-1 !pt-0">
                  <img src={emptyPantry} alt="" className="mk-empty__art !w-[168px] sm:!w-[200px]" />
                  <Display as="div" className="mk-empty__title">
                    Nothing yet
                  </Display>
                  <p className="!max-w-none text-sm">Search above, or tap a few of these:</p>
                  <Starters taken={taken} onAdd={addByName} className="justify-center" />
                </div>
              ) : (
                <>
                  <ul className="flex flex-wrap gap-x-3 gap-y-4">
                    {pantry.map((i, n) => {
                      const today = i.urgency === 'use-today';
                      return (
                        <li key={i.id} className="relative isolate" style={tilt(TILTS[n % TILTS.length] ?? 0)}>
                          {today ? (
                            <span
                              aria-hidden="true"
                              className={`pointer-events-none absolute -right-3 -top-3 -z-10 h-[34px] w-[34px] bg-paprika
                                [clip-path:var(--mk-cut-burst)] ${STAMP}`}
                            />
                          ) : null}
                          <Chip
                            icon={INGREDIENT_GLYPH[i.category]}
                            label={i.name}
                            urgent={today}
                            unrecognised={i.unrecognised}
                            onClick={() => cycleUrgency(i.id)}
                            actionLabel={`${i.name}, ${URGENCY_LABEL[i.urgency]}. Change to ${
                              URGENCY_LABEL[URGENCY_CYCLE[i.urgency]]
                            }.`}
                            onRemove={() => dropIngredient(i.id)}
                            settle
                          >
                            {i.name}
                            {today ? null : (
                              <span className="text-xs text-muted">{URGENCY_LABEL[i.urgency]}</span>
                            )}
                          </Chip>
                        </li>
                      );
                    })}
                  </ul>
                  <div aria-hidden="true" className="-mb-[56px] mt-3 flex items-end justify-end gap-1 pr-2">
                    {onTable.map((d, n) => (
                      <img
                        key={d}
                        src={DRAWING[d]}
                        alt=""
                        className={`h-[52px] w-auto sm:h-[64px] ${STAMP}`}
                        style={tilt(TILTS[(n + 3) % TILTS.length]! * 4)}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>

          {pantry.length > 0 && pantry.length < 8 ? (
            <section aria-label="Common things" className="pt-[40px]">
              <h2 className="text-sm font-bold text-muted [font-variation-settings:var(--mk-sharp)]">
                Anything else in there?
              </h2>
              <Starters taken={taken} onAdd={addByName} />
            </section>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Kitchen />

          {failed ? (
            <p className="flex items-start gap-3 rounded-nick-md bg-warning-bg p-4 text-sm text-ink" role="status">
              <span aria-hidden="true" className="flex-none text-warning">
                <Glyph name="state-impossible" size={28} strokeWidth={2} />
              </span>
              <span>{failed}</span>
            </p>
          ) : null}

          <div className="relative isolate mt-2">
            <span
              aria-hidden="true"
              className="absolute -left-[14px] -top-[30px] bottom-[35%] right-[30%] -z-10 bg-paprika [clip-path:var(--mk-cut-shard)]"
              style={tilt(-8)}
            />
            <Motif
              name="cherry"
              className="pointer-events-none absolute -right-2 -top-[26px] w-[44px]"
              style={tilt(14)}
              m1="var(--mk-beet)"
              m2="var(--mk-garden)"
            />
            <div className="rounded-nick-lg bg-surface p-5 sm:p-6">
              <p className="flex items-end gap-3">
                <span className="voice-display text-4xl leading-[0.8]">{pantry.length}</span>
                <span className="pb-1 text-sm font-semibold text-muted [font-variation-settings:var(--mk-sharp)]">
                  {pantry.length === 1 ? 'thing' : 'things'} on the table
                  {urgent > 0 ? `, ${urgent} to use today` : ''}
                </span>
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => void findFromPantry()}
                  disabled={pantry.length === 0 || finding}
                  className="w-full sm:w-auto"
                >
                  {finding ? 'Finding recipes…' : 'Find me recipes'}
                </Button>
                <Button variant="quiet" onClick={reset}>
                  Start again
                </Button>
                {pantry.length === 0 ? (
                  <p className="text-xs text-muted">Add something to the fridge first.</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};
