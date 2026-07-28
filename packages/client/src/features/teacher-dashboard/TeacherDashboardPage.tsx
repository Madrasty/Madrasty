import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { AuthoredProgram } from '@madrasty/shared';
import { Icon } from '../../components/Icon';
import { StatCard } from '../../components/StatCard';
import { useAuth } from '../auth/AuthProvider';
import { programsApi } from '../teacher-authoring/programs.api';
import { academicRecordsApi } from '../academic-records/academic-records.api';
import { messagingApi } from '../messaging/messaging.api';
import { DashboardHeader, DashboardError } from '../dashboard/DashboardChrome';

const STATUS_TONE: Record<string, string> = {
  published: 'bg-secondary-container text-on-secondary-container',
  pending_review: 'bg-tertiary-fixed text-on-tertiary-fixed',
  draft: 'bg-surface-container-high text-on-surface-variant',
  archived: 'bg-surface-container-high text-on-surface-variant',
};

// Teacher dashboard — real programs (with status), exam count and unread parent
// messages. No fabricated revenue/engagement figures.
export function TeacherDashboardPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [programs, setPrograms] = useState<AuthoredProgram[] | null>(null);
  const [examCount, setExamCount] = useState<number | null>(null);
  const [unread, setUnread] = useState<number | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setError(false);
    Promise.all([
      programsApi.listMine(),
      academicRecordsApi.listMyExams(i18n.language),
      messagingApi.listConversations(),
    ])
      .then(([p, e, m]) => {
        if (!active) return;
        setPrograms(p.programs);
        setExamCount(e.exams.length);
        setUnread(m.conversations.reduce((sum, c) => sum + c.unreadCount, 0));
      })
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [i18n.language]);

  const publishedCount = programs?.filter((p) => p.status === 'published').length ?? null;

  return (
    <div className="flex flex-col gap-unit-lg">
      <div className="flex flex-wrap items-end justify-between gap-unit-md">
        <DashboardHeader
          title={user?.fullName ? t('dashboard.welcome', { name: user.fullName }) : t('dashboard.welcomeAnon')}
          subtitle={t('dashboard.teacherSubtitle')}
        />
        <Link
          to="/app/teacher/programs/new"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-unit-md py-2 text-label-lg font-semibold text-on-primary transition-opacity hover:opacity-90"
        >
          <Icon name="add" className="text-[1.1rem]" />
          {t('dashboard.newProgram')}
        </Link>
      </div>

      {error && <DashboardError />}

      <section className="grid grid-cols-1 gap-unit-md sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('dashboard.totalPrograms')} value={programs?.length ?? '—'} icon="menu_book" />
        <StatCard
          label={t('dashboard.published')}
          value={publishedCount ?? '—'}
          icon="verified"
          iconClassName="text-secondary"
        />
        <StatCard
          label={t('dashboard.exams')}
          value={examCount ?? '—'}
          icon="grading"
          iconClassName="text-tertiary"
          footer={
            <Link to="/app/teacher/gradebook" className="text-label-md text-primary hover:underline">
              {t('dashboard.openGradebook')}
            </Link>
          }
        />
        <StatCard
          label={t('dashboard.unreadMessages')}
          value={unread ?? '—'}
          icon="forum"
          footer={
            <Link to="/app/teacher/messages" className="text-label-md text-primary hover:underline">
              {t('dashboard.openMessages')}
            </Link>
          }
        />
      </section>

      <section>
        <div className="mb-unit-md flex items-center justify-between">
          <h2 className="text-headline-md">{t('dashboard.myPrograms')}</h2>
          <Link
            to="/app/teacher/programs"
            className="inline-flex items-center gap-1 text-label-md text-primary hover:underline"
          >
            {t('dashboard.viewAll')}
            <Icon name="arrow_forward" className="text-[1rem] rtl:-scale-x-100" />
          </Link>
        </div>
        {programs && programs.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {programs.slice(0, 6).map((p) => (
              <li key={p.id}>
                <Link
                  to={`/app/teacher/programs/${p.id}`}
                  className="flex items-center gap-unit-md rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-unit-md transition-colors hover:bg-surface-container-low"
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
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-label-sm font-semibold ${STATUS_TONE[p.status] ?? STATUS_TONE.draft}`}
                  >
                    {t(`dashboard.status_${p.status}`, { defaultValue: p.status })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-unit-sm rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-unit-xl text-center">
            <Icon name="menu_book" className="text-[2.5rem] text-on-surface-variant" />
            <p className="text-body-md font-semibold">{t('dashboard.noProgramsTeacher')}</p>
            <Link
              to="/app/teacher/programs/new"
              className="text-label-md font-semibold text-primary hover:underline"
            >
              {t('dashboard.newProgram')}
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
