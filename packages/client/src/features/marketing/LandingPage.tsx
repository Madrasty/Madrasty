import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { LanguageToggle } from '../../components/LanguageToggle';
import { ThemeToggle } from '../../components/ThemeToggle';
import { Logo } from '../../components/Logo';
import { Card } from '../../components/Card';
import { Chip, Section } from '../../components/ui';

// The page is a fixed set of sections; only the copy inside them is localized,
// so the structure lives here and the strings live in common.json.
const NAV_ANCHORS = ['roles', 'features'] as const;

const ROLE_CARDS = [
  { key: 'parent', icon: 'family_restroom' },
  { key: 'student', icon: 'school' },
  { key: 'teacher', icon: 'cast_for_education' },
] as const;

const FEATURES = [
  { key: 'feature1', icon: 'menu_book' },
  { key: 'feature2', icon: 'psychology' },
  { key: 'feature3', icon: 'record_voice_over' },
  { key: 'feature4', icon: 'monitoring' },
  { key: 'feature5', icon: 'forum' },
  { key: 'feature6', icon: 'loyalty' },
] as const;

const HIGHLIGHTS = ['highlight1', 'highlight2', 'highlight3', 'highlight4'] as const;
const HERO_CHIPS = ['chip1', 'chip2', 'chip3', 'chip4'] as const;

// Shared shape for the small outlined controls in the header.
const headerPill =
  'inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-outline-variant px-3 text-label-md text-on-surface-variant transition-colors hover:border-primary-container hover:text-primary-container';

