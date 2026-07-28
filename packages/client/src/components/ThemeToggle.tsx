import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import { useTheme } from '../hooks/useTheme';

// Sits next to LanguageToggle in every header. Icon-only: the label is on the
// button, not next to it, so the control row stays compact on mobile.
export function ThemeToggle() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const label = theme === 'dark' ? t('actions.themeToLight') : t('actions.themeToDark');

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-outline-variant text-on-surface-variant transition-colors hover:border-primary-container hover:text-primary-container"
    >
      <Icon name={theme === 'dark' ? 'light_mode' : 'dark_mode'} className="text-[1.125rem]" />
    </button>
  );
}
