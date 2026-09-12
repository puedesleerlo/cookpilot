import type { HTMLAttributes, ReactNode } from 'react';
import { Motif } from './Motif';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  /** `plain` is a surface on the page, `deep` recedes into a well, `wash` carries a garden tint. */
  tone?: 'plain' | 'deep' | 'wash';
  /** Scissor nicks, never a perfect rounded rect. */
  radius?: 'sm' | 'md' | 'lg';
};

/** Makitra separates by colour, not by shadow or border: a card is surface on the ground. */
const TONE = {
  plain: 'bg-surface',
  deep: 'bg-sunken',
  wash: 'bg-garden-100',
} as const;

export const Card = ({ children, tone = 'plain', radius = 'lg', className = '', ...rest }: CardProps) => (
  <div data-testid="card" className={`rounded-${radius} p-5 ${TONE[tone]} ${className}`} {...rest}>
    {children}
  </div>
);

type StatProps = {
  value: ReactNode;
  label: ReactNode;
  tone?: 'plain' | 'good' | 'warn';
};

const STAT_TONE = {
  plain: 'bg-sunken text-ink',
  good: 'bg-garden-100 text-garden-700',
  warn: 'bg-paprika-100 text-paprika-700',
} as const;

/** A big number cut out of paper, with what it counts underneath. */
export const Stat = ({ value, label, tone = 'plain' }: StatProps) => (
  <div className={`relative overflow-hidden rounded-nick-md px-4 pb-3 pt-4 ${STAT_TONE[tone]}`}>
    <div className="voice-display text-3xl leading-none">{value}</div>
    <div className="mt-2 text-xs font-semibold text-ink [font-variation-settings:var(--mk-sharp)]">{label}</div>
  </div>
);

/**
 * The table the paper is cut on. Scissor-cut shapes crowd the edges of the viewport — a
 * paprika shard, a marigold burst, a plum plate, scattered poppy seed and leaves — and leave
 * the middle to the content. Hidden from assistive technology: none of it means anything.
 *
 * Exported as Blobs as well, the name it replaced, so nothing that mounts it has to change.
 */
export const Backdrop = () => (
  <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
    {/*
      Sized in vmax on wide screens and in vw on phones: on a portrait phone vmax is the
      height, so the same shapes would reach halfway across the text column. On phones the
      side shapes stay in the corners and the plum plate, which sits mid-height beside the
      copy, is left out.
    */}
    <span className="absolute -left-[22vw] -top-[20vw] block h-[46vw] w-[52vw] rotate-[-14deg] bg-paprika [clip-path:var(--mk-cut-shard)] sm:-left-[16vmax] sm:-top-[13vmax] sm:h-[20vmax] sm:w-[24vmax]" />
    <span className="absolute -left-[14vw] top-[12vw] block h-[10vw] w-[30vw] rotate-[8deg] bg-enamel [clip-path:var(--mk-cut-tag)] sm:-left-[10vmax] sm:top-[5vmax] sm:h-[5vmax] sm:w-[15vmax]" />
    <span className="absolute -right-[19vmax] top-[42%] hidden h-[26vmax] w-[26vmax] rotate-[18deg] bg-mk-plum [clip-path:var(--mk-cut-plate)] sm:block" />
    <span className="absolute -bottom-[24vw] -right-[22vw] block h-[50vw] w-[50vw] rotate-[6deg] bg-marigold [clip-path:var(--mk-cut-burst)] sm:-bottom-[17vmax] sm:-right-[13vmax] sm:h-[30vmax] sm:w-[30vmax]" />
    <span className="absolute -bottom-[14vw] -left-[10vw] block h-[24vw] w-[44vw] rotate-[-5deg] bg-garden-100 [clip-path:var(--mk-cut-patch)] sm:-bottom-[10vmax] sm:-left-[6vmax] sm:h-[14vmax] sm:w-[26vmax]" />
    <Motif name="poppy" className="absolute right-[6vw] top-[3vw] w-[12vw] rotate-[12deg] sm:right-[6vmax] sm:top-[2vmax] sm:w-[5vmax]" m1="var(--mk-plum-900)" />
    <Motif name="leaf" className="absolute -right-[1.5vmax] top-[34%] hidden w-[4.5vmax] -rotate-[28deg] sm:block" m1="var(--mk-garden)" m3="var(--mk-plum)" />
    <Motif name="spark" className="absolute bottom-[16vw] right-[26vw] w-[7vw] sm:bottom-[9vmax] sm:right-[13vmax] sm:w-[3.5vmax]" m1="var(--mk-cornflower)" />
    <Motif name="daisy" className="absolute bottom-[3vw] left-[2vw] w-[10vw] rotate-[20deg] sm:bottom-[2vmax] sm:left-[1vmax] sm:w-[4.5vmax]" m1="var(--mk-marigold)" m3="var(--mk-paprika)" />
  </div>
);

export const Blobs = Backdrop;

/**
 * A paper grain, generated as an inline SVG turbulence so it costs no request and
 * survives offline.
 */
export const Grain = () => (
  <div
    aria-hidden="true"
    className="pointer-events-none fixed inset-0 -z-10 opacity-[0.3] mix-blend-multiply"
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23g)' opacity='0.22'/%3E%3C/svg%3E\")",
    }}
  />
);

type SheetProps = { children: ReactNode; title: string; onClose?: () => void };

/**
 * A bottom sheet on mobile, a side panel on desktop. Used for task detail popovers.
 * Flat like everything else: it sits apart by colour, with a torn paprika strip along its
 * leading edge.
 */
export const Sheet = ({ children, title, onClose }: SheetProps) => (
  <div
    role="dialog"
    aria-label={title}
    className="fixed inset-x-0 bottom-0 z-40 max-h-[80vh] overflow-auto rounded-nick-lg bg-flour px-5 pb-5 pt-0
      sm:inset-y-3 sm:left-auto sm:right-3 sm:max-h-none sm:w-[400px] sm:rounded-nick-lg"
  >
    <span aria-hidden="true" className="-mx-5 mb-4 block h-4 bg-paprika [clip-path:var(--mk-cut-edge-bottom)]" />
    <div className="mb-3 flex items-start justify-between gap-4">
      <h2 className="voice-display text-xl">{title}</h2>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="mk-btn mk-btn--icon flex-none"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true">
            <path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" />
          </svg>
        </button>
      ) : null}
    </div>
    {children}
  </div>
);