function LandingNav() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  // The mobile panel is a full-width overlay; closing it on resize avoids it
  // being left open behind the desktop layout.
  useEffect(() => {
    if (!open) return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const close = () => setOpen(false);
    mq.addEventListener('change', close);
    return () => mq.removeEventListener('change', close);
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-outline-variant/60 bg-surface/85 backdrop-blur-md">
      <div className="content-container flex h-16 items-center justify-between gap-unit-md">
        <a href="#top" aria-label={t('app.name')} className="shrink-0">
          <Logo size={32} />
        </a>

        <nav aria-label={t('landing.menu')} className="hidden items-center gap-1 lg:flex">
          {NAV_ANCHORS.map((anchor) => (
            <a
              key={anchor}
              href={`#${anchor}`}
              className="rounded-full px-3 py-2 text-label-md text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              {t(`landing.nav_${anchor}`)}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-unit-sm">
          <LanguageToggle />
          <ThemeToggle />

          <Link to="/login" className={`${headerPill} hidden sm:inline-flex`}>
            {t('landing.login')}
          </Link>
          <Link
            to="/register"
            className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-label-md font-semibold text-on-primary transition-opacity hover:opacity-90"
          >
            {t('landing.getStarted')}
          </Link>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label={t('landing.menu')}
            aria-expanded={open}
            aria-controls="landing-mobile-nav"
            className={`${headerPill} w-9 !px-0 lg:hidden`}
          >
            <Icon name={open ? 'close' : 'menu'} className="text-[1.125rem]" />
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="landing-mobile-nav"
          aria-label={t('landing.menu')}
          className="border-t border-outline-variant/60 bg-surface lg:hidden"
        >
          <ul className="content-container grid gap-1 py-unit-sm">
            {NAV_ANCHORS.map((anchor) => (
              <li key={anchor}>
                <a
                  href={`#${anchor}`}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-body-md text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
                >
                  {t(`landing.nav_${anchor}`)}
                </a>
              </li>
            ))}
            <li className="sm:hidden">
              <Link
                to="/login"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-body-md text-on-surface-variant"
              >
                {t('landing.login')}
              </Link>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}

function Hero() {
  const { t } = useTranslation();

  return (
    <section id="top" className="relative overflow-hidden">
      {/* Two soft brand-coloured washes; purely decorative. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_50%_0%,var(--color-primary-fixed)_0%,transparent_70%)] opacity-70"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 end-[-10%] -z-10 h-[420px] w-[420px] rounded-full bg-secondary-container opacity-20 blur-3xl"
      />

      <div className="content-container py-unit-xl md:py-28">
        <div className="max-w-3xl">
          <Chip>
            <Icon name="school" className="text-[1rem] text-primary-container" />
            {t('landing.badge')}
          </Chip>

          <h1 className="mt-unit-lg text-display-lg-mobile text-on-surface md:text-display-lg">
            {t('landing.heroTitle')}{' '}
            <span className="bg-gradient-to-r from-primary-container to-secondary bg-clip-text text-transparent">
              {t('landing.heroTitleAccent')}
            </span>
          </h1>

          <p className="mt-unit-lg max-w-2xl text-body-lg text-on-surface-variant">
            {t('landing.heroSubtitle')}
          </p>

          <div className="mt-unit-lg flex flex-wrap items-center gap-unit-md">
            <Link
              to="/register/student"
              className="inline-flex h-12 items-center gap-unit-sm rounded-full bg-primary px-unit-lg text-label-md font-semibold text-on-primary transition-opacity hover:opacity-90"
            >
              {t('landing.joinAsStudent')}
              <Icon name="arrow_forward" className="text-[1.125rem] rtl:-scale-x-100" />
            </Link>
            <Link
              to="/register/teacher"
              className="inline-flex h-12 items-center gap-unit-sm rounded-full border border-outline-variant bg-surface-container-lowest px-unit-lg text-label-md font-semibold text-on-surface transition-colors hover:border-primary-container hover:text-primary-container"
            >
              {t('landing.forEducators')}
            </Link>
          </div>

          <ul className="mt-unit-lg flex flex-wrap gap-unit-sm">
            {HERO_CHIPS.map((chip) => (
              <li key={chip}>
                <Chip>{t(`landing.${chip}`)}</Chip>
              </li>
            ))}
          </ul>
        </div>

        {/* Facts about the platform, not marketing numbers — each one is
            something the product actually does. */}
        <dl className="mt-unit-xl grid grid-cols-2 gap-unit-md border-t border-outline-variant/60 pt-unit-lg md:grid-cols-4">
          {HIGHLIGHTS.map((highlight) => (
            <div key={highlight}>
              <dt className="force-ltr text-start text-[32px] font-bold leading-none text-primary-container">
                {t(`landing.${highlight}Value`)}
              </dt>
              <dd className="mt-2 text-label-md text-on-surface-variant">
                {t(`landing.${highlight}Label`)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Roles() {
  const { t } = useTranslation();

  return (
    <Section
      id="roles"
      kicker={t('landing.rolesKicker')}
      title={t('landing.rolesTitle')}
      lead={t('landing.rolesLead')}
    >
      <ul className="grid gap-unit-md md:grid-cols-3">
        {ROLE_CARDS.map(({ key, icon }) => (
          <Card as="li" key={key} className="flex flex-col">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-container/12 text-primary-container">
              <Icon name={icon} className="text-[1.375rem]" />
            </span>

            <h3 className="mt-unit-md text-headline-md text-on-surface">{t(`roles.${key}`)}</h3>
            <p className="mt-1 text-body-md text-on-surface-variant">
              {t(`landing.role_${key}Tagline`)}
            </p>

            <p className="mt-unit-lg text-label-sm uppercase tracking-[0.12em] text-on-surface-variant">
              {t('landing.canLabel')}
            </p>
            <ul className="mt-unit-sm grid flex-1 gap-unit-sm">
              {[1, 2, 3].map((n) => (
                <li key={n} className="flex gap-unit-sm text-label-md text-on-surface-variant">
                  <Icon name="check" className="mt-0.5 shrink-0 text-[1rem] text-secondary" />
                  <span>{t(`landing.role_${key}Can${n}`)}</span>
                </li>
              ))}
            </ul>

            {/* The boundary that defines the role — the rule the platform
                enforces server-side, not a feature. */}
            <p className="mt-unit-lg border-s-2 border-primary-container ps-unit-sm text-label-md text-on-surface">
              {t(`landing.role_${key}Note`)}
            </p>
          </Card>
        ))}
      </ul>
    </Section>
  );
}

function Features() {
  const { t } = useTranslation();

  return (
    <Section
      id="features"
      tone="alt"
      kicker={t('landing.featuresKicker')}
      title={t('landing.sectionTitle')}
      lead={t('landing.sectionSubtitle')}
    >
      <ul className="grid gap-unit-md md:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ key, icon }) => (
          <Card as="li" key={key} interactive className="flex flex-col">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-container/12 text-primary-container">
              <Icon name={icon} className="text-[1.375rem]" />
            </span>
            <h3 className="mt-unit-md text-headline-md text-on-surface">
              {t(`landing.${key}Title`)}
            </h3>
            <p className="mt-unit-sm text-body-md text-on-surface-variant">
              {t(`landing.${key}Body`)}
            </p>
          </Card>
        ))}
      </ul>
    </Section>
  );
}

function LandingFooter() {
  const { t } = useTranslation();

  return (
    <footer className="border-t border-outline-variant/60 bg-surface-container-low py-unit-xl">
      <div className="content-container">
        <div className="flex flex-wrap items-start justify-between gap-unit-lg">
          <div className="max-w-md">
            <Logo size={32} />
            <p className="mt-unit-md text-label-md text-on-surface-variant">
              {t('landing.footerTagline')}
            </p>
          </div>

          <nav className="flex flex-col gap-unit-sm" aria-label={t('landing.footerLinksLabel')}>
            {NAV_ANCHORS.map((anchor) => (
              <a
                key={anchor}
                href={`#${anchor}`}
                className="text-label-md text-on-surface-variant transition-colors hover:text-primary-container"
              >
                {t(`landing.nav_${anchor}`)}
              </a>
            ))}
            <Link
              to="/login"
              className="text-label-md text-on-surface-variant transition-colors hover:text-primary-container"
            >
              {t('landing.login')}
            </Link>
            <Link
              to="/register"
              className="text-label-md text-on-surface-variant transition-colors hover:text-primary-container"
            >
              {t('landing.getStarted')}
            </Link>
          </nav>
        </div>

        <p className="mt-unit-lg border-t border-outline-variant/60 pt-unit-md text-label-sm text-outline">
          {t('landing.trustedBy')}
        </p>
      </div>
    </footer>
  );
}

export function LandingPage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <a
        href="#roles"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:start-3 focus:z-[60] focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-label-md focus:text-on-primary"
      >
        {t('landing.skipToContent')}
      </a>

      <LandingNav />

      <main>
        <Hero />
        <Roles />
        <Features />
      </main>

      <LandingFooter />
    </div>
  );
}
