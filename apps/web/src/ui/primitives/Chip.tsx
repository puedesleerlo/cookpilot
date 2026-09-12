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
  /**
   * Makes the chip's body a control in its own right. With `onRemove` as well, the body
   * becomes an inner button rather than wrapping one — a button inside a button is invalid
   * markup and leaves screen readers announcing one control where there are two.
   */
  onClick?: () => void;
  /** The body control's accessible name, when tapping the chip does something specific. */
  actionLabel?: string;
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
  actionLabel,
  settle = false,
}: Props) => {
  const nested = Boolean(onClick && onRemove);
  const Tag = onClick && !nested ? 'button' : 'span';
  const Body = nested ? 'button' : 'span';
  return (
    <Tag
      {...(onClick && !nested ? { type: 'button' as const, onClick } : {})}
      data-settle={settle || undefined}
      className={`inline-flex min-h-[44px] items-center gap-2 rounded-nick-md py-1 pl-2 pr-3 text-sm
        font-ui font-semibold text-ink [font-variation-settings:var(--mk-sharp)]
        ${urgent ? 'bg-paprika-100' : unrecognised ? 'bg-sunken' : 'bg-surface'}
        ${assumed ? 'border-2 border-dashed border-edge' : 'border-2 border-transparent'}
        ${onClick ? 'cursor-pointer transition-transform duration-fast ease-stamp hover:-rotate-1 active:translate-y-px' : ''}
        ${settle ? 'motion-safe:animate-[chip-settle_var(--d-base)_var(--ease-settle)_both]' : ''}`}
    >
      <Body
        {...(nested
          ? { type: 'button' as const, onClick, 'aria-label': actionLabel }
          : {})}
        className="inline-flex items-center gap-2"
      >
        {icon ? (
          <span
            aria-hidden="true"
            className={`grid h-[32px] w-[32px] flex-none place-items-center rounded-nick-sm ${
              urgent
                ? 'bg-paprika-600 text-paper'
                : unrecognised
                  ? 'bg-flour-deep text-muted'
                  : 'bg-garden-100 text-garden-700'
            }`}
          >
            <Glyph name={icon} size={22} strokeWidth={1.9} />
          </span>
        ) : null}
        {children}
        {urgent ? (
          <span className="mk-tag [--tag-bg:var(--mk-paprika-600)] [--tag-fg:var(--mk-paper)]">today</span>
        ) : null}
        {assumed ? <span className="text-xs italic text-muted">assumed</span> : null}
        {unrecognised ? <span className="mk-tag mk-tag--warning">not sure</span> : null}
      </Body>
      {onRemove ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove ${label ?? (typeof children === 'string' ? children : 'this')}`}
          className="-my-1 ml-1 grid h-[40px] w-[40px] place-items-center rounded-nick-sm text-muted hover:bg-sunken hover:text-ink"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" aria-hidden="true">
            <path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" />
          </svg>
        </button>
      ) : null}
    </Tag>
  );
};
