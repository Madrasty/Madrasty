interface IconProps {
  /** Material Symbols name, e.g. "dashboard", "arrow_forward". */
  name: string;
  /** Solid fill (default is outlined). */
  filled?: boolean;
  className?: string;
}

// Thin wrapper over the self-hosted Material Symbols font (see index.css).
// Icons are decorative here — real labels live next to them — so aria-hidden.
export function Icon({ name, filled = false, className = '' }: IconProps) {
  return (
    <span
      aria-hidden="true"
      className={`material-symbols-outlined ${className}`}
      style={filled ? { fontVariationSettings: "'FILL' 1" } : undefined}
    >
      {name}
    </span>
  );
}
