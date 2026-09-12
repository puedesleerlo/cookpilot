import type { HTMLAttributes, ReactNode } from 'react';

type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  /** `deep` recedes, `wash` carries a tint, `plain` sits on the ground. */
  tone?: 'plain' | 'deep' | 'wash';
  /** Cards use a non-uniform radius on purpose — nothing here is a perfect rounded rect. */
  radius?: 'sm' | 'md' | 'lg';
};

const TONE = {
  plain: 'bg-cream border border-line',
  deep: 'bg-cream-deep border-0',
  wash: 'bg-sage-wash border-0',
} as const;

export const Card = ({ children, tone = 'plain', radius = 'lg', className = '', ...rest }: CardProps) => (
  <div
    data-testid="card"
    className={`rounded-${radius} p-5 shadow-1 ${TONE[tone]} ${className}`}
    {...rest}
  >
    {children}
  </div>
);

type StatProps = {
  value: ReactNode;
  label: ReactNode;
  tone?: 'plain' | 'good' | 'warn';
};

export const Stat = ({ value, label, tone = 'plain' }: StatProps) => (
  <div
    className={`rounded-md p-4 ${
      tone === 'good' ? 'bg-sage-wash' : tone === 'warn' ? 'bg-tomato-wash' : 'bg-cream-deep'
    }`}
  >
    <div className="voice-numeral text-2xl leading-none">{value}</div>
    <div className="mt-1 text-xs text-ink-soft">{label}</div>
  </div>
);

/**
 * Decorative background. Soft organic shapes and a paper grain, both hidden from
 * assistive technology because neither carries meaning.
 */
export const Blobs = () => (
  <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
    <span className="absolute -left-[12%] -top-[10%] block h-[46vmax] w-[46vmax] rounded-blob bg-tomato-wash opacity-50" />
    <span className="absolute -right-[16%] top-[28%] block h-[52vmax] w-[52vmax] rounded-blob bg-sage-wash opacity-45 [border-radius:var(--r-blob-alt)]" />
    <span className="absolute bottom-[-18%] left-[22%] block h-[38vmax] w-[38vmax] rounded-blob bg-orange-wash opacity-40" />
  </div>
);

/**
 * A paper grain, generated as an inline SVG turbulence so it costs no request and
 * survives offline.
 */
export const Grain = () => (
  <div
    aria-hidden="true"
    className="pointer-events-none fixed inset-0 -z-10 opacity-[0.35] mix-blend-multiply"
    style={{
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23g)' opacity='0.22'/%3E%3C/svg%3E\")",
    }}
  />
);

type SheetProps = { children: ReactNode; title: string; onClose?: () => void };

/** A bottom sheet on mobile, a side panel on desktop. Used for task detail popovers. */
export const Sheet = ({ children, title, onClose }: SheetProps) => (
  <div
    role="dialog"
    aria-label={title}
    className="fixed inset-x-0 bottom-0 z-20 max-h-[80vh] overflow-auto rounded-lg bg-cream p-5 shadow-3
      sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[380px] sm:rounded-lg"
  >
    <div className="mb-3 flex items-start justify-between gap-4">
      <h2 className="voice-display text-lg">{title}</h2>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="grid h-11 w-11 flex-none place-items-center rounded-full text-ink-soft hover:bg-cream-deep"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M3.6 3.4 12.2 12.6M12.4 3.6 3.4 12.4" />
          </svg>
        </button>
      ) : null}
    </div>
    {children}
  </div>
);
