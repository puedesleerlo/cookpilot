import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Glyph, type GlyphName } from './Glyph';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';
type Size = 'md' | 'lg';

/** Makitra's button classes. One primary per screen; the label says what happens. */
const VARIANT: Record<Variant, string> = {
  primary: 'mk-btn--primary',
  secondary: 'mk-btn--secondary',
  quiet: 'mk-btn--quiet',
  danger: 'mk-btn--danger',
};

/** `md` is Makitra's 48px touch target; `lg` is the cooking-mode 60px, for wet hands. */
const SIZE: Record<Size, string> = {
  md: 'min-h-[48px]',
  lg: 'mk-btn--lg min-h-[60px]',
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: GlyphName;
  children: ReactNode;
};

export const Button = ({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  className = '',
  type = 'button',
  ...rest
}: Props) => (
  <button type={type} className={`mk-btn ${VARIANT[variant]} ${SIZE[size]} ${className}`} {...rest}>
    {icon ? <Glyph name={icon} size={size === 'lg' ? 26 : 22} strokeWidth={2} /> : null}
    {children}
  </button>
);
