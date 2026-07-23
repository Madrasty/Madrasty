import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { DASHBOARD_ROLES, dashboardPath, type DashboardRole } from '../app/navigation';

interface RoleSwitcherProps {
  current: DashboardRole;
}

// Dev-only affordance: real role comes from the authenticated session once auth
// is wired in (doc 01 §7). Until then this lets you preview each role's shell.
export function RoleSwitcher({ current }: RoleSwitcherProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <label className="flex items-center gap-unit-sm">
      <span className="sr-only">{t('topbar.roleSwitcher')}</span>
      <select
        value={current}
        onChange={(event) => navigate(dashboardPath(event.target.value as DashboardRole))}
        className="rounded border border-outline-variant bg-surface-container-lowest px-unit-sm py-1 text-label-md text-on-surface outline-none focus:border-primary"
      >
        {DASHBOARD_ROLES.map((role) => (
          <option key={role} value={role}>
            {t(`roles.${role}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
