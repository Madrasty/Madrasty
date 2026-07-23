import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/Button';
import { ProgressBar } from '../../components/ProgressBar';

const CHILDREN = [
  {
    id: 'omar',
    progress: 85,
    statusKey: 'onTrack',
    statusIcon: 'trending_up',
    statusClass: 'bg-secondary-container text-on-secondary-container',
    barClass: 'bg-secondary',
  },
  {
    id: 'lina',
    progress: 60,
    statusKey: 'reviewNeeded',
    statusIcon: 'schedule',
    statusClass: 'bg-tertiary-container text-on-tertiary-container',
    barClass: 'bg-tertiary',
  },
] as const;

const REPORTS = [
  { id: 'physics', icon: 'assignment_turned_in', linkKey: 'viewFullReport' },
  { id: 'tutor', icon: 'chat_bubble', linkKey: 'readMessage' },
] as const;

export function ParentDashboardPage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-unit-lg">
      <div>
        <h1 className="text-headline-lg font-semibold">{t('parent.greeting')}</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">{t('parent.subgreeting')}</p>
      </div>

      <div className="grid grid-cols-1 gap-gutter md:grid-cols-12">
        {/* Children overview + reports */}
        <section className="flex flex-col gap-unit-md md:col-span-8">
          <h3 className="text-headline-md">{t('parent.childrenOverview')}</h3>
          <div className="grid grid-cols-1 gap-unit-md lg:grid-cols-2">
            {CHILDREN.map((child) => (
              <div
                key={child.id}
                className="rounded-xl border border-outline-variant bg-surface-container-lowest p-unit-md"
              >
                <div className="mb-unit-md flex items-start gap-unit-md">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high text-primary">
                    <Icon name="person" />
                  </span>
                  <div className="flex-1">
                    <h4 className="text-lg font-semibold">{t(`parent.children.${child.id}Name`)}</h4>
                    <p className="text-label-sm text-on-surface-variant">
                      {t(`parent.children.${child.id}Meta`)}
                    </p>
                  </div>
                  <span
                    className={`flex items-center gap-1 rounded-full px-2 py-1 text-label-sm ${child.statusClass}`}
                  >
                    <Icon name={child.statusIcon} className="text-[0.9rem]" />
                    {t(`parent.${child.statusKey}`)}
                  </span>
                </div>
                <div className="mb-unit-md">
                  <div className="mb-1 flex justify-between text-label-sm text-on-surface-variant">
                    <span>{t('parent.weeklyGoalProgress')}</span>
                    <span>{child.progress}%</span>
                  </div>
                  <ProgressBar value={child.progress} barClassName={child.barClass} />
                </div>
                <div className="rounded-lg border border-outline-variant/50 bg-surface-container-low p-unit-sm">
                  <p className="mb-1 text-label-sm uppercase tracking-wider text-on-surface-variant">
                    {t('parent.latestActivity')}
                  </p>
                  <p className="text-sm">{t(`parent.children.${child.id}Activity`)}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-unit-md rounded-xl border border-outline-variant bg-surface-container-lowest p-unit-md">
            <h3 className="mb-unit-md text-lg font-semibold">{t('parent.recentReports')}</h3>
            <div className="flex flex-col divide-y divide-outline-variant/50">
              {REPORTS.map((report) => (
                <div key={report.id} className="flex items-start gap-unit-md py-unit-sm">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-surface-container text-primary">
                    <Icon name={report.icon} />
                  </span>
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <h4 className="text-label-md font-semibold">
                        {t(`parent.reports.${report.id}Title`)}
                      </h4>
                      <span className="text-label-sm text-on-surface-variant">
                        {t(`parent.reports.${report.id}Time`)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-on-surface-variant">
                      {t(`parent.reports.${report.id}Body`)}
                    </p>
                    <button className="mt-2 text-label-sm text-primary hover:underline">
                      {t(`parent.${report.linkKey}`)}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Right column: approvals + billing */}
        <section className="flex flex-col gap-unit-md md:col-span-4">
          <div className="relative overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-unit-md">
            <div className="absolute inset-y-0 start-0 w-1 bg-error" />
            <div className="mb-unit-md flex items-center justify-between">
              <h3 className="text-lg font-semibold">{t('parent.sessionApprovals')}</h3>
              <span className="rounded-full bg-error-container px-2 py-0.5 text-xs font-bold text-on-error-container">
                {t('parent.pending', { count: 1 })}
              </span>
            </div>
            <div className="rounded-lg border border-outline-variant/50 bg-surface-container-low p-unit-sm">
              <div className="mb-2 flex items-center gap-3">
                <Icon name="record_voice_over" className="text-on-surface-variant" />
                <div>
                  <p className="text-label-md">{t('parent.approval.request')}</p>
                  <p className="text-label-sm text-on-surface-variant">{t('parent.approval.meta')}</p>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="primary" className="flex-1">
                  {t('actions.approve')}
                </Button>
                <Button variant="secondary" className="flex-1">
                  {t('actions.decline')}
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-unit-md">
            <h3 className="mb-unit-md text-lg font-semibold">{t('parent.billing')}</h3>
            <div className="mb-unit-md">
              <p className="mb-1 text-label-sm uppercase tracking-wider text-on-surface-variant">
                {t('parent.upcomingPayment')}
              </p>
              <div className="flex items-end gap-2">
                <span className="text-display-lg-mobile font-bold">EGP 120</span>
                <span className="mb-1 text-body-md text-on-surface-variant">{t('parent.dueDate')}</span>
              </div>
            </div>
            <div className="space-y-3 border-t border-outline-variant/50 pt-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm">
                  <Icon name="school" className="text-[1.1rem] text-on-surface-variant" />
                  {t('parent.plan.standard')}
                </span>
                <span className="text-label-md font-semibold">EGP 80</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm">
                  <Icon name="menu_book" className="text-[1.1rem] text-on-surface-variant" />
                  {t('parent.plan.materials')}
                </span>
                <span className="text-label-md font-semibold">EGP 40</span>
              </div>
            </div>
            <Button variant="secondary" className="mt-unit-md w-full">
              {t('actions.manage')}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
