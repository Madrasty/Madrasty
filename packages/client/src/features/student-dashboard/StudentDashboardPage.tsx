import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { ProgressBar } from '../../components/ProgressBar';

export function StudentDashboardPage() {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 gap-unit-xl lg:grid-cols-12">
      {/* Main column */}
      <div className="flex flex-col gap-unit-xl lg:col-span-8">
        <div>
          <h1 className="text-display-lg-mobile font-bold md:text-display-lg">{t('student.greeting')}</h1>
          <p className="text-body-lg text-on-surface-variant">{t('student.subgreeting')}</p>
        </div>

        {/* Continue learning hero */}
        <section>
          <h2 className="mb-unit-md text-headline-md">{t('student.continueLearning')}</h2>
          <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
            <div className="relative flex h-48 items-end bg-gradient-to-br from-primary-container to-surface-tint p-unit-lg">
              <div className="text-on-primary">
                <span className="mb-2 inline-block rounded-full bg-black/20 px-3 py-1 text-label-sm uppercase">
                  {t('student.chapter')}
                </span>
                <h3 className="text-headline-lg text-on-primary">{t('student.programTitle')}</h3>
              </div>
            </div>
            <div className="flex items-center gap-unit-lg p-unit-lg">
              <div className="flex-1">
                <div className="mb-2 flex justify-between text-label-md">
                  <span className="text-on-surface-variant">{t('student.progress')}</span>
                  <span className="font-bold text-secondary">68%</span>
                </div>
                <ProgressBar value={68} />
              </div>
              <Link
                to="/learn"
                className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-label-md text-on-primary"
              >
                {t('actions.resume')}
                <Icon name="arrow_forward" className="text-[1rem]" />
              </Link>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="grid grid-cols-1 gap-unit-md md:grid-cols-2">
          <div className="flex h-48 flex-col justify-between rounded-xl border border-outline-variant bg-surface-container-lowest p-unit-lg">
            <div className="flex items-start justify-between">
              <h3 className="text-label-md uppercase tracking-wide text-on-surface-variant">
                {t('student.weeklyGoal')}
              </h3>
              <Icon name="flag" className="text-secondary" />
            </div>
            <div className="text-display-lg-mobile font-bold">
              4<span className="text-2xl text-outline">/5</span>{' '}
              <span className="text-lg font-normal text-on-surface-variant">{t('student.hours')}</span>
            </div>
            <ProgressBar value={80} />
          </div>
          <div className="flex h-48 flex-col justify-between rounded-xl border border-outline-variant bg-surface-container-lowest p-unit-lg">
            <div className="flex items-start justify-between">
              <h3 className="text-label-md uppercase tracking-wide text-on-surface-variant">
                {t('student.courseCompletion')}
              </h3>
              <Icon name="donut_large" className="text-primary" />
            </div>
            <div className="text-display-lg-mobile font-bold">
              12 <span className="text-lg font-normal text-on-surface-variant">{t('student.courses')}</span>
            </div>
          </div>
        </section>
      </div>

      {/* Right column */}
      <div className="flex flex-col gap-unit-xl lg:col-span-4">
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-unit-lg">
          <h2 className="mb-unit-md text-headline-md">{t('student.schedule')}</h2>
          <div className="flex flex-col gap-unit-md">
            <div className="flex gap-4 rounded-lg p-3">
              <div className="flex h-14 w-14 flex-col items-center justify-center rounded-lg bg-primary-container font-bold text-on-primary-container">
                <span>10</span>
                <span className="text-xs font-normal">AM</span>
              </div>
              <div className="flex-1">
                <h4 className="text-label-md font-bold">{t('student.scheduleItem')}</h4>
                <p className="mt-1 flex items-center gap-1 text-sm text-on-surface-variant">
                  <Icon name="video_camera_front" className="text-[1rem]" /> {t('student.liveClass')}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-unit-lg">
          <h2 className="mb-unit-md text-headline-md">{t('student.recommended')}</h2>
          <div className="flex flex-col gap-unit-sm">
            <div className="flex items-center gap-3 rounded-lg p-2">
              <span className="flex h-12 w-12 items-center justify-center rounded bg-surface-variant text-primary">
                <Icon name="code" />
              </span>
              <div>
                <h4 className="text-label-md font-bold">{t('student.recommendedItem')}</h4>
                <p className="text-xs text-on-surface-variant">{t('nav.marketplace')} · 4.8★</p>
              </div>
            </div>
          </div>
        </section>

        <div className="mt-auto rounded-xl bg-gradient-to-br from-primary-container to-surface-tint p-unit-lg text-on-primary">
          <div className="mb-2 flex items-center gap-2">
            <Icon name="smart_toy" className="text-3xl" />
            <h3 className="text-headline-md font-bold">{t('student.aiAssistant')}</h3>
          </div>
          <p className="text-body-md opacity-90">{t('student.aiAssistantBody')}</p>
          <button className="mt-unit-md rounded-lg bg-surface-container-lowest px-4 py-2 text-label-md text-primary">
            {t('actions.askQuestion')}
          </button>
        </div>
      </div>
    </div>
  );
}
