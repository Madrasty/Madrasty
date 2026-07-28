import { forwardRef, useId, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

// DESIGN.md "Input Fields": label above field, 1px border, primary-blue focus
// border. The field itself is the shared `.field` class (styles/index.css) so a
// hand-rolled <input className="field"> elsewhere is pixel-identical to this.
// `text-start` + logical padding keep the whole thing RTL-safe.
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, id, className = '', ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;

    return (
      <div className="flex flex-col gap-unit-xs text-start">
        {label && (
          <label htmlFor={inputId} className="text-label-md text-on-surface-variant">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={Boolean(error)}
          className={`field placeholder:text-outline ${className}`}
          {...props}
        />
        {error && <span className="text-label-sm text-error">{error}</span>}
      </div>
    );
  },
);
Input.displayName = 'Input';
