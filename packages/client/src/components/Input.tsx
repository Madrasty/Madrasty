import { forwardRef, useId, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

// DESIGN.md "Input Fields": label above field, 1px border, primary-blue
// focus ring. `text-start` + logical padding keep this RTL-safe.
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
          className={`h-10 rounded border bg-surface-container-lowest px-unit-md text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary-container/40 ${
            error ? 'border-error' : 'border-outline-variant'
          } ${className}`}
          {...props}
        />
        {error && <span className="text-label-sm text-error">{error}</span>}
      </div>
    );
  },
);
Input.displayName = 'Input';
