interface ProgressBarProps {
  /** 0–100. */
  value: number;
  className?: string;
  /** Track fill colour utility (default secondary/emerald per DESIGN.md). */
  barClassName?: string;
}

// DESIGN.md: progress uses the secondary (emerald) colour. Width is inline
// because the value is dynamic; the bar itself flips side correctly under RTL
// since flex/inline layout is direction-aware.
export function ProgressBar({
  value,
  className = '',
  barClassName = 'bg-secondary',
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-surface-container-high ${className}`}>
      <div className={`h-full rounded-full ${barClassName}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}
