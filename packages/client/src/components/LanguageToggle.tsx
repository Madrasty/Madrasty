import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

// Doc 07 §3: switching should not require a reload — i18next handles that
// live; RTL/LTR follows via useDocumentDirection listening for the change.
// Styled as a pill to match ThemeToggle beside it; the language name stays live
// text, so the button's accessible name is the language it switches to.
export function LanguageToggle() {
  const { i18n, t } = useTranslation();
  const nextLocale = i18n.language === 'ar' ? 'en' : 'ar';

  return (
    <button
      type="button"
      onClick={() => void i18n.changeLanguage(nextLocale)}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-outline-variant ps-2.5 pe-3 text-label-md text-on-surface-variant transition-colors hover:border-primary-container hover:text-primary-container"
    >
      <Icon name="language" className="text-[1.125rem]" />
      <span>{t('actions.switchLanguage')}</span>
    </button>
  );
}
