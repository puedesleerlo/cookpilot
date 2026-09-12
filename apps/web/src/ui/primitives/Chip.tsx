import type { ReactNode } from 'react';
import { Glyph, type GlyphName } from './Glyph';

/**
 * The product's main editing surface. The compiler shows what it heard as a chip and you
 * correct it by tapping. An assumption it made on your behalf is drawn with a dashed
 * outline and says so — never silently folded in.
 */
type Props = {
  icon?: GlyphName;
  children: ReactNode;
  /**
   * The accessible name for the remove control. Without it a pantry of seventeen chips
   * gives a screen-reader user seventeen buttons all called "Remove ingredient".
   */
  label?: string;
  /** Something that has to be used today. */
  urgent?: boolean;
  /** The pipeline assumed this rather than hearing it. */
  assumed?: boolean;
  /** No lexicon entry matched. Kept, and flagged. */
  unrecognised?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
  /** Chips animate in as they are recognised; suppress for a list that is already settled. */
  settle?: boolean;
};

export const Chip = ({
  icon,
  children,
  label,
  urgent = false,
  assumed = false,
  unrecognised = false,
  onRemove,
  onClick,
  settle = false,
}: Props) => {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      data-settle={settle || undefined}
      className={`inline-flex items-center gap-2 rounded-chip bg-cream py-2 pl-3 pr-4 text-sm
        font-ui font-semibold text-charcoal shadow-1 border-[1.5px]
        ${assumed ? 'border-dashed border-line-strong' : 'border-line-strong'}
        ${onClick ? 'cursor-pointer hover:bg-cream-deep' : ''}
        ${settle ? 'motion-safe:animate-[chip-settle_var(--d-base)_var(--ease-settle)_both]' : ''}`}
    >
      {icon ? (
        <span className={urgent ? 'text-tomato' : unrecognised ? 'text-ink-faint' : 'text-sage-ink'}>
          <Glyph name={icon} size={22} />
        </span>
      ) : null}
      {children}
      {urgent ? (
        <span className="rounded-xs bg-tomato-wash px-2 text-xs font-bold text-tomato-ink">today</span>
      ) : null}
      {assumed ? <span className="text-xs italic text-ink-soft">assumed</span> : null}
      {unrecognised ? (
        <span className="rounded-xs bg-cream-sunk px-2 text-xs text-ink-soft">not sure</span>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${label ?? (typeof children === 'string' ? children : 'this')}`}
          className="ml-1 grid h-6 w-6 place-items-center rounded-full text-ink-soft hover:bg-cream-sunk hover:text-charcoal"
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M3.6 3.4 12.2 12.6M12.4 3.6 3.4 12.4" />
          </svg>
        </button>
      ) : null}
    </Tag>
  );
};
