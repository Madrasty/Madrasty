import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { PendingProgram, PendingTeacher } from '@madrasty/shared';
import { Icon } from '../../components/Icon';
import { StatCard } from '../../components/StatCard';
import { useAuth } from '../auth/AuthProvider';
import { adminApi } from './admin.api';
import { DashboardHeader, DashboardError } from '../dashboard/DashboardChrome';

// Admin dashboard — the two real governance queues (pending teacher verifications
// and pending program approvals). No fabricated revenue/DAU figures.
export function AdminDashboardPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [teachers, setTeachers] = useState<PendingTeacher[] | null>(null);
  const [programs, setPrograms] = useState<PendingProgram[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setError(false);
    Promise.all([adminApi.listPendingTeachers(), adminApi.listPendingPrograms(i18n.language)])
      .then(([ts, ps]) => {
        if (!active) return;
        setTeachers(ts.teachers);
        setPrograms(ps.programs);
      })
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [i18n.language]);

  return (
    <div className="flex flex-col gap-unit-lg">
      <DashboardHeader
        title={user?.fullName ? t('dashboard.welcome', { name: user.fullName }) : t('dashboard.welcomeAnon')}
        subtitle={t('dashboard.adminSubtitle')}
      />

      {error && <DashboardError />}

      <section className="grid grid-cols-1 gap-unit-md sm:grid-cols-2">
        <StatCard
          label={t('dashboard.pendingTeachers')}
          value={teachers?.length ?? '—'}
          icon="how_to_reg"
          footer={
            <Link to="/app/admin/teachers" className="text-label-md text-primary hover:underline">
              {t('dashboard.reviewTeachers')}
            </Link>
          }
        />
        <StatCard
          label={t('dashboard.pendingPrograms')}
          value={programs?.length ?? '—'}
          icon="fact_check"
          iconClassName="text-secondary"
          footer={
            <Link to="/app/admin/programs" className="text-label-md text-primary hover:underline">
              {t('dashboard.reviewPrograms')}
            </Link>
          }
        />
      </section>

      <div className="grid grid-cols-1 gap-unit-lg lg:grid-cols-2">
        <QueueCard
          icon="how_to_reg"
          title={t('dashboard.pendingTeachers')}
          to="/app/admin/teachers"
          items={teachers?.map((tt) => ({ id: tt.userId, primary: tt.fullName ?? tt.email ?? tt.userId, secondary: tt.email }))}
        />
        <QueueCard
          icon="fact_check"
          title={t('dashboard.pendingPrograms')}
          to="/app/admin/programs"
          items={programs?.map((p) => ({ id: p.id, primary: p.title || p.id, secondary: p.teacherName ?? null }))}
        />
      </div>
    </div>
  );
}

function QueueCard({
  icon,
  title,
  to,
  items,
}: {
  icon: string;
  title: string;
  to: string;
  items: Array<{ id: string; primary: string; secondary: string | null }> | undefined;
}) {
  const { t } = useTranslation();
  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant/60 bg-surface-container-lowest">
      <div className="flex items-center justify-between border-b border-outline-variant/60 p-unit-md">
        <span className="flex items-center gap-2">
          <Icon name={icon} className="text-primary" />
          <h3 className="text-body-lg font-semibold">{title}</h3>
        </span>
        <Link to={to} className="inline-flex items-center gap-1 text-label-md text-primary hover:underline">
          {t('dashboard.viewAll')}
          <Icon name="arrow_forward" className="text-[1rem] rtl:-scale-x-100" />
        </Link>
      </div>
      <div className="p-unit-md">
        {items && items.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {items.slice(0, 5).map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-outline-variant/60 px-unit-md py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-body-md font-medium text-on-surface">{item.primary}</span>
                  {item.secondary && (
                    <span className="block truncate text-label-sm text-on-surface-variant">{item.secondary}</span>
                  )}
                </span>
                <Link to={to} className="shrink-0 text-label-md text-primary hover:underline">
                  {t('actions.review')}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-unit-md text-center text-body-md text-on-surface-variant">
            {t('dashboard.allClear')}
          </p>
        )}
      </div>
    </section>
  );
}
