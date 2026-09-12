import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Glyph, type GlyphName } from './Glyph';

type Variant = 'primary' | 'secondary' | 'quiet' | 'danger';
type Size = 'md' | 'lg';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-tomato-deep text-cream border-0 shadow-2 hover:brightness-110',
  secondary: 'bg-cream text-charcoal border-[1.5px] border-line-strong shadow-1 hover:bg-cream-deep',
  quiet: 'bg-transparent text-tomato-ink border-0 underline underline-offset-4 hover:text-charcoal',
  danger: 'bg-cream text-danger border-[1.5px] border-danger shadow-1 hover:bg-tomato-wash',
};

/** `lg` is the cooking-mode size: a 56px target you can hit with wet hands. */
const SIZE: Record<Size, string> = {
  md: 'min-h-[44px] px-5 py-3 text-sm',
  lg: 'min-h-[56px] px-6 py-4 text-md',
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
  <button
    type={type}
    className={`inline-flex items-center justify-center gap-2 rounded-sm font-ui font-bold
      transition-[filter,background-color] duration-fast ease-out
      disabled:cursor-not-allowed disabled:opacity-50
      ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    {...rest}
  >
    {icon ? <Glyph name={icon} size={size === 'lg' ? 26 : 20} /> : null}
    {children}
  </button>
);
