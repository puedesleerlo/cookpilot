import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Glyph } from './Glyph';
import { Motif } from './Motif';

/**
 * The compile moment: one orchestrated sequence, not five independent animations. A paprika
 * curtain drops over the night kitchen and the stages stamp down one by one, in the
 * compiler's own monospace voice.
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

const LAST = COMPILE_STAGES.length - 1;

/** Paper strips hanging from the rail: the curtain, torn at the hem, drawn in from both sides. */
const PLEATS = [
  { ground: 'bg-paprika-700', size: 'flex-[1.2] h-[86%]', from: '-48px' },
  { ground: 'bg-paprika-600', size: 'flex-[0.8] h-[74%]', from: '-36px' },
  { ground: 'bg-paprika-700', size: 'flex-[1] h-[82%]', from: '-24px' },
  { ground: 'bg-paprika', size: 'flex-[1.4] h-[68%]', from: '0px' },
  { ground: 'bg-paprika-700', size: 'flex-[0.9] h-[80%]', from: '24px' },
  { ground: 'bg-paprika-600', size: 'flex-[1.1] h-[90%]', from: '36px' },
  { ground: 'bg-paprika-700', size: 'flex-[1] h-[76%]', from: '48px' },
] as const;

const STAMP = 'motion-safe:animate-[mk-stamp_var(--d-slow)_var(--mk-ease-stamp)_both]';

