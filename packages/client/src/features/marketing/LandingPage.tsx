import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/Button';
import { LanguageToggle } from '../../components/LanguageToggle';
import { dashboardPath } from '../../app/navigation';

const FEATURES = [
  { key: 'feature1', icon: 'menu_book', span: true },
  { key: 'feature2', icon: 'psychology', span: false },
  { key: 'feature3', icon: 'record_voice_over', span: false },
  { key: 'feature4', icon: 'monitoring', span: true },
] as const;

const PREVIEW_LINKS = [
  { key: 'openStudent', to: dashboardPath('student'), icon: 'dashboard' },
  { key: 'openParent', to: dashboardPath('parent'), icon: 'family_restroom' },
  { key: 'openTeacher', to: dashboardPath('teacher'), icon: 'co_present' },
  { key: 'openAdmin', to: dashboardPath('admin'), icon: 'shield_person' },
  { key: 'openPlayer', to: '/learn', icon: 'play_circle' },
] as const;

export function LandingPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <header className="fixed top-0 z-50 flex h-16 w-full items-center border-b border-outline-variant bg-surface/80 backdrop-blur-md">
        <div className="app-container flex w-full items-center justify-between">
          <div className="text-headline-lg font-black text-primary">{t('app.name')}</div>
          <nav className="hidden gap-unit-lg md:flex">
            <a href="#features" className="text-label-md text-on-surface-variant hover:text-primary">
              {t('landing.navFeatures')}
            </a>
            <a href="#preview" className="text-label-md text-on-surface-variant hover:text-primary">
              {t('landing.previewNote')}
            </a>
          </nav>
          <div className="flex items-center gap-unit-md">
            <LanguageToggle />
            <Link to="/login" className="hidden text-label-md font-semibold text-primary md:block">
              {t('landing.login')}
            </Link>
            <Link to="/register">
              <Button variant="primary">{t('landing.getStarted')}</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="pt-24">
        {/* Hero */}
        <section className="app-container grid grid-cols-1 items-center gap-unit-xl pb-24 pt-unit-xl lg:grid-cols-2">
          <div className="flex flex-col gap-unit-lg">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-outline-variant bg-surface-container-high px-3 py-1">
              <Icon name="school" className="text-[1rem] text-primary" />
              <span className="text-label-sm text-primary">{t('landing.badge')}</span>
            </span>
            <h1 className="text-display-lg-mobile font-bold md:text-display-lg">
              {t('landing.heroTitle')}
            </h1>
            <p className="max-w-xl text-body-lg text-on-surface-variant">{t('landing.heroSubtitle')}</p>
            <div className="mt-unit-sm flex flex-wrap gap-unit-md">
              <Link to="/register/student">
                <Button variant="primary" size="large">
                  {t('landing.joinAsStudent')}
                  <Icon name="arrow_forward" className="text-[1rem]" />
                </Button>
              </Link>
              <Link to="/register/teacher">
                <Button variant="secondary" size="large">
                  {t('landing.forEducators')}
                </Button>
              </Link>
            </div>
            <p className="mt-unit-sm text-label-sm text-on-surface-variant">{t('landing.trustedBy')}</p>
          </div>
          <div className="relative flex h-[320px] items-end justify-center overflow-hidden rounded-xl border border-outline-variant bg-gradient-to-br from-primary-container/20 to-surface-container lg:h-[460px]">
            <Icon name="hub" className="absolute text-[10rem] text-primary/20" />
            <div className="m-unit-md flex w-[calc(100%-2rem)] items-center gap-4 rounded-lg border border-outline-variant bg-surface/90 p-4 backdrop-blur">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
                <Icon name="analytics" />
              </span>
              <div>
                <div className="text-label-md font-bold">{t('landing.feature2Title')}</div>
                <div className="text-label-sm text-on-surface-variant">{t('landing.feature4Title')}</div>
              </div>
            </div>
          </div>
        </section>

        {/* Features bento */}
        <section id="features" className="app-container py-unit-xl">
          <div className="mb-12 text-center">
            <h2 className="mb-4 text-headline-lg">{t('landing.sectionTitle')}</h2>
            <p className="mx-auto max-w-2xl text-body-lg text-on-surface-variant">
              {t('landing.sectionSubtitle')}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {FEATURES.map((feature) => (
              <div
                key={feature.key}
                className={`flex flex-col rounded-xl border border-outline-variant bg-surface-container-lowest p-8 transition-transform hover:-translate-y-0.5 ${
                  feature.span ? 'md:col-span-2' : ''
                }`}
              >
                <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-container/10 text-primary">
                  <Icon name={feature.icon} />
                </span>
                <h3 className="mb-2 text-headline-md">{t(`landing.${feature.key}Title`)}</h3>
                <p className="text-body-md text-on-surface-variant">{t(`landing.${feature.key}Body`)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Dashboard preview links — dev/demo entry points into each role shell */}
        <section id="preview" className="app-container pb-unit-xl">
          <div className="rounded-xl border border-outline-variant bg-surface-container-low p-unit-lg">
            <h2 className="mb-unit-md text-headline-md">{t('landing.previewNote')}</h2>
            <div className="grid grid-cols-2 gap-unit-md md:grid-cols-5">
              {PREVIEW_LINKS.map((link, index) => (
                <Link
                  key={`${link.key}-${index}`}
                  to={link.to}
                  className="flex flex-col items-center gap-unit-sm rounded-lg border border-outline-variant bg-surface-container-lowest p-unit-md text-center transition-transform hover:-translate-y-0.5"
                >
                  <Icon name={link.icon} className="text-[1.75rem] text-primary" />
                  <span className="text-label-md">{t(`landing.${link.key}`)}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
