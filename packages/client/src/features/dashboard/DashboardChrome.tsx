import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/Icon';

// Shared bits for the role dashboards so they read consistently.

export function DashboardHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-headline-lg font-semibold">{title}</h1>
      <p className="mt-1 text-body-md text-on-surface-variant">{subtitle}</p>
    </div>
  );
}

export function DashboardError() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-unit-sm rounded-xl border border-dashed border-error/40 bg-error/5 p-unit-md text-error">
      <Icon name="error" className="text-[1.5rem]" />
      <p className="text-body-md font-semibold">{t('dashboard.loadError')}</p>
    </div>
  );
}