export const CompileCurtain = ({ active, onDone, stageMs = 520 }: Props) => {
  const reduced = prefersReducedMotion();
  /*
   * Ticks rather than stages: the tick after the last stage is the beat the finished state
   * stays on screen before `onDone`. `onDone` is called from the timer callback or the
   * effect, never from inside a state updater — the parent's update would otherwise land
   * in the middle of this component's render.
   */
  const start = reduced ? LAST + 1 : 0;
  const [tick, setTick] = useState(start);
  const current = useRef(start);
  const done = useRef(false);

  useEffect(() => {
    const finish = () => {
      if (done.current) return;
      done.current = true;
      onDone?.();
    };
    if (!active) {
      done.current = false;
      current.current = start;
      setTick(start);
      return;
    }
    if (reduced) {
      current.current = LAST + 1;
      setTick(LAST + 1);
      finish();
      return;
    }
    const id = window.setInterval(() => {
      if (current.current > LAST) return;
      current.current += 1;
      setTick(current.current);
      if (current.current > LAST) {
        window.clearInterval(id);
        finish();
      }
    }, stageMs);
    return () => window.clearInterval(id);
  }, [active, reduced, start, stageMs, onDone]);

  if (!active) return null;

  const stage = Math.min(tick, LAST);
  const finished = stage >= LAST;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-30 grid place-items-center overflow-hidden bg-night p-5 text-paper"
    >
      {/* The curtain: paprika strips on a rail, a scatter of kitchen crumbs. Decoration only. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute inset-x-0 top-0 flex h-full">
          {PLEATS.map((pleat, i) => (
            <span
              key={i}
              className={`block ${pleat.size} ${pleat.ground} [clip-path:var(--mk-cut-edge-bottom)]
                motion-safe:animate-[mk-slide_var(--d-slow)_var(--mk-ease-simmer)_both]`}
              style={{ '--slide-from': pleat.from, animationDelay: `${i * 35}ms` } as CSSProperties}
            />
          ))}
        </div>
        <span className="absolute inset-x-0 top-0 block h-[18px] bg-plum-900 [clip-path:var(--mk-cut-edge-bottom)]" />
        <span className="absolute inset-x-0 bottom-0 block h-[16%] bg-night [clip-path:var(--mk-cut-edge-top)]" />
        <Motif name="poppy" m1="var(--mk-paper)" className="absolute bottom-[6%] left-[6%] w-[72px] [rotate:-14deg]" />
        <Motif name="spark" m1="var(--mk-marigold)" className="absolute right-[6%] top-[6%] w-[52px] [rotate:20deg]" />
        <Motif name="leaf" m1="var(--mk-garden)" m3="var(--mk-night-bg)" className="absolute bottom-[10%] right-[10%] w-[40px] [rotate:-30deg]" />
        <Motif name="daisy" m1="var(--mk-enamel)" m3="var(--mk-paprika)" className="absolute left-[5%] top-[7%] w-[40px] [rotate:12deg]" />
      </div>

      <div className="relative flex w-full max-w-[500px] flex-col items-center">
        {/* The word the whole screen is saying, stamped again when it changes. */}
        <p
          key={finished ? 'compiled' : 'compiling'}
          className={`voice-display leading-none text-paper [font-size:clamp(3.25rem,17vw,7rem)] [rotate:-3deg] [--stamp-from:-10deg] ${STAMP}`}
        >
          {finished ? 'Compiled' : 'Compiling'}
        </p>

        <div className="relative mt-[4px] w-full pt-[56px]">
          {/* The stamp: a marigold burst while it works, garden once it has compiled. */}
          <div aria-hidden="true" className="absolute left-1/2 top-0 z-10 h-[120px] w-[120px] -translate-x-1/2">
            <span
              key={finished ? 'done' : 'working'}
              className={`absolute inset-0 grid place-items-center ${STAMP} [--stamp-from:-24deg]`}
            >
              <span
                className={`absolute inset-0 [clip-path:var(--mk-cut-burst)] ${finished ? 'bg-garden' : 'bg-marigold'}`}
              />
              <span className={`relative ${finished ? 'text-paper' : 'text-plum-900'}`}>
                <Glyph name={finished ? 'state-success' : 'state-compiling'} size={64} strokeWidth={2.2} />
              </span>
            </span>
          </div>

          <div className="rounded-nick-lg bg-night-surface px-[22px] pb-[26px] pt-[76px] sm:px-[36px]">
            <ul className="flex flex-col gap-3">
              {COMPILE_STAGES.map((label, i) => {
                const reached = i <= stage;
                const last = i === LAST;
                return (
                  <li
                    key={label}
                    className={`voice-compiler flex min-h-[32px] origin-left items-center gap-3 transition-opacity duration-base
                      ${last ? 'text-sm font-bold sm:text-lg' : 'text-sm sm:text-md'} ${last && finished ? 'text-marigold' : ''}
                      ${reached ? `opacity-100 ${STAMP} [--stamp-from:-5deg]` : 'opacity-35'}`}
                  >
                    <StageMark state={i < stage || (last && finished) ? 'done' : i === stage ? 'now' : 'waiting'} />
                    {label}
                  </li>
                );
              })}
            </ul>
            <div className="mt-6 h-[12px] overflow-hidden rounded-nick-xs bg-night-sunken">
              <div
                className="h-full bg-marigold transition-[width] duration-slow ease-simmer"
                style={{ width: `${((stage + 1) / COMPILE_STAGES.length) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/** Done is a ticked green plate, the current stage a turning paprika spark, the rest wait. */
const StageMark = ({ state }: { state: 'done' | 'now' | 'waiting' }) => {
  if (state === 'done') {
    return (
      <span aria-hidden="true" className="relative grid h-[24px] w-[24px] flex-none place-items-center text-paper">
        <span className="absolute inset-0 bg-garden [clip-path:var(--mk-cut-plate)]" />
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="square" className="relative">
          <polyline points="4.5,12.5 9.5,17.5 19.5,6.5" />
        </svg>
      </span>
    );
  }
  if (state === 'now') {
    return (
      <span aria-hidden="true" className="block h-[24px] w-[24px] flex-none bg-paprika [clip-path:var(--mk-cut-burst)] motion-safe:animate-spin" />
    );
  }
  return <span aria-hidden="true" className="block h-[24px] w-[24px] flex-none rounded-nick-xs bg-night-sunken" />;
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
