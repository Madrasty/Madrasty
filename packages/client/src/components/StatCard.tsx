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
export function StatCard({ label, value, icon, iconClassName = 'text-primary', footer }: StatCardProps) {
  return (
    <div className="flex min-h-[160px] flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-unit-lg">
      <div className="mb-4 flex items-start justify-between">
        <span className="text-label-md uppercase tracking-wider text-on-surface-variant">{label}</span>
        <Icon name={icon} className={iconClassName} />
      </div>
      <div className="mt-auto">
        <div className="text-display-lg-mobile font-bold text-on-surface">{value}</div>
        {footer && <div className="mt-2">{footer}</div>}
      </div>
    </div>
  );
}
