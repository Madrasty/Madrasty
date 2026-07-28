import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { LanguageToggle } from './LanguageToggle';
import { ThemeToggle } from './ThemeToggle';
import { Logo } from './Logo';
import { useAuth } from '../features/auth/AuthProvider';

// The circular icon actions on the trailing edge. Same shape as the language
// and theme pills next to them, minus the border, so the row reads as one
// control cluster.
const iconAction =
  'inline-flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary-container';

// Docked header, offset by the 280px sidebar on desktop. `md:ms-[280px]` uses
// margin-inline-start so it sits correctly on either side in RTL/LTR.
export function TopBar() {
  const { t } = useTranslation();
  const { status, user, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate('/', { replace: true });
  }

  return (
    <header className="fixed top-0 z-30 flex h-16 w-full items-center justify-between border-b border-outline-variant/60 bg-surface/85 px-unit-md backdrop-blur-md md:ms-[280px] md:w-[calc(100%-280px)] md:px-unit-lg">
      <Logo size={28} className="md:hidden" />

      <div className="ms-auto flex items-center gap-unit-sm">
        <LanguageToggle />
        <ThemeToggle />
        <button type="button" aria-label={t('topbar.notifications')} className={iconAction}>
          <Icon name="notifications" className="text-[1.125rem]" />
        </button>

        {status === 'authenticated' && user ? (
          <div className="flex items-center gap-unit-sm ps-unit-sm">
            {user.fullName && (
              <span className="hidden max-w-[14ch] truncate text-label-md text-on-surface sm:inline">
                {user.fullName}
              </span>
            )}
            <Link
              to="/account/password"
              aria-label={t('auth.changePassword.title')}
              title={t('auth.changePassword.title')}
              className={iconAction}
            >
              <Icon name="lock_reset" className="text-[1.125rem]" />
            </Link>
            <button
              type="button"
              onClick={onLogout}
              aria-label={t('auth.actions.logout')}
              title={t('auth.actions.logout')}
              className={iconAction}
            >
              <Icon name="logout" className="text-[1.125rem]" />
            </button>
          </div>
        ) : (
          <div className="h-9 w-9 rounded-full border border-outline-variant bg-surface-container-highest" />
        )}
      </div>
    </header>
  );
}
