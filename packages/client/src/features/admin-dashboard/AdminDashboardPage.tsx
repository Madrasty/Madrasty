import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/Icon';
import { StatCard } from '../../components/StatCard';

const STATS = [
  { labelKey: 'totalRevenue', value: 'EGP 1.2M', icon: 'account_balance', iconClass: 'text-primary', delta: '+8.1%' },
  { labelKey: 'newSignups', value: '3,120', icon: 'person_add', iconClass: 'text-secondary', delta: '+12%' },
  { labelKey: 'dailyActive', value: '142.5K', icon: 'groups', iconClass: 'text-tertiary', delta: '+5.2%' },
] as const;

const APPLICANTS = [
  { id: 'ahmed', initials: 'AA', avatarClass: 'bg-primary/10 text-primary', timeKey: 'twoHours', statusKey: 'pending', actionKey: 'review' },
  { id: 'sarah', initials: 'SH', avatarClass: 'bg-secondary/10 text-secondary', timeKey: 'fiveHours', statusKey: 'reviewing', actionKey: 'continue' },
  { id: 'mahmoud', initials: 'MI', avatarClass: 'bg-tertiary/10 text-tertiary', timeKey: 'yesterday', statusKey: 'pending', actionKey: 'review' },
] as const;

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-tertiary-fixed-dim/20 text-on-tertiary-fixed-variant border border-tertiary-fixed-dim/30',
  reviewing: 'bg-primary/10 text-primary border border-primary/20',
};

export function AdminDashboardPage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-unit-lg">
      <div>
        <h1 className="text-headline-lg font-semibold">{t('admin.greeting')}</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">{t('admin.subgreeting')}</p>
      </div>

      <section className="grid grid-cols-1 gap-unit-md sm:grid-cols-2 lg:grid-cols-4">
        {STATS.map((stat) => (
          <StatCard
            key={stat.labelKey}
            label={t(`admin.${stat.labelKey}`)}
            value={stat.value}
            icon={stat.icon}
            iconClassName={stat.iconClass}
            footer={
              <span className="flex items-center gap-1 text-label-sm">
                <Icon name="trending_up" className="text-[1rem] text-secondary" />
                <span className="font-medium text-secondary">{stat.delta}</span>
                <span className="text-on-surface-variant">{t('admin.vsLastWeek')}</span>
              </span>
            }
          />
        ))}
        <StatCard
          label={t('admin.liveSessions')}
          value={
            <span className="flex items-baseline gap-2">
              348
              <span className="flex items-center gap-1 text-sm font-medium text-error">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-error" />
                {t('admin.live')}
              </span>
            </span>
          }
          icon="videocam"
          iconClassName="text-error"
        />
      </section>

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
        <div className="flex items-center justify-between border-b border-outline-variant/50 p-5">
          <div className="flex items-center gap-2">
            <Icon name="how_to_reg" className="text-primary" />
            <h3 className="text-lg font-semibold">{t('admin.verificationQueue')}</h3>
          </div>
          <button className="flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            {t('actions.viewAll')}
            <Icon name="arrow_forward" className="text-[1rem]" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-start">
            <thead>
              <tr className="border-b border-outline-variant/30 bg-surface-container-low text-xs uppercase tracking-wider text-on-surface-variant">
                <th className="px-5 py-3 text-start font-semibold">{t('admin.columns.applicant')}</th>
                <th className="px-5 py-3 text-start font-semibold">{t('admin.columns.specialty')}</th>
                <th className="hidden px-5 py-3 text-start font-semibold sm:table-cell">
                  {t('admin.columns.applied')}
                </th>
                <th className="px-5 py-3 text-start font-semibold">{t('admin.columns.status')}</th>
                <th className="px-5 py-3 text-end font-semibold">{t('admin.columns.action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20 text-sm">
              {APPLICANTS.map((applicant) => (
                <tr key={applicant.id} className="hover:bg-surface-container-low/50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded text-xs font-bold ${applicant.avatarClass}`}
                      >
                        {applicant.initials}
                      </span>
                      <div>
                        <p className="font-medium text-on-surface">{t(`admin.applicants.${applicant.id}`)}</p>
                        <p className="text-[11px] text-outline">{t(`admin.applicants.${applicant.id}Meta`)}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-on-surface-variant">
                    {t(`admin.applicants.${applicant.id}Specialty`)}
                  </td>
                  <td className="hidden px-5 py-3 text-xs text-on-surface-variant sm:table-cell">
                    {t(`admin.time.${applicant.timeKey}`)}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[applicant.statusKey]}`}
                    >
                      {t(`admin.status.${applicant.statusKey}`)}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-end">
                    <button className="rounded-md border border-primary/20 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10">
                      {applicant.actionKey === 'continue' ? t('admin.continue') : t('actions.review')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
