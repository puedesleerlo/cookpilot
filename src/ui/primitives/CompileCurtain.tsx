import { useEffect, useRef, useState } from 'react';
import { Glyph } from './Glyph';

/**
 * The compile moment: one orchestrated sequence, not five independent animations.
 *
 * The stage labels are the product's voice — compiler vocabulary, in sentence case, with
 * no type names or error codes leaking through. Under reduced motion the curtain lands on
 * its final state immediately; the information is identical, only the movement is gone.
 */
export const COMPILE_STAGES = [
  'reading the pantry',
  'checking dependencies',
  'allocating cookware',
  'optimizing parallel tasks',
  'compilation successful',
] as const;

export type CompileStage = (typeof COMPILE_STAGES)[number];

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

type Props = {
  /** While true the curtain advances. Set false to dismiss. */
  active: boolean;
  /** Called once the sequence reaches its end. */
  onDone?: () => void;
  /** Milliseconds per stage. Ignored under reduced motion. */
  stageMs?: number;
};

export const CompileCurtain = ({ active, onDone, stageMs = 520 }: Props) => {
  const reduced = prefersReducedMotion();
  const [stage, setStage] = useState(() => (reduced ? COMPILE_STAGES.length - 1 : 0));
  const done = useRef(false);

  useEffect(() => {
    if (!active) {
      done.current = false;
      setStage(reduced ? COMPILE_STAGES.length - 1 : 0);
      return;
    }
    if (reduced) {
      setStage(COMPILE_STAGES.length - 1);
      if (!done.current) {
        done.current = true;
        onDone?.();
      }
      return;
    }
    const id = window.setInterval(() => {
      setStage((s) => {
        if (s >= COMPILE_STAGES.length - 1) {
          window.clearInterval(id);
          if (!done.current) {
            done.current = true;
            onDone?.();
          }
          return s;
        }
        return s + 1;
      });
    }, stageMs);
    return () => window.clearInterval(id);
  }, [active, reduced, stageMs, onDone]);

  if (!active) return null;

  const finished = stage >= COMPILE_STAGES.length - 1;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-30 grid place-items-center bg-charcoal/95 p-5 text-cream"
    >
      <div className="w-full max-w-[420px]">
        <div className="mb-5 flex justify-center text-cream">
          <Glyph name={finished ? 'state-success' : 'state-compiling'} size={92} />
        </div>
        <ul className="flex flex-col gap-2">
          {COMPILE_STAGES.map((label, i) => (
            <li
              key={label}
              className={`voice-compiler flex items-center gap-3 text-sm transition-opacity duration-base
                ${i > stage ? 'opacity-35' : 'opacity-100'}`}
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 flex-none rounded-full ${
                  i < stage ? 'bg-sage' : i === stage ? 'bg-tomato' : 'bg-ink-faint'
                }`}
              />
              {label}
            </li>
          ))}
        </ul>
        <div className="mt-5 h-[6px] overflow-hidden rounded-full bg-cream/20">
          <div
            className="h-full bg-tomato transition-[width] duration-base ease-out"
            style={{ width: `${((stage + 1) / COMPILE_STAGES.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
};

type RailProps = { value: number; max: number; label: string; tone?: 'plain' | 'over' };

/** A budget rail: how much of the time budget the session uses. */
export const ProgressRail = ({ value, max, label, tone = 'plain' }: RailProps) => {
  const pct = Math.max(0, Math.min(100, (value / Math.max(max, 1)) * 100));
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-xs font-bold text-ink-soft">{label}</span>
        <span className="voice-numeral text-sm">
          {value} / {max} min
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
        className="h-[10px] overflow-hidden rounded-full bg-cream-sunk"
      >
        <div
          className={`h-full transition-[width] duration-base ease-out ${tone === 'over' ? 'bg-tomato' : 'bg-sage'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};
