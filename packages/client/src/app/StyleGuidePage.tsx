import { useTranslation } from 'react-i18next';
import { Sidebar } from '../components/Sidebar';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { Card } from '../components/Card';
import { LanguageToggle } from '../components/LanguageToggle';

// Temporary landing page for the scaffolded client — a living reference for
// the design tokens ported from FrontEnd Design/madrasty_design_system.
// Replaced once the auth screens (doc 09 build order step 2) land.
const COLOR_SWATCHES = [
  { label: 'primary', className: 'bg-primary text-on-primary' },
  { label: 'primary-container', className: 'bg-primary-container text-on-primary-container' },
  { label: 'secondary', className: 'bg-secondary text-on-secondary' },
  { label: 'secondary-container', className: 'bg-secondary-container text-on-secondary-container' },
  { label: 'tertiary', className: 'bg-tertiary text-on-tertiary' },
  { label: 'tertiary-container', className: 'bg-tertiary-container text-on-tertiary-container' },
  { label: 'error', className: 'bg-error text-on-error' },
  { label: 'surface-container-high', className: 'bg-surface-container-high text-on-surface' },
];

const TYPE_SCALE = [
  { className: 'text-display-lg', label: 'display-lg' },
  { className: 'text-headline-lg', label: 'headline-lg' },
  { className: 'text-headline-md', label: 'headline-md' },
  { className: 'text-body-lg', label: 'body-lg' },
  { className: 'text-body-md', label: 'body-md' },
  { className: 'text-label-md', label: 'label-md' },
  { className: 'text-label-sm uppercase', label: 'label-sm' },
] as const;

export function StyleGuidePage() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-screen bg-background text-on-surface">
      <Sidebar
        items={[
          { labelKey: 'dashboard', icon: 'dashboard', path: '/style-guide' },
          { labelKey: 'learningPrograms', icon: 'school' },
          { labelKey: 'marketplace', icon: 'storefront' },
        ]}
      />

      <main className="app-container flex-1 py-unit-xl md:ms-[280px]">
        <header className="mb-unit-xl flex items-start justify-between gap-unit-md">
          <div>
            <h1 className="text-headline-lg font-bold">{t('styleGuide.title')}</h1>
            <p className="text-body-md text-on-surface-variant">{t('styleGuide.subtitle')}</p>
          </div>
          <LanguageToggle />
        </header>

        <section className="mb-unit-xl">
          <h2 className="mb-unit-md text-label-sm uppercase text-on-surface-variant">
            {t('styleGuide.colors')}
          </h2>
          <div className="grid grid-cols-2 gap-unit-sm sm:grid-cols-4">
            {COLOR_SWATCHES.map((swatch) => (
              <div
                key={swatch.label}
                className={`flex h-20 flex-col justify-end rounded-lg p-unit-sm text-label-sm ${swatch.className}`}
              >
                {swatch.label}
              </div>
            ))}
          </div>
        </section>

        <section className="mb-unit-xl">
          <h2 className="mb-unit-md text-label-sm uppercase text-on-surface-variant">
            {t('styleGuide.typography')}
          </h2>
          <div className="flex flex-col gap-unit-sm">
            {TYPE_SCALE.map((style) => (
              <div key={style.label} className="flex items-baseline gap-unit-md">
                <span className="w-32 shrink-0 text-label-sm text-on-surface-variant">
                  {style.label}
                </span>
                <span className={style.className}>{t('app.name')}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-unit-xl">
          <h2 className="mb-unit-md text-label-sm uppercase text-on-surface-variant">
            {t('styleGuide.buttons')}
          </h2>
          <div className="flex flex-wrap items-center gap-unit-md">
            <Button variant="primary">{t('actions.continue')}</Button>
            <Button variant="secondary">{t('actions.cancel')}</Button>
            <Button variant="primary" size="large">
              {t('actions.save')}
            </Button>
          </div>
        </section>

        <section className="mb-unit-xl max-w-sm">
          <h2 className="mb-unit-md text-label-sm uppercase text-on-surface-variant">
            {t('styleGuide.inputs')}
          </h2>
          <Input
            label={t('styleGuide.sampleInputLabel')}
            placeholder={t('styleGuide.sampleInputPlaceholder')}
          />
        </section>

        <section>
          <h2 className="mb-unit-md text-label-sm uppercase text-on-surface-variant">
            {t('styleGuide.cards')}
          </h2>
          <Card className="max-w-sm">
            <h3 className="text-headline-md">{t('styleGuide.cardSample.title')}</h3>
            <p className="mt-unit-xs text-body-md text-on-surface-variant">
              {t('styleGuide.cardSample.body')}
            </p>
            <div className="mt-unit-md h-2 w-full rounded-full bg-surface-container-high">
              <div className="h-2 w-3/5 rounded-full bg-secondary" />
            </div>
            <p className="mt-unit-xs text-label-sm text-on-surface-variant">
              {t('styleGuide.cardSample.progress')}
            </p>
          </Card>
        </section>
      </main>
    </div>
  );
}
