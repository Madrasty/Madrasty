import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { LanguageToggle } from './LanguageToggle';
import { RoleSwitcher } from './RoleSwitcher';
import { useAuth } from '../features/auth/AuthProvider';
import type { DashboardRole } from '../app/navigation';

interface TopBarProps {
  role: DashboardRole;
}

// Docked header, offset by the 280px sidebar on desktop. `md:ms-[280px]` uses
// margin-inline-start so it sits correctly on either side in RTL/LTR.
export function TopBar({ role }: TopBarProps) {
  const { t } = useTranslation();
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate('/', { replace: true });
  }

  return (
    <header className="fixed top-0 z-30 flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface/80 px-unit-lg backdrop-blur-md md:ms-[280px] md:w-[calc(100%-280px)]">
      <div className="text-headline-md font-black text-primary md:hidden">{t('app.name')}</div>

      <div className="ms-auto flex items-center gap-unit-md">
        {/* RoleSwitcher is a preview affordance until every role's login exists. */}
        <RoleSwitcher current={role} />
        <LanguageToggle />
        <button
          type="button"
          aria-label={t('topbar.notifications')}
          className="rounded-full p-1 text-on-surface-variant transition-colors hover:text-primary"
        >
          <Icon name="notifications" />
        </button>
        {status === 'authenticated' && user ? (
          <div className="flex items-center gap-unit-sm">
            {user.fullName && (
              <span className="hidden text-label-md text-on-surface-variant sm:inline">
                {user.fullName}
              </span>
            )}
            <Link
              to="/account/password"
              aria-label={t('auth.changePassword.title')}
              title={t('auth.changePassword.title')}
              className="rounded-full p-1 text-on-surface-variant transition-colors hover:text-primary"
            >
              <Icon name="lock_reset" />
            </Link>
            <button
              type="button"
              onClick={onLogout}
              aria-label={t('auth.actions.logout')}
              className="rounded-full p-1 text-on-surface-variant transition-colors hover:text-primary"
            >
              <Icon name="logout" />
            </button>
          </div>
        ) : (
          <div className="h-8 w-8 overflow-hidden rounded-full border border-outline-variant bg-surface-container-highest" />
        )}
      </div>
    </header>
  );
}
