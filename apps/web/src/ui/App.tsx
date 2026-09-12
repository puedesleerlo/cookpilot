import { useSession } from '@/app/store';
import { useSync } from '@/app/sync';
import { Blobs, Button, CompileCurtain, Glyph, Grain } from './primitives';
import { Intake } from './screens/Intake';
import { Landing } from './screens/Landing';
import { Shared } from './screens/Shared';
import { Timeline } from './screens/Timeline';

/** Screen routing. The store holds where we are; each screen owns its own layout. */
export const App = () => {
  const screen = useSession((s) => s.screen);
  const outcome = useSession((s) => s.outcome);
  const compiling = useSession((s) => s.compiling);
  const settle = useSession((s) => s.settle);
  const shared = useSync((s) => s.phase !== 'idle');

  /*
   * A device in a shared session — hosting one from this timeline, or a phone that scanned
   * a code — is in that flow and nothing else. The compiled session stays in its store
   * underneath, so leaving lands the host back on the timeline it started from.
   */
  if (shared) {
    return (
      <>
        <Blobs />
        <Grain />
        <Shared />
      </>
    );
  }

  return (
    <>
      <Blobs />
      <Grain />

      {screen === 'landing' ? <Landing /> : null}

      {screen === 'intake' ? <Intake /> : null}

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

      {screen !== 'landing' && screen !== 'intake' && screen !== 'timeline' ? <NotBuiltYet /> : null}

      {/*
        The curtain is dismissed by its own sequence finishing, not by the compile: the
        schedule is already computed and sitting underneath it before the first stage has
        finished animating.
      */}
      <CompileCurtain active={compiling} onDone={settle} />
    </>
  );
};

const DidNotCompile = ({ reason }: { reason?: string }) => {
  const goTo = useSession((s) => s.goTo);
  const reset = useSession((s) => s.reset);

  return (
    <main className="mx-auto flex min-h-dvh max-w-[640px] flex-col justify-center gap-5 px-5 py-8">
      <span className="text-tomato-ink">
        <Glyph name="state-impossible" size={64} />
      </span>
      <h1 className="voice-display text-2xl">That one would not compile</h1>
      <p className="text-md text-ink-soft">
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
    <main className="mx-auto flex min-h-dvh max-w-[640px] flex-col justify-center gap-5 px-5 py-8">
      <span className="text-sage-ink">
        <Glyph name="state-compiling" size={64} />
      </span>
      <h1 className="voice-display text-2xl">This part is still on the stove</h1>
      <p className="text-md text-ink-soft">
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
