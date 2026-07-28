import type { ReactNode } from 'react';
import { Icon } from './Icon';

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon: string;
  iconClassName?: string;
  footer?: ReactNode;
}

// Dashboard metric widget (DESIGN.md "Dashboard Widget"): white surface, subtle
// border, label + big value + optional footer. Used across all role dashboards.
export function StatCard({
  label,
  value,
  icon,
  iconClassName = 'text-primary-container',
  footer,
}: StatCardProps) {
  return (
    <div className="flex min-h-[160px] flex-col rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-unit-lg">
      <div className="mb-4 flex items-start justify-between gap-unit-sm">
        <span className="text-label-sm uppercase tracking-[0.12em] text-on-surface-variant">
          {label}
        </span>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-container/12">
          <Icon name={icon} className={`text-[1.25rem] ${iconClassName}`} />
        </span>
      </div>
      <div className="mt-auto">
        <div className="force-ltr text-start text-display-lg-mobile font-bold leading-none text-on-surface">
          {value}
        </div>
        {footer && <div className="mt-3 text-label-md text-on-surface-variant">{footer}</div>}
      </div>
    </div>
  );
}
