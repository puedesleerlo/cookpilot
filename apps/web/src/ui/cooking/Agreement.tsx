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
    <p role="alert" className="flex items-start gap-3 rounded-md bg-orange-wash p-4 text-sm">
      <span className="flex-none text-orange-ink">
        <Glyph name="state-impossible" size={28} />
      </span>
      <span>
        This device compiled a different timeline from the host&rsquo;s. That usually means one
        of you is on an older version of the app — reload both and try again before cooking
        from it.
      </span>
    </p>
  );
};
