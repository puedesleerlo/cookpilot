import { useState, type CSSProperties } from 'react';
import type { DishKind, RecipeIR, RecipeStep } from '@kitchen/domain';
import type { CookResponse } from '@kitchen/contracts';
import bowl from '@/assets/makitra/makitra-bowl.svg';
import { useSession } from '@/app/store';
import { sessionPortionTarget } from '@/app/compile';
import { Button, Display, Glyph, Motif, Patch, Stat, type MotifName, type PatchTone } from '../primitives';
import { DRAWING, drawingsFor, type DrawingName } from '../intake/drawings';
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
 *
 * Each dish is a Makitra recipe card on its category patch. The machine's own words — how
 * many sites, what it pulled back, what it dropped — stay in the compiler voice.
 */

type Props = { found: CookResponse };

const tilt = (deg: number): CSSProperties => ({ rotate: `${deg}deg` });
const STAMP = 'motion-safe:animate-[mk-stamp_var(--d-slow)_var(--mk-ease-stamp)_both]';

// ------------------------------------------------------------------ category patches

/**
 * Which Makitra patch a dish sits on. Deterministic, from the title and the dish kind:
 * a drink is always a drink, something liquid and hot is soup, a sauce is a preserve,
 * red meat and mushrooms go to the cellar, a starch is dough, greens are the garden, and
 * a main that says none of those is paprika — the colour of the stove.
 */
const RULES: [RegExp, PatchTone][] = [
  [/soup|stew|broth|borsch|chowder|ramen|pho\b|curry|congee|dal\b/, 'soup'],
  [/pickle|jam|preserve|chutney|relish|kimchi|ferment|sauce|dressing|\boil\b|salsa|pesto|dip\b/, 'preserve'],
  [/beef|pork|lamb|mushroom|roast|braise|smoked|cured|cheese|potato|beet/, 'cellar'],
  [/chicken|salmon|fish|shrimp|prawn|tofu|stir-?fry|skillet|grill|chilli|chili/, 'soup'],
  [/rice|noodle|bread|dough|dumpling|pasta|pancake|\bpie\b|\bbun|flatbread|tortilla|pizza|oat|porridge|quinoa|couscous/, 'dough'],
  [/salad|slaw|greens|bok choy|spinach|broccoli|vegetable|\bveg\b|pepper|herb|cucumber|bean/, 'garden'],
];

const KIND_TONE: Record<DishKind, PatchTone> = {
  main: 'soup',
  side: 'garden',
  sauce: 'preserve',
  base: 'dough',
  beverage: 'drink',
};

const dishTone = (recipe: Pick<RecipeIR, 'title' | 'kind'>): PatchTone => {
  if (recipe.kind === 'beverage') return 'drink';
  const title = recipe.title.toLowerCase();
  return RULES.find(([re]) => re.test(title))?.[1] ?? KIND_TONE[recipe.kind];
};

const KIND_LABEL: Record<DishKind, string> = {
  main: 'main',
  side: 'side',
  sauce: 'sauce',
  base: 'batch base',
  beverage: 'drink',
};

/** Small text on a pigment: only the pairs that read. Soup and garden take their deep shade. */
const TAG: Record<PatchTone, string> = {
  soup: 'bg-paprika-600 text-paper',
  dough: 'bg-marigold text-plum-900',
  preserve: 'bg-enamel text-plum-900',
  garden: 'bg-garden-700 text-paper',
  drink: 'bg-cornflower text-plum-900',
  cellar: 'bg-mk-plum text-paper',
};

const MOTIF: Record<PatchTone, { name: MotifName; m1: string; m2?: string }> = {
  soup: { name: 'spark', m1: 'var(--mk-cornflower)' },
  dough: { name: 'daisy', m1: 'var(--mk-paprika)' },
  preserve: { name: 'cherry', m1: 'var(--mk-beet)', m2: 'var(--mk-garden)' },
  garden: { name: 'leaf', m1: 'var(--mk-garden)' },
  drink: { name: 'poppy', m1: 'var(--mk-plum-900)' },
  cellar: { name: 'mushroom', m1: 'var(--mk-marigold)' },
};

