import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import enCommon from '../locales/en/common.json';
import arCommon from '../locales/ar/common.json';
import { config } from './config';

// RTL locales — extend this list as more languages are added (doc 07 §2).
export const RTL_LOCALES = ['ar'];

export function directionFor(locale: string): 'rtl' | 'ltr' {
  return RTL_LOCALES.includes(locale) ? 'rtl' : 'ltr';
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: enCommon },
      ar: { common: arCommon },
    },
    ns: ['common'],
    defaultNS: 'common',
    fallbackLng: config.defaultLocale,
    supportedLngs: config.supportedLocales,
    // Persist choice for guests in localStorage; logged-in users' choice is
    // synced to users.locale_preference once auth is wired in (doc 07 §3).
    // Deliberately no 'navigator' detector — a guest's OS/browser locale is
    // not a reliable signal of which language they want on this platform, so
    // new guests get config.defaultLocale (ar) until they explicitly switch.
    detection: {
      order: ['localStorage'],
      lookupLocalStorage: 'madrasty_locale',
      caches: ['localStorage'],
    },
    interpolation: { escapeValue: false },
  });

export default i18n;
