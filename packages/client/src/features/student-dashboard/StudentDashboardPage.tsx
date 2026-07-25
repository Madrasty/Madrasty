import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { EnrolledProgramView, ReportCardResponse } from '@madrasty/shared';
import { Icon } from '../../components/Icon';
import { StatCard } from '../../components/StatCard';
import { useAuth } from '../auth/AuthProvider';
import { enrollmentApi } from '../enrollment/enrollment.api';
import { academicRecordsApi } from '../academic-records/academic-records.api';
import { LoyaltyWidget } from '../loyalty/LoyaltyWidget';
import { DashboardHeader, DashboardError } from '../dashboard/DashboardChrome';

// Student dashboard — the student's real enrolled programs, report-card summary,
// and loyalty. No fabricated figures (doc 10 principle).
export function StudentDashboardPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [programs, setPrograms] = useState<EnrolledProgramView[] | null>(null);
  const [card, setCard] = useState<ReportCardResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setError(false);
    Promise.all([
      enrollmentApi.listMyPrograms(i18n.language),
      academicRecordsApi.getReportCard(user.id, { locale: i18n.language }),
    ])
      .then(([p, c]) => {
        if (!active) return;
        setPrograms(p.programs);
        setCard(c);
      })
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [user, i18n.language]);

  return (
    <div className="flex flex-col gap-unit-lg">
      <DashboardHeader
        title={user?.fullName ? t('dashboard.welcome', { name: user.fullName }) : t('dashboard.welcomeAnon')}
        subtitle={t('dashboard.studentSubtitle')}
      />

      {error && <DashboardError />}

      <section className="grid grid-cols-1 gap-unit-md sm:grid-cols-3">
        <StatCard
          label={t('dashboard.enrolledPrograms')}
          value={programs?.length ?? '—'}
          icon="school"
        />
        <StatCard
          label={t('dashboard.reportAverage')}
          value={card?.overallAverage !== null && card?.overallAverage !== undefined ? `${card.overallAverage}%` : '—'}
          icon="workspace_premium"
          iconClassName="text-secondary"
        />
        <StatCard
          label={t('dashboard.subjectsGraded')}
          value={card?.subjects.length ?? '—'}
          icon="menu_book"
          iconClassName="text-tertiary"
        />
      </section>

      <div className="grid grid-cols-1 gap-unit-lg lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="mb-unit-md flex items-center justify-between">
            <h2 className="text-headline-md">{t('dashboard.myPrograms')}</h2>
            <Link
              to="/app/catalog"
              className="inline-flex items-center gap-1 text-label-md text-primary hover:underline"
            >
              {t('dashboard.browseCatalog')}
              <Icon name="arrow_forward" className="text-[1rem] rtl:-scale-x-100" />
            </Link>
          </div>
          {programs && programs.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {programs.map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/app/catalog/${p.id}`}
                    className="flex items-center gap-unit-md rounded-xl border border-outline-variant bg-surface-container-lowest p-unit-md transition-colors hover:bg-surface-container-low"
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon name="menu_book" filled />
                    </span>
                    <span className="flex-1">
                      <span className="block text-body-md font-semibold text-on-surface">
                        {p.title || t('dashboard.untitledProgram')}
                      </span>
                      {p.gradeLevel && (
                        <span className="block text-label-sm text-on-surface-variant">{p.gradeLevel}</span>
                      )}
                    </span>
                    <Icon name="chevron_right" className="text-on-surface-variant rtl:-scale-x-100" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="school" text={t('dashboard.noPrograms')} />
          )}
        </section>

        <div className="flex flex-col gap-unit-lg">
          <LoyaltyWidget />
          <Link
            to="/app/student/report-card"
            className="flex items-center justify-between rounded-xl border border-outline-variant bg-surface-container-lowest p-unit-lg transition-colors hover:bg-surface-container-low"
          >
            <span className="flex items-center gap-unit-sm">
              <Icon name="assignment" className="text-primary" />
              <span className="text-body-md font-semibold">{t('dashboard.viewReportCard')}</span>
            </span>
            <Icon name="arrow_forward" className="text-on-surface-variant rtl:-scale-x-100" />
          </Link>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center gap-unit-sm rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-unit-xl text-center">
      <Icon name={icon} className="text-[2.5rem] text-on-surface-variant" />
      <p className="text-body-md text-on-surface-variant">{text}</p>
    </div>
  );
}
