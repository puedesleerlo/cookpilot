import { useSync } from '@/app/sync';
import { Button, Glyph } from '../primitives';
import { Cooking } from '../cooking/Cooking';
import { Join } from '../cooking/Join';
import { Lobby } from '../cooking/Lobby';
import { useSyncPolling } from '../cooking/useSyncPolling';

/**
 * The shared-session flow, routed by the sync store's phase rather than the session
 * store's screen: a phone that scanned a code has no pantry, no compile of its own and no
 * business in the single-device screens, and the laptop that hosts keeps its compiled
 * session underneath for when it comes back.
 */
export const Shared = () => {
  useSyncPolling();
  const phase = useSync((s) => s.phase);

  switch (phase) {
    case 'join':
      return <Join />;
    case 'lobby':
      return <Lobby />;
    case 'cooking':
      return <Cooking />;
    case 'error':
      return <Failed />;
    default:
      return (
        <main className="grid min-h-dvh place-items-center px-5">
          <p role="status" className="text-sm text-ink-soft">
            Talking to the kitchen…
          </p>
        </main>
      );
  }
};

const Failed = () => {
  const error = useSync((s) => s.error);
  const leave = useSync((s) => s.leave);
  return (
    <main className="mx-auto flex min-h-dvh max-w-[640px] flex-col justify-center gap-5 px-5 py-8">
      <span className="text-tomato-ink">
        <Glyph name="state-impossible" size={64} />
      </span>
      <h1 className="voice-display text-2xl">That did not work</h1>
      <p className="text-md text-ink-soft">{error ?? 'The shared session is no longer reachable.'}</p>
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" onClick={leave}>
          Back
        </Button>
      </div>
    </main>
  );
};