const FALLBACK_DRAWING: Record<PatchTone, DrawingName> = {
  soup: 'tomato',
  dough: 'potato',
  preserve: 'cherries',
  garden: 'cabbage',
  drink: 'cherries',
  cellar: 'beet',
};

/** Pale drawings vanish on a paper plate, so they get a plum one, like a bowl rim. */
const PALE: DrawingName[] = ['mushroom', 'garlic'];

// ------------------------------------------------------------------ screen

export const Recipes = ({ found }: Props) => {
  const intake = useSession((s) => s.intake);
  const outcome = useSession((s) => s.outcome);
  const goTo = useSession((s) => s.goTo);
  const findAgain = useSession((s) => s.goTo);

  const target = sessionPortionTarget(intake);
  const portions = found.recipes.reduce((n, r) => n + r.yieldServings, 0);
  const fits = outcome?.ok ? outcome.schedule.makespanMin <= outcome.schedule.timeBudgetMin : false;
  const aside = found.corrections.length > 0 || found.notes.length > 0;

  const stats: {
    value: React.ReactNode;
    label: string;
    tone?: 'good' | 'warn';
    word?: string;
    back: string;
  }[] = [
    { value: found.recipes.length, label: 'dishes it could read', back: 'bg-cornflower' },
    {
      value: portions,
      tone: portions >= target ? 'good' : 'warn',
      word: portions >= target ? 'enough' : 'short',
      label: `portions, against the ${target} this week needs`,
      back: 'bg-marigold',
    },
    {
      value: outcome?.ok ? outcome.schedule.makespanMin : '—',
      tone: fits ? 'good' : 'warn',
      word: outcome?.ok ? (fits ? 'fits' : 'over') : 'not yet',
      label: outcome?.ok ? `minutes, of the ${outcome.schedule.timeBudgetMin} you have` : 'not scheduled yet',
      back: 'bg-paprika',
    },
    { value: intake.cookCount.value, label: 'cooking', back: 'bg-enamel' },
  ];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1120px] flex-col gap-[40px] px-4 pt-6 sm:px-8 lg:pt-[48px]">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-4 gap-y-3">
        <p className="voice-compiler col-start-1 row-start-1 self-end justify-self-start rounded-nick-xs bg-surface px-3 py-1 text-xs uppercase tracking-wide text-muted">
          read from {new Set(found.recipes.map((r) => r.source?.siteName)).size} sites
        </p>
        <div
          aria-hidden="true"
          className="pointer-events-none relative col-start-2 row-start-1 h-[88px] w-[120px] sm:h-[140px] sm:w-[190px]
            lg:row-span-3 lg:h-[230px] lg:w-[310px]"
        >
          <Patch tone="drink" cut="burst" className={`absolute inset-[0_8%_6%_18%] ${STAMP}`} style={tilt(-8)} />
          <Patch tone="cellar" cut="plate" className={`absolute bottom-[4%] left-0 h-[46%] w-[40%] ${STAMP} [animation-delay:90ms]`} style={tilt(10)} />
          <img src={bowl} alt="" className={`absolute left-[20%] top-[26%] w-[64%] ${STAMP} [animation-delay:160ms]`} style={tilt(-4)} />
          <Motif name="spark" className="absolute right-0 top-[4%] w-[16%]" style={tilt(20)} m1="var(--mk-paprika)" />
        </div>
        <Display as="h1" className="col-span-2 text-4xl leading-[0.95] sm:text-5xl lg:col-span-1">
          Here is what it{' '}
          <span className="relative isolate inline-block">
            <span
              aria-hidden="true"
              className="absolute -inset-x-3 bottom-[-6%] top-[8%] -z-10 bg-enamel [clip-path:var(--mk-cut-patch)]"
              style={tilt(2)}
            />
            found
          </span>
        </Display>
        <p className="col-span-2 max-w-[54ch] text-md text-muted lg:col-span-1">
          Each of these was read off the page it links to. Check the timings — a step read
          wrong is the one that catches you out at the stove. Change anything and the session
          recompiles underneath.
        </p>
      </header>

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-5">
        {stats.map((st, i) => (
          <li key={st.label} className="relative isolate" style={tilt([-1.5, 1, -0.5, 1.5][i] ?? 0)}>
            <span
              aria-hidden="true"
              className={`absolute inset-0 -z-10 translate-x-[7px] translate-y-[7px] [clip-path:var(--mk-cut-patch)] ${st.back}`}
            />
            <Stat value={st.value} label={st.label} tone={st.tone ?? 'plain'} />
            {st.word ? (
              <span
                className={`mk-tag absolute -top-3 right-2 ${st.tone === 'good' ? 'mk-tag--success' : 'mk-tag--warning'}`}
                style={tilt(4)}
              >
                <Glyph name={st.tone === 'good' ? 'state-success' : 'state-impossible'} size={16} strokeWidth={2.2} />
                {st.word}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      <div className={`grid items-start gap-[40px] ${aside ? 'lg:grid-cols-[minmax(0,1fr)_320px]' : ''}`}>
        {aside ? (
          <div className="order-last flex min-w-0 flex-col gap-6 lg:sticky lg:top-6 lg:order-none lg:col-start-2 lg:row-start-1">
            {found.corrections.length > 0 ? (
              <section aria-label="Fixed on the way in" className="relative rounded-nick-lg bg-warning-bg p-5">
                <h2 className="flex items-center gap-2 text-sm font-bold [font-variation-settings:var(--mk-sharp)]">
                  <span aria-hidden="true" className="text-warning">
                    <Glyph name="state-impossible" size={24} strokeWidth={2} />
                  </span>
                  Fixed on the way in
                </h2>
                <p className="mt-1 text-xs text-ink">
                  These came back outside what the verb could plausibly take, so they were pulled
                  back. Worth a look — the page may have been right.
                </p>
                <ul className="mt-3 flex flex-col gap-2">
                  {found.corrections.map((c) => (
                    <li key={c} className="voice-compiler rounded-nick-sm bg-surface px-3 py-2 text-xs text-ink">
                      {c}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {found.notes.length > 0 ? (
              <section aria-label="Dropped on the way" className="relative rounded-nick-lg bg-sunken p-5">
                <Motif
                  name="poppy"
                  className="pointer-events-none absolute -right-2 -top-4 w-[44px]"
                  style={tilt(16)}
                  m1="var(--mk-plum-900)"
                />
                <h2 className="text-sm font-bold [font-variation-settings:var(--mk-sharp)]">Dropped on the way</h2>
                <p className="mt-1 text-xs text-muted">
                  Pages it could not use and searches that came back short. None of it is in the
                  session.
                </p>
                <ul className="mt-3 flex flex-col gap-2">
                  {found.notes.map((n, i) => (
                    <li key={`${n.stage}-${i}`} className="flex flex-col gap-1 border-t-2 border-dashed border-rule pt-2 first:border-t-0 first:pt-0">
                      <span className="voice-compiler text-xs uppercase tracking-wide text-muted">{n.stage}</span>
                      <span className="voice-compiler text-xs text-ink">{n.message}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}

        <ul className="flex min-w-0 flex-col gap-[40px] lg:col-start-1 lg:row-start-1">
          {found.recipes.map((recipe, i) => (
            <li key={recipe.id}>
              <RecipeCard recipe={recipe} flip={i % 2 === 1} />
            </li>
          ))}
        </ul>
      </div>

      <footer className="relative isolate -mx-4 flex flex-wrap items-center gap-3 px-4 pb-4 pt-[28px] sm:-mx-8 sm:px-8 lg:sticky lg:bottom-0 lg:z-10">
        <span
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-sunken [clip-path:var(--mk-cut-edge-top)]"
        />
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
          <p className="flex items-center gap-2 text-sm font-semibold text-danger">
            <span aria-hidden="true">
              <Glyph name="state-impossible" size={22} strokeWidth={2} />
            </span>
            {outcome && !outcome.ok ? outcome.reason : 'Nothing scheduled yet.'}
          </p>
        ) : null}
      </footer>
    </main>
  );
};

// ------------------------------------------------------------------ one dish

const CardArt = ({ recipe, tone, flip }: { recipe: RecipeIR; tone: PatchTone; flip: boolean }) => {
  const drawn = drawingsFor([recipe.title, ...recipe.ingredients.map((i) => i.canonicalName)]);
  const first = drawn[0] ?? FALLBACK_DRAWING[tone];
  const pale = PALE.includes(first);
  const second = drawn.slice(1).find((d) => PALE.includes(d) === pale);
  const motif = MOTIF[tone];

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none relative h-[176px] md:h-[250px] ${flip ? 'md:order-last' : ''}`}
    >
      <Patch
        tone={tone}
        cut={flip ? 'plate' : 'patch'}
        className={`absolute inset-0 ${flip ? 'md:-right-3 md:-top-3' : '-left-2 -top-3 md:-bottom-2'}`}
        style={tilt(flip ? 2 : -2)}
      />
      <span
        className={`absolute left-1/2 top-1/2 aspect-square h-[68%] max-h-[176px] -translate-x-1/2 -translate-y-1/2
          [clip-path:var(--mk-cut-plate)] ${pale ? (tone === 'cellar' ? 'bg-plum-900' : 'bg-mk-plum') : 'bg-paper-bright'}`}
      />
      <img
        src={DRAWING[first]}
        alt=""
        className={`absolute left-1/2 top-1/2 h-[40%] max-h-[104px] w-auto -translate-x-1/2 -translate-y-1/2 ${
          second ? '!-translate-x-[78%]' : ''
        }`}
        style={tilt(-10)}
      />
      {second ? (
        <img
          src={DRAWING[second]}
          alt=""
          className="absolute left-1/2 top-1/2 h-[30%] max-h-[80px] w-auto -translate-x-[4%] -translate-y-[18%]"
          style={tilt(12)}
        />
      ) : null}
      <span
        className={`absolute top-2 px-3 pb-[4px] pt-[6px] text-xs font-bold uppercase tracking-wide [clip-path:var(--mk-cut-tag)]
          [font-variation-settings:var(--mk-sharp)] ${flip ? 'right-3' : 'left-3'} ${TAG[tone]}`}
        style={tilt(flip ? 5 : -6)}
      >
        {KIND_LABEL[recipe.kind]}
      </span>
      <Motif
        name={motif.name}
        m1={motif.m1}
        m2={motif.m2}
        className={`absolute -bottom-3 w-[46px] ${flip ? 'left-2' : 'right-2'}`}
        style={tilt(flip ? -14 : 14)}
      />
    </div>
  );
};

/** A step's minutes as a strip of paper: hands-on ends in plum, the wait in between blank paper. */
const PhaseStrip = ({ step, longest }: { step: RecipeStep; longest: number }) => {
  const passive = Math.max(0, step.durationMin - step.activeMin - step.finishMin);
  return (
    <span
      aria-hidden="true"
      className="flex h-[8px] basis-full overflow-hidden rounded-nick-xs"
      style={{ maxWidth: `${Math.max(6, (step.durationMin / longest) * 100)}%` }}
    >
      <span className="bg-mk-plum" style={{ flexGrow: step.activeMin }} />
      <span className="bg-surface" style={{ flexGrow: passive }} />
      <span className="bg-mk-plum" style={{ flexGrow: step.finishMin }} />
    </span>
  );
};

/** Makitra's icon set has no bin, so this one is drawn to its grid: straight segments, square caps. */
const TrashIcon = () => (
  <svg viewBox="0 0 24 24" className="mk-icon" aria-hidden="true" focusable="false">
    <path d="M3.5 6.5h17M9 6.5v-3h6v3" />
    <polygon points="5.5,6.5 18.5,6.5 17.5,21 6.5,21" />
    <path d="M10 10.5v6.5M14 10.5v6.5" />
  </svg>
);

const RecipeCard = ({ recipe, flip }: { recipe: RecipeIR; flip: boolean }) => {
  const [open, setOpen] = useState(false);
  const dropRecipe = useSession((s) => s.dropRecipe);
  const reviseStep = useSession((s) => s.reviseStep);

  const tone = dishTone(recipe);
  const total = recipe.steps.reduce((n, s) => n + s.durationMin, 0);
  const hands = recipe.steps.reduce((n, s) => n + s.activeMin + s.finishMin, 0);
  const longest = Math.max(...recipe.steps.map((s) => s.durationMin), 1);

  return (
    <article
      className={`grid rounded-nick-lg bg-surface ${
        flip ? 'md:grid-cols-[minmax(0,1fr)_220px]' : 'md:grid-cols-[220px_minmax(0,1fr)]'
      }`}
    >
      <CardArt recipe={recipe} tone={tone} flip={flip} />

      <div className="flex min-w-0 flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <Display
            as="h2"
            className={`min-w-0 flex-1 text-xl leading-none sm:text-2xl ${STAMP}`}
            style={{ '--stamp-from': flip ? '6deg' : '-6deg' } as CSSProperties}
          >
            {recipe.title}
          </Display>
          <button
            type="button"
            onClick={() => dropRecipe(recipe.id)}
            aria-label={`Remove ${recipe.title}`}
            title="Remove this recipe"
            className="mk-btn mk-btn--icon flex-none [--btn-fg:var(--mk-danger)] hover:[--btn-bg:var(--mk-danger-bg)]"
          >
            <TrashIcon />
          </button>
        </div>

        <ul className="flex flex-wrap items-center gap-2 text-sm">
          <li className="mk-tag" style={tilt(-2)}>serves {recipe.yieldServings}</li>
          <li className="mk-tag" style={tilt(1.5)}>keeps {recipe.keepsDays} days</li>
          <li className="mk-tag" style={tilt(-1)}>
            {humanMinutes(total)} total, {humanMinutes(hands)} of it hands-on
          </li>
          {recipe.source ? (
            <li className="text-sm text-muted">
              from{' '}
              <a
                href={recipe.source.url}
                target="_blank"
                rel="noreferrer noopener"
                className="font-semibold text-link"
              >
                {recipe.source.siteName}
              </a>
            </li>
          ) : null}
        </ul>

        <div>
          <Button variant="secondary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? 'Hide the steps' : `Check the ${recipe.steps.length} steps`}
          </Button>
        </div>

        {open ? (
          <ol className="flex flex-col gap-2">
            {recipe.steps.map((step, i) => (
              <li
                key={step.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-nick-md bg-sunken p-3"
              >
                <span aria-hidden="true" className="mk-step__n !h-[40px] !w-[40px] flex-none">
                  {i + 1}
                </span>
                <span className="min-w-[10rem] flex-1 basis-[12rem] text-sm">{step.text}</span>
                <span className="flex flex-none flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-muted">
                    <span className="sr-only">Minutes for: {step.text}</span>
                    <input
                      type="number"
                      min={1}
                      max={720}
                      value={step.durationMin}
                      onChange={(e) => reviseStep(recipe.id, step.id, Number(e.target.value))}
                      className="mk-field__control mk-num !w-[84px] !px-2 text-center font-ui text-sm"
                    />
                    min
                  </label>
                  <span className="voice-compiler w-[7.5rem] flex-none text-xs text-muted">
                    {step.activeMin + step.finishMin === 0
                      ? 'hands free'
                      : `${step.activeMin + step.finishMin}m hands-on`}
                  </span>
                </span>
                <PhaseStrip step={step} longest={longest} />
              </li>
            ))}
          </ol>
        ) : null}

        {recipe.steps.every((s) => s.durationMin === s.activeMin + s.finishMin) ? (
          <p className="flex items-start gap-2 rounded-nick-md bg-warning-bg p-3 text-xs text-ink">
            <span aria-hidden="true" className="flex-none text-warning">
              <Glyph name="state-impossible" size={20} strokeWidth={2} />
            </span>
            Every minute of this one needs a hand, so nothing else can be cooked inside it.
            That is true of a stir-fry, and worth a second look on anything else.
          </p>
        ) : null}
      </div>
    </article>
  );
};
