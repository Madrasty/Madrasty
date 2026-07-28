import { forwardRef, type ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'tonal' | 'ghost' | 'danger';
type ButtonSize = 'small' | 'standard' | 'large';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Square-ish control (radius `md`) instead of the default pill. */
  square?: boolean;
}

// DESIGN.md "Buttons". Every variant is written in colour *roles* only, so the
// dark theme is a re-point of those roles and needs no `dark:` variant here.
//  - primary   solid brand fill, the one call to action on a screen
//  - secondary outlined, sits on any surface; hover borrows the brand border
//  - tonal     soft brand wash, for a second action that still reads as brand
//  - ghost     no chrome until hover — toolbars, table rows, nav
//  - danger    destructive confirmation only
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:opacity-90',
  secondary:
    'border border-outline-variant bg-surface-container-lowest text-on-surface hover:border-primary-container hover:text-primary-container',
  tonal: 'bg-primary-fixed text-on-primary-fixed hover:opacity-90',
  ghost: 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
  danger: 'bg-error text-on-error hover:opacity-90',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  small: 'h-9 px-unit-md text-label-md',
  standard: 'h-11 px-unit-lg text-label-md',
  large: 'h-14 px-unit-xl text-body-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'standard', square = false, className = '', ...props }, ref) => (
    <button
      ref={ref}
      className={`inline-flex shrink-0 items-center justify-center gap-unit-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 ${
        square ? 'rounded-md' : 'rounded-full'
      } ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

// Icon-only companion to Button — same variants, forced square aspect so the
// icon stays centred. Callers must pass an aria-label (there is no text).
export const IconButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ size = 'small', className = '', ...props }, ref) => (
    <Button
      ref={ref}
      size={size}
      className={`aspect-square !px-0 ${size === 'small' ? 'w-9' : size === 'standard' ? 'w-11' : 'w-14'} ${className}`}
      {...props}
    />
  ),
);
IconButton.displayName = 'IconButton';
