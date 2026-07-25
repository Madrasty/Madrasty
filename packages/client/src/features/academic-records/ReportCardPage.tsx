import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConversationParticipant, ReportCardResponse } from '@madrasty/shared';
import { Icon } from '../../components/Icon';
import { useAuth } from '../auth/AuthProvider';
import { messagingApi } from '../messaging/messaging.api';
import { academicRecordsApi } from './academic-records.api';

// Report card (doc 10 §3.1): the "real school" artifact parents want. Role-aware
// — a student sees their own; a parent picks a child (discovered via the
// messaging contacts endpoint) and sees theirs. EXAMS-ONLY for now: quiz /
// homework / attendance roll-ups land with later roadmap steps (7–9).
export function ReportCardPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const isParent = user?.role === 'parent';

  const [children, setChildren] = useState<ConversationParticipant[] | null>(
    isParent ? null : [],
  );
  const [studentId, setStudentId] = useState<string | null>(isParent ? null : (user?.id ?? null));

  // Parents: derive the distinct children they can view from messaging contacts.
  useEffect(() => {
    if (!isParent) return;
    let active = true;
    messagingApi
      .listContacts()
      .then((res) => {
        if (!active) return;
        const seen = new Map<string, ConversationParticipant>();
        res.contacts.forEach((c) => seen.set(c.student.id, c.student));
        const list = [...seen.values()];
        setChildren(list);
        if (list.length === 1) setStudentId(list[0].id);
      })
      .catch(() => active && setChildren([]));
    return () => {
      active = false;
    };
  }, [isParent]);

  return (
    <div className="flex flex-col gap-unit-lg">
      <div>
        <h1 className="text-headline-lg font-semibold">{t('academic.reportCardTitle')}</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">{t('academic.reportCardSubtitle')}</p>
      </div>

      {isParent && children !== null && children.length > 0 && (
        <div className="flex flex-wrap items-center gap-unit-sm">
          {children.map((child) => (
            <button
              key={child.id}
              type="button"
              onClick={() => setStudentId(child.id)}
              className={`rounded-full border px-unit-md py-1.5 text-label-md transition-colors ${
                studentId === child.id
                  ? 'border-primary bg-primary/10 font-semibold text-primary'
                  : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-low'
              }`}
            >
              {child.fullName ?? t('academic.unknownStudent')}
            </button>
          ))}
        </div>
      )}

      {isParent && children !== null && children.length === 0 && (
        <EmptyCard icon="family_restroom" title={t('academic.noChildren')} hint={t('academic.noChildrenHint')} />
      )}

      {studentId && <ReportCardBody key={`${studentId}:${i18n.language}`} studentId={studentId} />}
    </div>
  );
}

function ReportCardBody({ studentId }: { studentId: string }) {
  const { t, i18n } = useTranslation();
  const [card, setCard] = useState<ReportCardResponse | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setCard(null);
    setError(false);
    try {
      setCard(await academicRecordsApi.getReportCard(studentId, { locale: i18n.language }));
    } catch {
      setError(true);
    }
  }, [studentId, i18n.language]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return <EmptyCard icon="error" title={t('academic.loadError')} />;
  }
  if (card === null) {
    return (
      <div className="flex justify-center py-unit-xl text-on-surface-variant">
        <Icon name="progress_activity" className="animate-spin text-[2rem]" />
      </div>
    );
  }
  if (card.subjects.length === 0) {
    return <EmptyCard icon="assignment" title={t('academic.noGrades')} hint={t('academic.noGradesHint')} />;
  }

  return (
    <div className="flex flex-col gap-unit-lg">
      <OverallCard average={card.overallAverage} />
      {card.subjects.map((subject) => (
        <div
          key={subject.subjectId}
          className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest"
        >
          <div className="flex items-center justify-between gap-2 border-b border-outline-variant p-unit-md">
            <h2 className="text-body-lg font-semibold text-on-surface">
              {subject.subjectName ?? t('academic.unknownSubject')}
            </h2>
            <ScorePill value={subject.average} />
          </div>
          <ul className="divide-y divide-outline-variant">
            {subject.exams.map((exam) => (
              <li key={exam.examId} className="flex flex-wrap items-center gap-unit-sm p-unit-md">
                <div className="min-w-[10rem] flex-1">
                  <p className="text-body-md font-medium text-on-surface">
                    {exam.title || t('academic.untitledExam')}
                  </p>
                  {exam.teacherComment && (
                    <p className="mt-0.5 text-body-sm text-on-surface-variant">“{exam.teacherComment}”</p>
                  )}
                </div>
                <span className="text-body-md tabular-nums text-on-surface-variant">
                  {exam.score} / {exam.maxScore}
                </span>
                <ScorePill value={exam.percentage} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="text-label-sm text-on-surface-variant">{t('academic.examsOnlyNote')}</p>
    </div>
  );
}

function OverallCard({ average }: { average: number | null }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between gap-unit-md rounded-xl border border-primary/30 bg-primary/5 p-unit-lg">
      <div>
        <p className="text-label-md text-on-surface-variant">{t('academic.overall')}</p>
        <p className="text-headline-md font-bold text-primary">
          {average !== null ? `${average}%` : '—'}
        </p>
      </div>
      <Icon name="workspace_premium" filled className="text-[2.5rem] text-primary/70" />
    </div>
  );
}

// Green ≥75, amber ≥60, else red — a quick visual read of standing.
function ScorePill({ value }: { value: number }) {
  const tone =
    value >= 75
      ? 'bg-green-500/15 text-green-700 dark:text-green-400'
      : value >= 60
        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
        : 'bg-error/15 text-error';
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-label-md font-semibold tabular-nums ${tone}`}>
      {value}%
    </span>
  );
}

function EmptyCard({ icon, title, hint }: { icon: string; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-unit-sm rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-unit-xl text-center">
      <Icon name={icon} className="text-[2.5rem] text-on-surface-variant" />
      <p className="text-body-lg font-semibold">{title}</p>
      {hint && <p className="text-body-md text-on-surface-variant">{hint}</p>}
    </div>
  );
}
