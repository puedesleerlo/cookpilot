import type { InputHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  suffix?: string;
};

export const Field = ({ label, hint, suffix, className = '', ...rest }: FieldProps) => {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-bold text-ink-soft">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          aria-describedby={hint ? hintId : undefined}
          className={`min-h-[44px] w-full rounded-sm border-[1.5px] border-line-strong bg-cream px-3 py-2
            font-ui text-sm text-charcoal placeholder:text-ink-faint ${className}`}
          {...rest}
        />
        {suffix ? <span className="text-sm text-ink-soft">{suffix}</span> : null}
      </div>
      {hint ? (
        <span id={hintId} className="text-xs text-ink-soft">
          {hint}
        </span>
      ) : null}
    </div>
  );
};

type ToggleProps = {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  description?: string;
};

export const Toggle = ({ label, checked, onChange, description }: ToggleProps) => (
  <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-4 rounded-sm px-1 py-2">
    <span>
      <span className="text-sm font-semibold text-charcoal">{label}</span>
      {description ? <span className="block text-xs text-ink-soft">{description}</span> : null}
    </span>
    <span className="relative flex-none">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      <span
        aria-hidden="true"
        className={`block h-7 w-12 rounded-full border-[1.5px] border-line-strong transition-colors duration-fast
          ${checked ? 'bg-sage' : 'bg-cream-sunk'}`}
      >
        <span
          className={`mt-[2px] block h-[20px] w-[20px] rounded-full bg-cream shadow-1 transition-transform duration-fast ease-out
            ${checked ? 'translate-x-[24px]' : 'translate-x-[2px]'}`}
        />
      </span>
    </span>
  </label>
);
