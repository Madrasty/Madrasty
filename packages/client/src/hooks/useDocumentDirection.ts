import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { directionFor } from '../lib/i18n';

// Keeps <html dir/lang> in sync with the active i18next locale. Doc 07 §2:
// direction is set once on the document, never per-component.
export function useDocumentDirection() {
  const { i18n } = useTranslation();

  useEffect(() => {
    const apply = (locale: string) => {
      document.documentElement.dir = directionFor(locale);
      document.documentElement.lang = locale;
    };
    apply(i18n.language);
    i18n.on('languageChanged', apply);
    return () => {
      i18n.off('languageChanged', apply);
    };
  }, [i18n]);
}
