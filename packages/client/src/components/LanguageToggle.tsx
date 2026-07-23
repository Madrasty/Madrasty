import { useTranslation } from 'react-i18next';
import { Button } from './Button';

// Doc 07 §3: switching should not require a reload — i18next handles that
// live; RTL/LTR follows via useDocumentDirection listening for the change.
export function LanguageToggle() {
  const { i18n, t } = useTranslation();
  const nextLocale = i18n.language === 'ar' ? 'en' : 'ar';

  return (
    <Button variant="secondary" onClick={() => i18n.changeLanguage(nextLocale)}>
      {t('actions.switchLanguage')}
    </Button>
  );
}
