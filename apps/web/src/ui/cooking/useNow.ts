import { useEffect, useReducer } from 'react';
import { useSync } from '@/app/sync';

/**
 * The server's now, re-read a few times a second.
 *
 * A countdown drawn from this ticks in step on every phone in the kitchen, because every
 * phone is reading the same clock — the server's — through an offset each one measured for
 * itself. Four ticks a second is enough for a seconds display to never look stuck and few
 * enough to leave the battery alone.
 */
export const useNow = (intervalMs = 250): number => {
  const now = useSync((s) => s.now);
  const [, tick] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const timer = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now();
};
