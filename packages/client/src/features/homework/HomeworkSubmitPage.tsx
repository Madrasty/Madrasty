import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import type { HomeworkAssignmentView } from '@madrasty/shared';
import { ApiError } from '../../lib/api';
import { Icon } from '../../components/Icon';
import { useAuth } from '../auth/AuthProvider';
import { homeworkApi } from './homework.api';
import { StatusChip } from './HomeworkBuilderPage';

// Student homework page (doc 12 §6): read the brief, write and submit an answer,
// then see the teacher's grade and feedback once it lands. Submissions are
// text-only for now; a submitted answer can be replaced until it is graded.
export function HomeworkSubmitPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { assignmentId = '' } = useParams();
  const [assignment, setAssignment] = useState<HomeworkAssignmentView | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAssignment(null);
    setErrorCode(null);
    homeworkApi
      .getAssignment(assignmentId, i18n.language)
      .then((view) => {
        setAssignment(view);
        setContent(view.mySubmission?.content ?? '');
      })
      .catch((e) => setErrorCode(e instanceof ApiError ? e.code : 'load_error'));
  }, [assignmentId, i18n.language]);

  const submit = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const submission = await homeworkApi.submit(assignmentId, { content }, i18n.language);
      setAssignment((prev) => (prev ? { ...prev, mySubmission: submission } : prev));
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'save_error';
      setSaveError(
        code === 'past_due'
          ? t('homework.pastDue')
          : code === 'already_graded'
            ? t('homework.alreadyGraded')
            : t('homework.saveError'),
      );
    } finally {
      setSaving(false);
    }
  };

  if (errorCode) {
    const msg = errorCode === 'not_enrolled' ? t('homework.notEnrolled') : t('homework.loadError');
    return (
      <div className="flex flex-col items-center gap-unit-sm rounded-xl border border-dashed border-error/40 bg-error/5 p-unit-xl text-center text-error">
        <Icon name="lock" className="text-[2.5rem]" />
        <p className="text-body-lg font-semibold">{msg}</p>
      </div>
    );
  }
  if (!assignment) {
    return (
      <div className="flex justify-center py-unit-xl text-on-surface-variant">
        <Icon name="progress_activity" className="animate-spin text-[2rem]" />
      </div>
    );
  }

  const mine = assignment.mySubmission;
  const graded = mine?.status === 'graded';
  const overdue = assignment.dueAt !== null && Date.now() > new Date(assignment.dueAt).getTime();
  // Teachers/admins reach this page as a preview (the "Preview as student" link);
  // only a student can actually submit, so the form stays read-only for them.
  const isStudent = user?.role === 'student';
  const locked = !isStudent || graded || (overdue && !assignment.allowLate);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-unit-lg">
      <div>
        <h1 className="text-headline-lg font-semibold">{t('homework.studentTitle')}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-unit-sm text-body-md text-on-surface-variant">
          <span>{t('homework.gradeOutOf', { max: assignment.maxGrade })}</span>
          {assignment.dueAt && (
            <span className={overdue ? 'font-semibold text-error' : undefined}>
              {t('homework.due', {
                date: new Date(assignment.dueAt).toLocaleString(i18n.language),
              })}
            </span>
          )}
          {mine && <StatusChip status={mine.status} />}
        </p>
      </div>

      <section className="whitespace-pre-wrap rounded-xl border border-outline-variant bg-surface-container-lowest p-unit-md text-body-lg">
        {assignment.brief}
      </section>

      {graded && mine && (
        <div className="flex items-center justify-between gap-unit-md rounded-xl border border-green-500/40 bg-green-500/10 p-unit-lg text-green-700 dark:text-green-400">
          <div>
            <p className="text-headline-md font-bold">
              {mine.grade} / {assignment.maxGrade}
            </p>
            {mine.teacherComment && <p className="text-body-md">{mine.teacherComment}</p>}
          </div>
          <Icon name="verified" filled className="text-[2.5rem]" />
        </div>
      )}

      <div className="flex flex-col gap-unit-sm">
        <label className="text-label-md font-medium text-on-surface-variant" htmlFor="hw-answer">
          {t('homework.yourAnswer')}
        </label>
        <textarea
          id="hw-answer"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          disabled={locked}
          placeholder={t('homework.answerPlaceholder')}
          className="w-full rounded-xl border border-outline-variant bg-surface-container-lowest px-unit-md py-2 text-body-md outline-none focus:border-primary disabled:opacity-60"
        />
        <p className="text-label-sm text-on-surface-variant">
          {!isStudent
            ? t('homework.previewNote')
            : graded
              ? t('homework.lockedGraded')
              : overdue && !assignment.allowLate
                ? t('homework.pastDue')
                : overdue
                  ? t('homework.willBeLate')
                  : t('homework.canResubmit')}
        </p>
        {saveError && <p className="text-body-sm font-semibold text-error">{saveError}</p>}
        {!locked && (
          <button
            type="button"
            onClick={submit}
            disabled={saving || content.trim() === ''}
            className="inline-flex items-center gap-2 self-start rounded-xl bg-primary px-unit-lg py-2 text-label-lg font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            <Icon name="send" className="text-[1.1rem]" />
            {saving
              ? t('homework.submitting')
              : mine
                ? t('homework.resubmit')
                : t('homework.submit')}
          </button>
        )}
      </div>
    </div>
  );
}
