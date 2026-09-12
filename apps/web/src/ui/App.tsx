import { useSession } from '@/app/store';
import { useSync } from '@/app/sync';
import { Backdrop, Button, CompileCurtain, Display, Glyph, Grain, MakitraRoot, Motif, Patch } from './primitives';
import { Intake } from './screens/Intake';
import { Landing } from './screens/Landing';
import { Recipes } from './screens/Recipes';
import { Speak } from './screens/Speak';
import { Working } from './screens/Working';
import { Shared } from './screens/Shared';
import { Timeline } from './screens/Timeline';

/** Screen routing. The store holds where we are; each screen owns its own layout. */
export const App = () => {
  const screen = useSession((s) => s.screen);
  const outcome = useSession((s) => s.outcome);
  const compiling = useSession((s) => s.compiling);
  const settle = useSession((s) => s.settle);
  const found = useSession((s) => s.found);
  const shared = useSync((s) => s.phase !== 'idle');

  /*
   * A device in a shared session — hosting one from this timeline, or a phone that scanned
   * a code — is in that flow and nothing else. The compiled session stays in its store
   * underneath, so leaving lands the host back on the timeline it started from.
   */
  if (shared) {
    return (
      <MakitraRoot>
        <Backdrop />
        <Grain />
        <Shared />
      </MakitraRoot>
    );
  }

  return (
    <MakitraRoot>
      <Backdrop />
      <Grain />

      {screen === 'landing' ? <Landing /> : null}

      {screen === 'speak' ? <Speak /> : null}

      {screen === 'intake' ? <Intake /> : null}

      {screen === 'working' ? <Working /> : null}

      {screen === 'recipes' ? (
        found ? <Recipes found={found} /> : <Speak />
      ) : null}

      {screen === 'timeline' ? (
        outcome?.ok ? (
          <Timeline
            plan={outcome.plan}
            schedule={outcome.schedule}
            constraints={outcome.constraints}
          />
        ) : (
          /*
           * Recompiling can in principle produce a session that will not build — turn off
           * enough of the kitchen and there is nothing left to cook. Rendering nothing at
           * all was the old behaviour, and a blank page is the worst possible answer to
           * "what happened to my session".
           */
          <DidNotCompile reason={outcome && !outcome.ok ? outcome.reason : undefined} />
        )
      ) : null}

      {screen !== 'landing' &&
      screen !== 'speak' &&
      screen !== 'intake' &&
      screen !== 'working' &&
      screen !== 'recipes' &&
      screen !== 'timeline' ? (
        <NotBuiltYet />
      ) : null}

      {/*
        The curtain is dismissed by its own sequence finishing, not by the compile: the
        schedule is already computed and sitting underneath it before the first stage has
        finished animating.
      */}
      <CompileCurtain active={compiling} onDone={settle} />
    </MakitraRoot>
  );
};

const DidNotCompile = ({ reason }: { reason?: string }) => {
  const goTo = useSession((s) => s.goTo);
  const reset = useSession((s) => s.reset);

  return (
    <main className="mx-auto flex min-h-dvh max-w-[680px] flex-col justify-center gap-6 px-5 py-8">
      <div aria-hidden="true" className="relative h-[160px] w-[176px]">
        <Patch tone="soup" cut="burst" className="absolute inset-0 motion-safe:animate-[mk-stamp_var(--d-slow)_var(--mk-ease-stamp)_both]" />
        <span className="absolute inset-0 grid place-items-center text-paper">
          <Glyph name="state-impossible" size={72} strokeWidth={2.2} />
        </span>
        <Motif name="poppy" className="absolute -bottom-3 right-[-40px] w-[80px] rotate-12" m1="var(--mk-plum-900)" />
      </div>
      <Display as="h1" className="text-3xl sm:text-4xl">That one would not compile</Display>
      <p className="max-w-measure text-md text-muted">
        {reason ?? 'Nothing in the registry fits that fridge and that kitchen together.'}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" onClick={() => goTo('intake')}>
          Change the fridge
        </Button>
        <Button variant="secondary" onClick={reset}>
          Back to the start
        </Button>
      </div>
    </main>
  );
};

/**
 * Cooking mode and the shared session are still being built. This says so plainly rather
 * than showing a dead end — an honest empty state is worth more than a screen that looks
 * broken. The run sheet is what you follow in the meantime, and it is one step back.
 */
const NotBuiltYet = () => {
  const reset = useSession((s) => s.reset);
  const goTo = useSession((s) => s.goTo);
  const outcome = useSession((s) => s.outcome);

  return (
    <main className="mx-auto flex min-h-dvh max-w-[680px] flex-col justify-center gap-6 px-5 py-8">
      <div aria-hidden="true" className="relative h-[160px] w-[176px]">
        <Patch tone="dough" cut="plate" className="absolute inset-0 motion-safe:animate-[mk-stamp_var(--d-slow)_var(--mk-ease-stamp)_both]" />
        <span className="absolute inset-0 grid place-items-center text-plum-900">
          <Glyph name="state-compiling" size={72} strokeWidth={2.2} />
        </span>
        <Motif name="spark" className="absolute right-[-32px] -top-4 w-[56px]" m1="var(--mk-paprika)" />
      </div>
      <Display as="h1" className="text-3xl sm:text-4xl">This part is still on the stove</Display>
      <p className="max-w-measure text-md text-muted">
        Cooking mode — the one that counts your timers down and re-plans when a step runs
        long — is being built now. Until it lands, the run sheet on the session you compiled
        is what to follow.
      </p>
      <div className="flex flex-wrap gap-3">
        {outcome?.ok ? (
          <Button variant="primary" onClick={() => goTo('timeline')}>
            Back to the session
          </Button>
        ) : null}
        <Button variant="secondary" onClick={reset}>
          Back to the start
        </Button>
      </div>
    </main>
  );
};
