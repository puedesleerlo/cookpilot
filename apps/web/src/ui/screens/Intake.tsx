import { URGENCY_CYCLE, URGENCY_LABEL, useSession } from '@/app/store';
import { Button, Chip, Glyph, INGREDIENT_GLYPH } from '../primitives';
import { IngredientSearch } from '../intake/IngredientSearch';
import { Kitchen } from '../intake/Kitchen';

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
 */

/** Somewhere to start, for a fridge that is empty because the screen just opened. */
const STARTERS = [
  'chicken breast', 'eggs', 'jasmine rice', 'bok choy', 'spinach', 'tomatoes',
  'bell peppers', 'mushrooms', 'onions', 'garlic', 'lemons', 'potatoes',
];

/**
 * The fast way to fill a fridge.
 *
 * Tapping is quicker than typing for the dozen things most kitchens actually contain, and
 * the row stays on screen while the pantry is small rather than vanishing the moment the
 * first thing is added — which is the point at which someone still has six more to enter.
 */
const Starters = ({ taken, onAdd }: { taken: string[]; onAdd: (name: string) => boolean }) => {
  const held = new Set(taken);
  const left = STARTERS.filter((name) => !held.has(name));
  if (left.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {left.map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => onAdd(name)}
          className="min-h-[44px] rounded-chip border-[1.5px] border-dashed border-line-strong
            bg-cream px-4 text-sm font-semibold text-ink-soft hover:border-line-strong hover:text-charcoal"
        >
          + {name}
        </button>
      ))}
    </div>
  );
};

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

  return (
    <main className="mx-auto flex min-h-dvh max-w-[760px] flex-col gap-5 px-5 py-7">
      <header>
        <h1 className="voice-display text-3xl">Tell me what you have</h1>
        <p className="mt-2 max-w-measure text-md text-ink-soft">
          Six or seven things is plenty. Say which ones have to go first and the session gets
          built around them.
        </p>
      </header>

      <IngredientSearch onAdd={addByName} taken={pantry.map((i) => i.canonicalName)} />

      <section aria-label="In the fridge">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-bold">
            In the fridge{pantry.length > 0 ? ` · ${pantry.length}` : ''}
          </h2>
          {pantry.length > 0 ? (
            <p className="text-xs text-ink-soft">
              {urgent > 0 ? `${urgent} to use today · ` : ''}tap one to change when it has to go
            </p>
          ) : null}
        </div>

        {pantry.length === 0 ? (
          <div className="mt-2 rounded-md bg-cream-deep p-4">
            <span className="text-ink-faint">
              <Glyph name="state-empty" size={40} />
            </span>
            <p className="mt-2 text-sm text-ink-soft">
              Nothing yet. Search above, or tap a few of these:
            </p>
            <Starters taken={taken} onAdd={addByName} />
          </div>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {pantry.map((i) => (
              <li key={i.id}>
                <Chip
                  icon={INGREDIENT_GLYPH[i.category]}
                  label={i.name}
                  urgent={i.urgency === 'use-today'}
                  unrecognised={i.unrecognised}
                  onClick={() => cycleUrgency(i.id)}
                  actionLabel={`${i.name}, ${URGENCY_LABEL[i.urgency]}. Change to ${
                    URGENCY_LABEL[URGENCY_CYCLE[i.urgency]]
                  }.`}
                  onRemove={() => dropIngredient(i.id)}
                  settle
                >
                  {i.name}
                  {i.urgency === 'use-today' ? null : (
                    <span className="text-xs text-ink-soft">{URGENCY_LABEL[i.urgency]}</span>
                  )}
                </Chip>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pantry.length > 0 && pantry.length < 8 ? (
        <section aria-label="Common things">
          <h2 className="text-xs font-bold text-ink-soft">Anything else in there?</h2>
          <Starters taken={taken} onAdd={addByName} />
        </section>
      ) : null}

      <Kitchen />

      {failed ? (
        <p className="rounded-sm bg-orange-wash p-3 text-sm" role="status">
          {failed}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 pb-4">
        <Button
          variant="primary"
          size="lg"
          onClick={() => void findFromPantry()}
          disabled={pantry.length === 0 || finding}
        >
          {finding ? 'Finding recipes…' : 'Find me recipes'}
        </Button>
        <Button variant="quiet" onClick={reset}>
          Start again
        </Button>
        {pantry.length === 0 ? (
          <p className="text-xs text-ink-soft">Add something to the fridge first.</p>
        ) : null}
      </div>
    </main>
  );
};
