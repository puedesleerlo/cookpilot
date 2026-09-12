import { useSync } from '@/app/sync';
import { Glyph } from '../primitives';

/**
 * Whether this device's timeline is the host's timeline.
 *
 * Every device compiles the session for itself and checks the hash of the result against
 * the one the host sent. Agreeing is the normal case and says nothing. Disagreeing almost
 * always means one side is running a stale bundle, and the honest thing is to say so
 * before anyone follows a step the other phones do not have.
 */
export const Agreement = () => {
  const agreement = useSync((s) => s.agreement);
  if (agreement !== 'different') return null;
  return (
    <div role="alert" className="relative flex items-start gap-4 overflow-hidden rounded-nick-lg bg-warning-bg p-4 pr-5 text-ink">
      <span aria-hidden="true" className="relative grid h-8 w-8 flex-none place-items-center">
        <span className="absolute inset-0 bg-marigold [clip-path:var(--mk-cut-burst)] [rotate:-8deg]" />
        <span className="relative text-charcoal">
          <Glyph name="state-impossible" size={30} strokeWidth={2} />
        </span>
      </span>
      <span className="min-w-0">
        <span className="block text-md font-bold text-warning [font-variation-settings:var(--mk-sharp)]">
          Timelines disagree
        </span>
        <span className="mt-1 block text-sm">
          This device compiled a different timeline from the host&rsquo;s. That usually means one
          of you is on an older version of the app — reload both and try again before cooking
          from it.
        </span>
      </span>
    </div>
  );
};
