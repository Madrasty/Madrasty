import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/Button';
import { StatCard } from '../../components/StatCard';
import { ProgressBar } from '../../components/ProgressBar';

const PROGRAMS = [
  { id: 'calc', rating: '4.9', students: 124, lessons: 24, subjectClass: 'text-primary' },
  { id: 'physics', rating: '4.7', students: 89, lessons: 18, subjectClass: 'text-tertiary' },
] as const;

const CLASSES = [
  { id: 'qa', time: '09:00', meridiem: 'AM', barClass: 'bg-primary', icon: 'videocam' },
  { id: 'lab', time: '11:30', meridiem: 'AM', barClass: 'bg-tertiary', icon: 'location_on' },
] as const;

const GRADING = [
  { id: 'integration', initials: 'AS', avatarClass: 'bg-primary-container text-primary' },
  { id: 'lab', initials: 'MK', avatarClass: 'bg-tertiary-container text-tertiary' },
] as const;

export function TeacherDashboardPage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-unit-lg">
      <div className="flex flex-wrap items-end justify-between gap-unit-md">
        <div>
          <h1 className="text-headline-lg font-semibold">{t('teacher.greeting')}</h1>
          <p className="mt-2 text-body-lg text-on-surface-variant">{t('teacher.subgreeting')}</p>
        </div>
        <Link to="/app/teacher/programs/new">
          <Button variant="primary" size="large">
            <Icon name="add" filled />
            {t('teacher.newProgram')}
          </Button>
        </Link>
      </div>

      <section className="grid grid-cols-1 gap-unit-md md:grid-cols-3">
        <StatCard
          label={t('teacher.totalRevenue')}
          value="EGP 12,450"
          icon="trending_up"
          iconClassName="text-secondary"
          footer={
            <span className="w-fit rounded bg-secondary-container px-2 py-1 text-label-sm text-on-secondary-container">
              {t('teacher.revenueDelta')}
            </span>
          }
        />
        <StatCard
          label={t('teacher.activeStudents')}
          value="342"
          icon="groups"
          footer={<span className="text-label-sm text-on-surface-variant">{t('teacher.acrossPrograms')}</span>}
        />
        <StatCard
          label={t('teacher.engagement')}
          value="87%"
          icon="local_fire_department"
          iconClassName="text-tertiary"
          footer={
            <>
              <ProgressBar value={87} barClassName="bg-tertiary" />
              <span className="mt-2 block text-end text-label-sm text-on-surface-variant">
                {t('teacher.target')}
              </span>
            </>
          }
        />
      </section>

      <div className="grid grid-cols-1 gap-unit-xl lg:grid-cols-3">
        {/* Programs */}
        <section className="flex flex-col gap-unit-md lg:col-span-2">
          <div className="flex items-center justify-between border-b border-outline-variant pb-2">
            <h2 className="text-headline-md">{t('teacher.myPrograms')}</h2>
            <Link to="/app/teacher/programs" className="text-label-md text-primary hover:underline">
              {t('actions.viewAll')}
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-unit-md sm:grid-cols-2">
            {PROGRAMS.map((program) => (
              <div
                key={program.id}
                className="flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest"
              >
                <div className="relative flex h-40 items-start justify-end bg-gradient-to-br from-surface-container to-surface-variant p-2">
                  <span className="flex items-center gap-1 rounded bg-surface-container-lowest/90 px-2 py-1 text-label-sm font-bold backdrop-blur">
                    <Icon name="star" filled className="text-[1rem] text-secondary" /> {program.rating}
                  </span>
                </div>
                <div className="flex flex-1 flex-col justify-between p-unit-md">
                  <div>
                    <span className={`text-label-sm uppercase tracking-wide ${program.subjectClass}`}>
                      {t(`teacher.programs.${program.id}Subject`)}
                    </span>
                    <h3 className="mt-1 text-headline-md">{t(`teacher.programs.${program.id}Title`)}</h3>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-4 text-on-surface-variant">
                    <span className="flex items-center gap-1 text-label-sm">
                      <Icon name="group" className="text-[1rem]" /> {program.students} {t('teacher.students')}
                    </span>
                    <span className="flex items-center gap-1 text-label-sm">
                      <Icon name="play_circle" className="text-[1rem]" /> {program.lessons} {t('teacher.lessons')}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Agenda + grading */}
        <section className="flex flex-col gap-unit-xl">
          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-unit-md">
            <h2 className="mb-unit-md text-headline-md">{t('teacher.todaysClasses')}</h2>
            <div className="flex flex-col gap-unit-sm">
              {CLASSES.map((cls) => (
                <div key={cls.id} className="flex items-start gap-4 rounded-lg p-3">
                  <div className="flex min-w-[50px] flex-col items-center">
                    <span className="text-label-sm text-on-surface-variant">{cls.time}</span>
                    <span className="text-label-sm text-on-surface-variant">{cls.meridiem}</span>
                  </div>
                  <div className={`min-h-[40px] w-1 self-stretch rounded-full ${cls.barClass}`} />
                  <div className="flex-1">
                    <h4 className="text-label-md font-bold">{t(`teacher.classes.${cls.id}`)}</h4>
                    <span className="mt-1 flex items-center gap-1 text-label-sm text-on-surface-variant">
                      <Icon name={cls.icon} className="text-[0.9rem]" /> {t(`teacher.classes.${cls.id}Meta`)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-outline-variant bg-surface-container-lowest p-unit-md">
            <div className="mb-unit-md flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-headline-md">{t('teacher.needsGrading')}</h2>
              <span className="whitespace-nowrap rounded-full bg-error-container px-2 py-1 text-label-sm text-on-error-container">
                {t('teacher.pending', { count: 12 })}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {GRADING.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-outline-variant bg-surface p-3"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold ${task.avatarClass}`}
                    >
                      {task.initials}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-label-md">{t(`teacher.grading.${task.id}`)}</div>
                      <div className="truncate text-label-sm text-on-surface-variant">
                        {t(`teacher.grading.${task.id}Meta`)}
                      </div>
                    </div>
                  </div>
                  <button className="shrink-0 text-primary" aria-label={t('actions.review')}>
                    <Icon name="edit_document" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
