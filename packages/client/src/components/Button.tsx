import { forwardRef, type ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary';
type ButtonSize = 'standard' | 'large';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

// DESIGN.md "Buttons": primary = solid blue, secondary = ghost w/ outline
// border + primary text. Sizes: standard 40px, large 56px (landing pages).
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-on-primary hover:opacity-90',
  secondary:
    'bg-transparent text-primary border border-outline-variant hover:bg-surface-container-low',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  standard: 'h-10 px-unit-md text-label-md',
  large: 'h-14 px-unit-lg text-body-lg',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'standard', className = '', ...props }, ref) => (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-unit-sm rounded font-medium transition-all disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-container ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
