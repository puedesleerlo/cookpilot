import { useEffect } from 'react';
import { useSync } from '@/app/sync';

/** Two seconds: a tap on one phone shows on the others before anyone looks up to check. */
export const POLL_MS = 2000;

/**
 * Keep the log fresh while this device is in a lobby or cooking.
 *
 * Polling rather than a socket, on purpose, for now: a phone in a kitchen sleeps, wakes,
 * drops off the wifi and comes back, and a request every two seconds survives all of that
 * with no reconnect logic to get wrong. The convergence spike proved replay-since-seq holds
 * up under exactly this pattern. A socket can replace the interval later without touching
 * what the store does with what arrives.
 */
export const useSyncPolling = (): void => {
  const phase = useSync((s) => s.phase);
  const id = useSync((s) => s.session?.id);

  useEffect(() => {
    if (!id || (phase !== 'lobby' && phase !== 'cooking')) return;
    const poll = () => void useSync.getState().poll();
    const timer = window.setInterval(poll, POLL_MS);
    // A phone that comes back from the lock screen should not wait out an interval.
    const onVisible = () => {
      if (document.visibilityState === 'visible') poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    poll();
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [id, phase]);
};
