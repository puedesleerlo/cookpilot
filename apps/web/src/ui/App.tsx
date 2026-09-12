import { useSession } from '@/app/store';
import { Blobs, Button, Glyph, Grain } from './primitives';
import { Landing } from './screens/Landing';

/** Screen routing. The store holds where we are; each screen owns its own layout. */
export const App = () => {
  const screen = useSession((s) => s.screen);
  return (
    <>
      <Blobs />
      <Grain />
      {screen === 'landing' ? <Landing /> : <NotBuiltYet />}
    </>
  );
};

/**
 * Everything past the landing page is still being built. This says so plainly rather than
 * showing a dead end — an honest empty state is worth more than a screen that looks broken.
 */
const NotBuiltYet = () => {
  const reset = useSession((s) => s.reset);
  const pantry = useSession((s) => s.intake.pantry);

  return (
    <main className="mx-auto flex min-h-dvh max-w-[640px] flex-col justify-center gap-5 px-5 py-8">
      <span className="text-sage-ink">
        <Glyph name="state-compiling" size={64} />
      </span>
      <h1 className="voice-display text-2xl">This part is still on the stove</h1>
      <p className="text-md text-ink-soft">
        The compiler behind this — the task graph, the scheduling engine and the timeline —
        is being built now. The example session loaded {pantry.length} ingredients and the
        kitchen they have to be cooked in; what it does not have yet is the screen that
        shows you the plan.
      </p>
      <div>
        <Button variant="secondary" onClick={reset}>
          Back to the start
        </Button>
      </div>
    </main>
  );
};
