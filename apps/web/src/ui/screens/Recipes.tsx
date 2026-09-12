import { useState } from 'react';
import type { RecipeIR } from '@kitchen/domain';
import type { CookResponse } from '@kitchen/contracts';
import { useSession } from '@/app/store';
import { sessionPortionTarget } from '@/app/compile';
import { Button, Glyph, Stat } from '../primitives';
import { humanMinutes } from '../timeline/model';

/**
 * What it found, before anything is scheduled.
 *
 * This screen exists because the previous stage is a model reading somebody else's web
 * page, and the honest thing to do with that is show it. A duration read wrong is a
 * schedule that falls apart at the stove, and the person standing there is the only one
 * who can tell that twenty minutes of simmering was really two.
 *
 * So: every step, its timing, where it came from, and two corrections that matter — change
 * a duration, or drop the recipe. Both recompile immediately, because the point of showing
 * the numbers is to see what changing them does.
 */

type Props = { found: CookResponse };

export const Recipes = ({ found }: Props) => {
  const intake = useSession((s) => s.intake);
  const outcome = useSession((s) => s.outcome);
  const goTo = useSession((s) => s.goTo);
  const findAgain = useSession((s) => s.goTo);

  const target = sessionPortionTarget(intake);
  const portions = found.recipes.reduce((n, r) => n + r.yieldServings, 0);
  const fits = outcome?.ok ? outcome.schedule.makespanMin <= outcome.schedule.timeBudgetMin : false;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[860px] flex-col gap-5 px-5 py-7">
      <header>
        <p className="voice-compiler text-xs uppercase tracking-wide text-ink-faint">
          read from {new Set(found.recipes.map((r) => r.source?.siteName)).size} sites
        </p>
        <h1 className="voice-display mt-1 text-3xl">Here is what it found</h1>
        <p className="mt-2 max-w-measure text-md text-ink-soft">
          Each of these was read off the page it links to. Check the timings — a step read
          wrong is the one that catches you out at the stove. Change anything and the session
          recompiles underneath.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={found.recipes.length} label="dishes it could read" />
        <Stat
          value={portions}
          tone={portions >= target ? 'good' : 'warn'}
          label={`portions, against the ${target} this week needs`}
        />
        <Stat
          value={outcome?.ok ? outcome.schedule.makespanMin : '—'}
          tone={fits ? 'good' : 'warn'}
          label={outcome?.ok ? `minutes, of the ${outcome.schedule.timeBudgetMin} you have` : 'not scheduled yet'}
        />
        <Stat value={intake.cookCount.value} label="cooking" />
      </div>

      {found.corrections.length > 0 ? (
        <section aria-label="Fixed on the way in" className="rounded-md bg-mustard-wash p-4">
          <h2 className="text-sm font-bold">Fixed on the way in</h2>
          <p className="mt-1 text-xs text-ink-soft">
            These came back outside what the verb could plausibly take, so they were pulled
            back. Worth a look — the page may have been right.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {found.corrections.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <ul className="flex flex-col gap-4">
        {found.recipes.map((recipe) => (
          <li key={recipe.id}>
            <RecipeCard recipe={recipe} />
          </li>
        ))}
      </ul>

      <footer className="flex flex-wrap items-center gap-3 pb-4">
        <Button
          variant="primary"
          size="lg"
          onClick={() => goTo('timeline')}
          disabled={!outcome?.ok}
        >
          Schedule the session
        </Button>
        <Button variant="secondary" onClick={() => findAgain('speak')}>
          Ask for something else
        </Button>
        {!outcome?.ok ? (
          <p className="text-xs text-tomato-ink">
            {outcome && !outcome.ok ? outcome.reason : 'Nothing scheduled yet.'}
          </p>
        ) : null}
      </footer>
    </main>
  );
};

const RecipeCard = ({ recipe }: { recipe: RecipeIR }) => {
  const [open, setOpen] = useState(false);
  const dropRecipe = useSession((s) => s.dropRecipe);
  const reviseStep = useSession((s) => s.reviseStep);

  const total = recipe.steps.reduce((n, s) => n + s.durationMin, 0);
  const hands = recipe.steps.reduce((n, s) => n + s.activeMin + s.finishMin, 0);

  return (
    <article className="rounded-md border border-line bg-cream p-4 shadow-1">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="voice-display text-lg">{recipe.title}</h2>
        <Button variant="quiet" onClick={() => dropRecipe(recipe.id)}>
          Not this one
        </Button>
      </div>

      <p className="mt-1 text-xs text-ink-soft">
        serves {recipe.yieldServings} · keeps {recipe.keepsDays} days · {humanMinutes(total)} total,{' '}
        {humanMinutes(hands)} of it hands-on
        {recipe.source ? (
          <>
            {' · '}
            <a
              href={recipe.source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-2 hover:text-charcoal"
            >
              {recipe.source.siteName}
            </a>
          </>
        ) : null}
      </p>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-3 text-sm font-bold text-tomato-ink underline underline-offset-4"
      >
        {open ? 'Hide the steps' : `Check the ${recipe.steps.length} steps`}
      </button>

      {open ? (
        <ol className="mt-3 flex flex-col gap-2">
          {recipe.steps.map((step, i) => (
            <li key={step.id} className="flex flex-wrap items-baseline gap-3 border-b border-line pb-2 last:border-b-0">
              <span className="voice-compiler w-5 flex-none text-xs text-ink-faint">{i + 1}</span>
              <span className="min-w-[12rem] flex-1 text-sm">{step.text}</span>
              <label className="flex items-center gap-2 text-xs text-ink-soft">
                <span className="sr-only">Minutes for: {step.text}</span>
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={step.durationMin}
                  onChange={(e) => reviseStep(recipe.id, step.id, Number(e.target.value))}
                  className="min-h-[44px] w-[72px] rounded-xs border-[1.5px] border-line-strong bg-cream px-2
                    text-center font-ui text-sm text-charcoal"
                />
                min
              </label>
              <span className="voice-compiler w-28 flex-none text-xs text-ink-faint">
                {step.activeMin + step.finishMin === 0
                  ? 'hands free'
                  : `${step.activeMin + step.finishMin}m hands-on`}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {recipe.steps.every((s) => s.durationMin === s.activeMin + s.finishMin) ? (
        <p className="mt-3 flex items-start gap-2 rounded-sm bg-cream-deep p-2 text-xs text-ink-soft">
          <span className="text-mustard-ink">
            <Glyph name="state-impossible" size={18} />
          </span>
          Every minute of this one needs a hand, so nothing else can be cooked inside it.
          That is true of a stir-fry, and worth a second look on anything else.
        </p>
      ) : null}
    </article>
  );
};
