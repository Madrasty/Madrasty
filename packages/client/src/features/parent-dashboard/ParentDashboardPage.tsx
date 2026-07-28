import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { ParentChildView } from '@madrasty/shared';
import { Icon } from '../../components/Icon';
import { StatCard } from '../../components/StatCard';
import { useAuth } from '../auth/AuthProvider';
import { enrollmentApi } from '../enrollment/enrollment.api';
import { academicRecordsApi } from '../academic-records/academic-records.api';
import { messagingApi } from '../messaging/messaging.api';
import { DashboardHeader, DashboardError } from '../dashboard/DashboardChrome';

interface ChildRow extends ParentChildView {
  average: number | null;
}

// Parent dashboard — the guardian's real children (with each child's report-card
// average) and unread teacher messages. No fabricated figures.
export function ParentDashboardPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [children, setChildren] = useState<ChildRow[] | null>(null);
  const [unread, setUnread] = useState<number | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setError(false);
    (async () => {
      try {
        const [{ children: kids }, { conversations }] = await Promise.all([
          enrollmentApi.listMyChildren(),
          messagingApi.listConversations(),
        ]);
        if (!active) return;
        setUnread(conversations.reduce((sum, c) => sum + c.unreadCount, 0));
        // Fetch each child's overall average in parallel (best-effort).
        const rows = await Promise.all(
          kids.map(async (child) => {
            try {
              const card = await academicRecordsApi.getReportCard(child.id, { locale: i18n.language });
              return { ...child, average: card.overallAverage };
            } catch {
              return { ...child, average: null };
            }
          }),
        );
        if (active) setChildren(rows);
      } catch {
        if (active) setError(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [i18n.language]);

  return (
    <div className="flex flex-col gap-unit-lg">
      <DashboardHeader
        title={user?.fullName ? t('dashboard.welcome', { name: user.fullName }) : t('dashboard.welcomeAnon')}
        subtitle={t('dashboard.parentSubtitle')}
      />

      {error && <DashboardError />}

      <section className="grid grid-cols-1 gap-unit-md sm:grid-cols-2">
        <StatCard label={t('dashboard.children')} value={children?.length ?? '—'} icon="family_restroom" />
        <StatCard
          label={t('dashboard.unreadMessages')}
          value={unread ?? '—'}
          icon="forum"
          iconClassName="text-secondary"
          footer={
            <Link to="/app/parent/messages" className="text-label-md text-primary hover:underline">
              {t('dashboard.openMessages')}
            </Link>
          }
        />
      </section>

      <section>
        <div className="mb-unit-md flex items-center justify-between">
          <h2 className="text-headline-md">{t('dashboard.children')}</h2>
          <Link
            to="/register/add-student"
            className="inline-flex items-center gap-1 text-label-md text-primary hover:underline"
          >
            <Icon name="person_add" className="text-[1.1rem]" />
            {t('dashboard.addStudent')}
          </Link>
        </div>

        {children && children.length > 0 ? (
          <ul className="grid grid-cols-1 gap-unit-md sm:grid-cols-2">
            {children.map((child) => (
              <li
                key={child.id}
                className="flex flex-col gap-unit-sm rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-unit-lg"
              >
                <div className="flex items-center gap-unit-sm">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon name="account_circle" filled />
                  </span>
                  <div className="flex-1">
                    <p className="text-body-md font-semibold text-on-surface">
                      {child.fullName ?? t('dashboard.unnamedChild')}
                    </p>
                    <p className="text-label-sm text-on-surface-variant">
                      {child.gradeLevel ? `${t('dashboard.grade')}: ${child.gradeLevel}` : ''}
                    </p>
                  </div>
                  <StatusBadge approved={child.approvedAt !== null} />
                </div>
                <div className="flex items-center justify-between border-t border-outline-variant/60 pt-unit-sm">
                  <span className="text-label-md text-on-surface-variant">{t('dashboard.reportAverage')}</span>
                  <span className="text-body-md font-bold text-primary">
                    {child.average !== null ? `${child.average}%` : t('dashboard.notGradedYet')}
                  </span>
                </div>
                <Link
                  to="/app/parent/report-card"
                  className="inline-flex items-center gap-1 text-label-md text-primary hover:underline"
                >
                  {t('dashboard.viewReportCard')}
                  <Icon name="arrow_forward" className="text-[1rem] rtl:-scale-x-100" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          children !== null && (
            <div className="flex flex-col items-center gap-unit-sm rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-unit-xl text-center">
              <Icon name="family_restroom" className="text-[2.5rem] text-on-surface-variant" />
              <p className="text-body-md font-semibold">{t('dashboard.noChildren')}</p>
              <Link
                to="/register/add-student"
                className="text-label-md font-semibold text-primary hover:underline"
              >
                {t('dashboard.addStudent')}
              </Link>
            </div>
          )
        )}
      </section>
    </div>
  );
}

function StatusBadge({ approved }: { approved: boolean }) {
  const { t } = useTranslation();
  return approved ? (
    <span className="rounded-full bg-secondary-container px-2.5 py-0.5 text-label-sm font-semibold text-on-secondary-container">
      {t('dashboard.statusActive')}
    </span>
  ) : (
    <span className="rounded-full bg-tertiary-fixed px-2.5 py-0.5 text-label-sm font-semibold text-on-tertiary-fixed">
      {t('dashboard.statusPending')}
    </span>
  );
}
