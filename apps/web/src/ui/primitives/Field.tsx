import type { InputHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  suffix?: string;
};

/** Makitra's text field: the label stays visible above, the hint says what to enter. */
export const Field = ({ label, hint, suffix, className = '', ...rest }: FieldProps) => {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="mk-field">
      <label htmlFor={id} className="mk-field__label">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          aria-describedby={hint ? hintId : undefined}
          className={`mk-field__control ${className}`}
          {...rest}
        />
        {suffix ? <span className="text-sm font-semibold text-muted">{suffix}</span> : null}
      </div>
      {hint ? (
        <span id={hintId} className="mk-field__help">
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

/** Makitra's switch: applies right away, no save button. */
export const Toggle = ({ label, checked, onChange, description }: ToggleProps) => {
  const id = useId();
  return (
    <label className="mk-switch" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="mk-switch__track" aria-hidden="true" />
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {description ? <span className="block text-xs text-muted">{description}</span> : null}
      </span>
    </label>
  );
};
