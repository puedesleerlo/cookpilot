import { useSession } from '@/app/store';
import { Blobs, Button, CompileCurtain, Glyph, Grain } from './primitives';
import { Landing } from './screens/Landing';
import { Timeline } from './screens/Timeline';

/** Screen routing. The store holds where we are; each screen owns its own layout. */
export const App = () => {
  const screen = useSession((s) => s.screen);
  const outcome = useSession((s) => s.outcome);
  const compiling = useSession((s) => s.compiling);
  const settle = useSession((s) => s.settle);

  return (
    <>
      <Blobs />
      <Grain />

      {screen === 'landing' ? <Landing /> : null}

      {screen === 'timeline' && outcome?.ok ? (
        <Timeline plan={outcome.plan} schedule={outcome.schedule} constraints={outcome.constraints} />
      ) : null}

      {screen !== 'landing' && screen !== 'timeline' ? (
        <NotBuiltYet reason={outcome && !outcome.ok ? outcome.reason : undefined} />
      ) : null}

      {/*
        The curtain is dismissed by its own sequence finishing, not by the compile: the
        schedule is already computed and sitting underneath it before the first stage has
        finished animating.
      */}
      <CompileCurtain active={compiling} onDone={settle} />
    </>
  );
};

/**
 * Everything past the timeline is still being built. This says so plainly rather than
 * showing a dead end — an honest empty state is worth more than a screen that looks broken.
 */
const NotBuiltYet = ({ reason }: { reason?: string }) => {
  const reset = useSession((s) => s.reset);
  const startDemo = useSession((s) => s.startDemo);

  return (
    <main className="mx-auto flex min-h-dvh max-w-[640px] flex-col justify-center gap-5 px-5 py-8">
      <span className="text-sage-ink">
        <Glyph name={reason ? 'state-impossible' : 'state-compiling'} size={64} />
      </span>
      <h1 className="voice-display text-2xl">
        {reason ? 'That one would not compile' : 'This part is still on the stove'}
      </h1>
      <p className="text-md text-ink-soft">
        {reason ??
          'The compiler, the timeline and the run sheet are working. What is not built yet is the screen that takes your own fridge as input — so for now the example session is the way in.'}
      </p>
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" onClick={startDemo}>
          Compile the example session
        </Button>
        <Button variant="secondary" onClick={reset}>
          Back to the start
        </Button>
      </div>
    </main>
  );
};
