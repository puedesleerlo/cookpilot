import { useSync } from '@/app/sync';
import { Button, Display, Glyph, Motif, Patch } from '../primitives';
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
          <div className="flex flex-col items-center gap-4 text-center">
            <span aria-hidden="true" className="relative grid h-[7rem] w-[7rem] place-items-center">
              <Patch
                tone="dough"
                cut="plate"
                className="absolute inset-0 [rotate:-6deg] motion-safe:animate-[mk-stamp_var(--d-slow)_var(--mk-ease-stamp)_both]"
              />
              <span className="relative text-plum-900">
                <Glyph name="pot" size={52} strokeWidth={2} />
              </span>
              <Motif name="spark" className="absolute -right-5 -top-3 w-[2.25rem]" m1="var(--mk-paprika)" />
            </span>
            <p role="status" className="text-md font-medium text-muted [font-variation-settings:var(--mk-sharp)]">
              Talking to the kitchen…
            </p>
          </div>
        </main>
      );
  }
};

const Failed = () => {
  const error = useSync((s) => s.error);
  const leave = useSync((s) => s.leave);
  return (
    <main className="mx-auto flex min-h-dvh max-w-[640px] flex-col justify-center gap-6 px-5 py-8">
      <div aria-hidden="true" className="relative h-[9rem] w-[10rem]">
        <Patch
          tone="soup"
          cut="burst"
          className="absolute inset-0 motion-safe:animate-[mk-stamp_var(--d-slow)_var(--mk-ease-stamp)_both]"
        />
        <span className="absolute inset-0 grid place-items-center text-paper">
          <Glyph name="state-impossible" size={64} strokeWidth={2.2} />
        </span>
        <Motif name="poppy" className="absolute -bottom-3 -right-8 w-[4.5rem] rotate-12" m1="var(--mk-plum-900)" />
      </div>
      <Display as="h1" className="text-[length:var(--mk-text-3xl)] sm:text-[length:var(--mk-text-4xl)]">
        That did not work
      </Display>
      <p className="max-w-measure text-md text-muted">{error ?? 'The shared session is no longer reachable.'}</p>
      <div className="flex flex-wrap gap-3">
        <Button variant="primary" onClick={leave}>
          Back
        </Button>
      </div>
    </main>
  );
};
