import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type {
  AuthoredProgram,
  HomeworkAssignmentView,
  HomeworkQueueResponse,
  HomeworkQueueRow,
} from '@madrasty/shared';
import { Icon } from '../../components/Icon';
import { programsApi } from '../teacher-authoring/programs.api';
import { homeworkApi } from './homework.api';

interface HomeworkLesson {
  id: string;
  title: string | null;
  chapterTitle: string | null;
}

// Teacher homework screen (doc 12 §6): pick a homework-type lesson from one of
// your programs, write the assignment brief + deadline, then grade the text
// submissions that come in.
export function HomeworkBuilderPage() {
  const { t, i18n } = useTranslation();
  const [programs, setPrograms] = useState<AuthoredProgram[]>([]);
  const [programId, setProgramId] = useState('');
  const [homeworkLessons, setHomeworkLessons] = useState<HomeworkLesson[]>([]);
  const [lessonId, setLessonId] = useState('');
  const [assignment, setAssignment] = useState<HomeworkAssignmentView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    programsApi
      .listMine()
      .then((res) => setPrograms(res.programs))
      .catch(() => setError(t('homework.loadError')));
  }, [t]);

  // Load the selected program's homework-type lessons.
  useEffect(() => {
    setHomeworkLessons([]);
    setLessonId('');
    setAssignment(null);
    if (!programId) return;
    programsApi
      .getProgram(programId)
      .then((program) => {
        const lessons: HomeworkLesson[] = [];
        program.chapters.forEach((ch) =>
          ch.lessons
            .filter((l) => l.lessonType === 'homework')
            .forEach((l) => lessons.push({ id: l.id, title: l.title, chapterTitle: ch.title })),
        );
        setHomeworkLessons(lessons);
      })
      .catch(() => setError(t('homework.loadError')));
  }, [programId, t]);

  // Resolve the assignment for the chosen lesson (may not exist yet).
  const openLesson = async (id: string) => {
    setLessonId(id);
    setAssignment(null);
    setError(null);
    if (!id) return;
    setLoading(true);
    try {
      const found = await homeworkApi.getByLesson(id);
      setAssignment(
        found.assignmentId
          ? await homeworkApi.getAssignment(found.assignmentId, i18n.language)
          : null,
      );
    } catch {
      setError(t('homework.loadError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-unit-lg">
      <div>
        <h1 className="text-headline-lg font-semibold">{t('homework.builderTitle')}</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">{t('homework.builderSubtitle')}</p>
      </div>

      <div className="grid grid-cols-1 gap-unit-md sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-label-md font-medium text-on-surface-variant">
            {t('homework.program')}
          </span>
          <select
            value={programId}
            onChange={(e) => setProgramId(e.target.value)}
            className="field w-full"
          >
            <option value="">{t('homework.selectProgram')}</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title || p.id}
              </option>
            ))}
          </select>
        </label>

        {programId && (
          <label className="flex flex-col gap-1">
            <span className="text-label-md font-medium text-on-surface-variant">
              {t('homework.homeworkLesson')}
            </span>
            <select
              value={lessonId}
              onChange={(e) => openLesson(e.target.value)}
              className="field w-full"
            >
              <option value="">{t('homework.selectLesson')}</option>
              {homeworkLessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {(l.chapterTitle ? `${l.chapterTitle} · ` : '') + (l.title || l.id)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {programId && homeworkLessons.length === 0 && (
        <p className="rounded-xl border border-dashed border-outline-variant p-unit-md text-body-sm text-on-surface-variant">
          {t('homework.noHomeworkLessons')}
        </p>
      )}

      {error && <p className="text-body-md font-semibold text-error">{error}</p>}
      {loading && (
        <div className="flex justify-center py-unit-lg text-on-surface-variant">
          <Icon name="progress_activity" className="animate-spin text-[2rem]" />
        </div>
      )}

      {!loading && lessonId && (
        <AssignmentEditor
          lessonId={lessonId}
          assignment={assignment}
          onSaved={setAssignment}
        />
      )}

      {assignment && <GradingQueue assignmentId={assignment.id} />}
    </div>
  );
}

// Create-or-edit form for the assignment brief, deadline and max grade.
function AssignmentEditor({
  lessonId,
  assignment,
  onSaved,
}: {
  lessonId: string;
  assignment: HomeworkAssignmentView | null;
  onSaved: (a: HomeworkAssignmentView) => void;
}) {
  const { t, i18n } = useTranslation();
  const [brief, setBrief] = useState('');
  const [maxGrade, setMaxGrade] = useState('100');
  const [dueAt, setDueAt] = useState('');
  const [allowLate, setAllowLate] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Re-seed the form whenever a different assignment (or none) is opened. Keyed
  // on the id, not the object, so saving doesn't clobber what's on screen.
  useEffect(() => {
    setBrief(assignment?.brief ?? '');
    setMaxGrade(String(assignment?.maxGrade ?? 100));
    // <input type="datetime-local"> wants a local 'YYYY-MM-DDTHH:mm' value.
    setDueAt(assignment?.dueAt ? toLocalInputValue(assignment.dueAt) : '');
    setAllowLate(assignment?.allowLate ?? true);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignment?.id, lessonId]);

  // The "Saved." confirmation belongs to the lesson being edited — switching
  // lessons clears it, but creating the assignment (which changes its id) must not.
  useEffect(() => setSaved(false), [lessonId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brief.trim()) return setError(t('homework.briefRequired'));
    const lang = i18n.language;
    const payload = {
      brief: { [lang]: brief.trim() },
      maxGrade: Number(maxGrade) || 100,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      allowLate,
    };
    setSaving(true);
    setError(null);
    try {
      const view = assignment
        ? await homeworkApi.updateAssignment(assignment.id, payload, lang)
        : await homeworkApi.createAssignment({ lessonId, ...payload }, lang);
      onSaved(view);
      setSaved(true);
    } catch {
      setError(t('homework.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-unit-sm rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-unit-md"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body-lg font-semibold">
          {assignment ? t('homework.editAssignment') : t('homework.newAssignment')}
        </p>
        {assignment && (
          <Link
            to={`/app/homework/${assignment.id}`}
            className="inline-flex items-center gap-1 text-label-md text-primary hover:underline"
          >
            <Icon name="visibility" className="text-[1rem]" />
            {t('homework.previewLink')}
          </Link>
        )}
      </div>

      <textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={5}
        placeholder={t('homework.briefPlaceholder')}
        className="field w-full"
      />

      <div className="flex flex-wrap items-end gap-unit-md">
        <label className="flex flex-col gap-1">
          <span className="text-label-md text-on-surface-variant">{t('homework.maxGrade')}</span>
          <input
            type="number"
            min="1"
            value={maxGrade}
            onChange={(e) => setMaxGrade(e.target.value)}
            className="field-sm w-24"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-label-md text-on-surface-variant">{t('homework.dueAt')}</span>
          <input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="field-sm"
          />
        </label>
        <label className="flex items-center gap-2 pb-1.5 text-label-md text-on-surface-variant">
          <input
            type="checkbox"
            checked={allowLate}
            onChange={(e) => setAllowLate(e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          {t('homework.allowLate')}
        </label>
      </div>

      {error && <p className="text-body-sm font-semibold text-error">{error}</p>}
      {saved && !error && (
        <p className="text-body-sm font-semibold text-secondary">
          {t('homework.saved')}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center gap-2 self-start rounded-full bg-primary px-unit-lg py-2 text-label-lg font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        <Icon name="save" className="text-[1.1rem]" />
        {saving ? t('homework.saving') : t('homework.save')}
      </button>
    </form>
  );
}

// The teacher's grading queue for one assignment.
function GradingQueue({ assignmentId }: { assignmentId: string }) {
  const { t, i18n } = useTranslation();
  const [queue, setQueue] = useState<HomeworkQueueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setQueue(null);
    homeworkApi
      .listSubmissions(assignmentId, i18n.language)
      .then(setQueue)
      .catch(() => setError(t('homework.loadError')));
  }, [assignmentId, i18n.language, t]);

  if (error) return <p className="text-body-md font-semibold text-error">{error}</p>;
  if (!queue) return null;

  return (
    <section className="flex flex-col gap-unit-sm">
      <h2 className="text-title-lg font-semibold">
        {t('homework.queueTitle')}{' '}
        <span className="text-body-md font-normal text-on-surface-variant">
          {t('homework.pendingCount', { count: queue.assignment.pendingReviewCount ?? 0 })}
        </span>
      </h2>

      {queue.rows.length === 0 && (
        <p className="rounded-xl border border-dashed border-outline-variant p-unit-md text-body-sm text-on-surface-variant">
          {t('homework.noSubmissions')}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {queue.rows.map((row) => (
          <SubmissionCard
            key={row.submission.id}
            row={row}
            maxGrade={queue.assignment.maxGrade}
            onGraded={(submission) =>
              setQueue((prev) =>
                prev
                  ? {
                      ...prev,
                      rows: prev.rows.map((r) =>
                        r.submission.id === submission.id ? { ...r, submission } : r,
                      ),
                    }
                  : prev,
              )
            }
          />
        ))}
      </ul>

      {queue.missing.length > 0 && (
        <p className="text-body-sm text-on-surface-variant">
          {t('homework.missingStudents', {
            // Separator is locale-specific (Arabic uses ‘،’) — keep it in i18n.
            names: queue.missing.map((m) => m.fullName || m.id).join(t('homework.listSeparator')),
          })}
        </p>
      )}
    </section>
  );
}

function SubmissionCard({
  row,
  maxGrade,
  onGraded,
}: {
  row: HomeworkQueueRow;
  maxGrade: number;
  onGraded: (submission: HomeworkQueueRow['submission']) => void;
}) {
  const { t, i18n } = useTranslation();
  const { submission, student } = row;
  const [grade, setGrade] = useState(submission.grade === null ? '' : String(submission.grade));
  const [comment, setComment] = useState(submission.teacherComment ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const value = Number(grade);
    if (grade === '' || Number.isNaN(value) || value < 0 || value > maxGrade) {
      return setError(t('homework.invalidGrade', { max: maxGrade }));
    }
    setSaving(true);
    setError(null);
    try {
      onGraded(await homeworkApi.grade(submission.id, { grade: value, teacherComment: comment }));
    } catch {
      setError(t('homework.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest p-unit-md">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body-md font-semibold">{student.fullName || student.id}</p>
        <StatusChip status={submission.status} />
      </div>
      <p className="mt-1 text-label-sm text-on-surface-variant">
        {t('homework.submittedAt', {
          date: new Date(submission.submittedAt).toLocaleString(i18n.language),
        })}
      </p>
      <p className="mt-unit-sm whitespace-pre-wrap rounded-lg bg-surface-container px-unit-md py-2 text-body-md">
        {submission.content}
      </p>

      <div className="mt-unit-sm flex flex-wrap items-end gap-unit-sm">
        <label className="flex flex-col gap-1">
          <span className="text-label-sm text-on-surface-variant">
            {t('homework.gradeOutOf', { max: maxGrade })}
          </span>
          <input
            type="number"
            min="0"
            max={maxGrade}
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="field-sm w-24"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-label-sm text-on-surface-variant">{t('homework.feedback')}</span>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('homework.feedbackPlaceholder')}
            className="field-sm w-full"
          />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded-full bg-primary px-unit-md py-2 text-label-md font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Icon name="grading" className="text-[1rem]" />
          {saving ? t('homework.saving') : t('homework.saveGrade')}
        </button>
      </div>
      {error && <p className="mt-1 text-body-sm font-semibold text-error">{error}</p>}
    </li>
  );
}

export function StatusChip({ status }: { status: string }) {
  const { t } = useTranslation();
  const tone =
    status === 'graded'
      ? 'bg-secondary-container text-on-secondary-container'
      : status === 'late'
        ? 'bg-error-container text-on-error-container'
        : 'bg-surface-container text-on-surface-variant';
  return (
    <span className={`rounded-full px-unit-md py-0.5 text-label-sm font-medium ${tone}`}>
      {t(`homework.status.${status}`)}
    </span>
  );
}

// ISO → the 'YYYY-MM-DDTHH:mm' local form that <input type="datetime-local"> needs.
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
