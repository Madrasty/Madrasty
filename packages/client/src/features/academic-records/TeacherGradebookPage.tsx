import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  AuthoredProgram,
  ExamView,
  GradebookResponse,
  GradebookStudentRow,
} from '@madrasty/shared';
import { Icon } from '../../components/Icon';
import { programsApi } from '../teacher-authoring/programs.api';
import { academicRecordsApi } from './academic-records.api';

// Teacher gradebook (doc 10 §3.1): create exams and grade students. Exams are
// created from one of the teacher's programs (which supplies the subject and the
// roster). Two-pane: exam list on the left, the selected exam's gradebook right.
export function TeacherGradebookPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [exams, setExams] = useState<ExamView[] | null>(null);
  const [programs, setPrograms] = useState<AuthoredProgram[]>([]);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [gradebook, setGradebook] = useState<GradebookResponse | null>(null);
  const [creating, setCreating] = useState(false);

  const loadExams = useCallback(async () => {
    setError(false);
    try {
      const res = await academicRecordsApi.listMyExams(locale);
      setExams(res.exams);
    } catch {
      setError(true);
    }
  }, [locale]);

  useEffect(() => {
    void loadExams();
    programsApi
      .listMine()
      .then((res) => setPrograms(res.programs.filter((p) => p.subjectId)))
      .catch(() => setPrograms([]));
  }, [loadExams]);

  const openExam = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setCreating(false);
      setGradebook(null);
      try {
        setGradebook(await academicRecordsApi.getGradebook(id, locale));
      } catch {
        setError(true);
      }
    },
    [locale],
  );

  return (
    <div className="flex flex-col gap-unit-lg">
      <div className="flex flex-wrap items-end justify-between gap-unit-md">
        <div>
          <h1 className="text-headline-lg font-semibold">{t('academic.gradebookTitle')}</h1>
          <p className="mt-1 text-body-md text-on-surface-variant">{t('academic.gradebookSubtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setSelectedId(null);
            setGradebook(null);
          }}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-unit-md py-2 text-label-lg font-semibold text-on-primary transition-opacity hover:opacity-90"
        >
          <Icon name="add" className="text-[1.1rem]" />
          {t('academic.newExam')}
        </button>
      </div>

      <div className="grid min-h-[28rem] grid-cols-1 gap-unit-md md:grid-cols-[20rem_1fr]">
        <ExamList exams={exams} error={error} selectedId={selectedId} onSelect={openExam} />

        <div className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest">
          {creating ? (
            <NewExamForm
              programs={programs}
              onCreated={(exam) => {
                setCreating(false);
                setExams((prev) => [exam, ...(prev ?? [])]);
                void openExam(exam.id);
              }}
              onCancel={() => setCreating(false)}
            />
          ) : selectedId && gradebook ? (
            <GradebookView key={selectedId} gradebook={gradebook} />
          ) : selectedId ? (
            <CenteredSpinner />
          ) : (
            <EmptyPane icon="grading" text={t('academic.selectExam')} />
          )}
        </div>
      </div>
    </div>
  );
}

function ExamList({
  exams,
  error,
  selectedId,
  onSelect,
}: {
  exams: ExamView[] | null;
  error: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (error) {
    return (
      <div className="rounded-xl border border-dashed border-error/40 bg-error/5 p-unit-lg text-center">
        <Icon name="error" className="text-[2rem] text-error" />
        <p className="mt-2 text-body-md font-semibold">{t('academic.loadError')}</p>
      </div>
    );
  }
  if (exams === null) {
    return (
      <div className="rounded-xl border border-outline-variant/60 bg-surface-container-lowest">
        <CenteredSpinner />
      </div>
    );
  }
  if (exams.length === 0) {
    return (
      <div className="flex flex-col items-center gap-unit-sm rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-unit-lg text-center">
        <Icon name="grading" className="text-[2rem] text-on-surface-variant" />
        <p className="text-body-md font-semibold">{t('academic.noExams')}</p>
        <p className="text-body-sm text-on-surface-variant">{t('academic.noExamsHint')}</p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {exams.map((exam) => {
        const active = exam.id === selectedId;
        return (
          <li key={exam.id}>
            <button
              type="button"
              onClick={() => onSelect(exam.id)}
              className={`flex w-full flex-col gap-1 rounded-xl border p-unit-md text-start transition-colors ${
                active
                  ? 'border-primary bg-primary/5'
                  : 'border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low'
              }`}
            >
              <span className="truncate text-body-md font-semibold text-on-surface">
                {exam.title || t('academic.untitledExam')}
              </span>
              <span className="text-label-md text-on-surface-variant">
                {t('academic.outOf', { max: exam.maxScore })}
                {exam.term ? ` · ${exam.term}` : ''}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function NewExamForm({
  programs,
  onCreated,
  onCancel,
}: {
  programs: AuthoredProgram[];
  onCreated: (exam: ExamView) => void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [programId, setProgramId] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [maxScore, setMaxScore] = useState('100');
  const [weight, setWeight] = useState('1');
  const [term, setTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const program = programs.find((p) => p.id === programId);
    if (!program || !program.subjectId) {
      setError(t('academic.pickProgram'));
      return;
    }
    const title: { ar?: string; en?: string } = {};
    if (titleEn.trim()) title.en = titleEn.trim();
    if (titleAr.trim()) title.ar = titleAr.trim();
    if (!title.ar && !title.en) {
      setError(t('academic.titleRequired'));
      return;
    }
    const max = Number(maxScore);
    if (!Number.isFinite(max) || max <= 0) {
      setError(t('academic.invalidMax'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const exam = await academicRecordsApi.createExam(
        {
          subjectId: program.subjectId,
          programId: program.id,
          title,
          maxScore: max,
          weight: Number(weight) || 1,
          term: term.trim() || null,
        },
        i18n.language,
      );
      onCreated(exam);
    } catch {
      setError(t('academic.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-outline-variant/60 p-unit-md">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 text-label-md text-on-surface-variant hover:text-primary"
        >
          <Icon name="arrow_back" className="text-[1.1rem] rtl:-scale-x-100" />
          {t('academic.back')}
        </button>
        <p className="text-body-lg font-semibold">{t('academic.newExam')}</p>
      </header>

      <div className="flex flex-1 flex-col gap-unit-md overflow-y-auto p-unit-md">
        {programs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-outline-variant p-unit-md text-body-sm text-on-surface-variant">
            {t('academic.noProgramsHint')}
          </p>
        ) : (
          <Field label={t('academic.program')}>
            <select
              value={programId}
              onChange={(e) => setProgramId(e.target.value)}
              className="field w-full"
            >
              <option value="">{t('academic.selectProgram')}</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title || p.id}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="grid grid-cols-1 gap-unit-md sm:grid-cols-2">
          <Field label={t('academic.titleEn')}>
            <TextInput value={titleEn} onChange={setTitleEn} placeholder="Midterm exam" />
          </Field>
          <Field label={t('academic.titleAr')}>
            <TextInput value={titleAr} onChange={setTitleAr} placeholder="امتحان منتصف الفصل" dir="rtl" />
          </Field>
          <Field label={t('academic.maxScore')}>
            <TextInput value={maxScore} onChange={setMaxScore} type="number" />
          </Field>
          <Field label={t('academic.weight')}>
            <TextInput value={weight} onChange={setWeight} type="number" />
          </Field>
          <Field label={t('academic.term')}>
            <TextInput value={term} onChange={setTerm} placeholder="term1_2025" />
          </Field>
        </div>

        {error && <p className="text-body-sm font-semibold text-error">{error}</p>}
      </div>

      <div className="border-t border-outline-variant/60 p-unit-md">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-unit-lg py-2 text-label-lg font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Icon name="save" className="text-[1.1rem]" />
          {saving ? t('academic.saving') : t('academic.createExam')}
        </button>
      </div>
    </form>
  );
}

function GradebookView({ gradebook }: { gradebook: GradebookResponse }) {
  const { t } = useTranslation();
  const { exam, rows } = gradebook;
  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-outline-variant/60 p-unit-md">
        <p className="text-body-lg font-semibold text-on-surface">
          {exam.title || t('academic.untitledExam')}
        </p>
        <p className="text-label-md text-on-surface-variant">
          {t('academic.outOf', { max: exam.maxScore })}
          {exam.term ? ` · ${exam.term}` : ''}
        </p>
      </header>
      <div className="flex-1 overflow-y-auto p-unit-md">
        {rows.length === 0 ? (
          <p className="py-unit-lg text-center text-body-md text-on-surface-variant">
            {t('academic.noStudents')}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <GradeRow key={row.student.id} examId={exam.id} maxScore={exam.maxScore} row={row} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function GradeRow({
  examId,
  maxScore,
  row,
}: {
  examId: string;
  maxScore: number;
  row: GradebookStudentRow;
}) {
  const { t } = useTranslation();
  const [score, setScore] = useState(row.result ? String(row.result.score) : '');
  const [comment, setComment] = useState(row.result?.teacherComment ?? '');
  const [percentage, setPercentage] = useState(row.result?.percentage ?? null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  const save = async () => {
    const value = Number(score);
    if (!Number.isFinite(value) || value < 0 || value > maxScore) {
      setError(true);
      return;
    }
    setSaving(true);
    setError(false);
    try {
      const updated = await academicRecordsApi.recordResult(examId, {
        studentId: row.student.id,
        score: value,
        comment: comment.trim() || null,
      });
      setPercentage(updated.result?.percentage ?? null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-unit-sm rounded-xl border border-outline-variant/60 p-unit-md">
      <span className="min-w-[8rem] flex-1 text-body-md font-medium text-on-surface">
        {row.student.fullName ?? t('academic.unknownStudent')}
      </span>
      <input
        type="number"
        value={score}
        onChange={(e) => setScore(e.target.value)}
        placeholder="—"
        aria-invalid={Boolean(error)}
        className="field-sm w-20 text-center"
      />
      <span className="w-14 text-center text-label-md text-on-surface-variant">
        {percentage !== null ? `${percentage}%` : ''}
      </span>
      <input
        type="text"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t('academic.commentPlaceholder')}
        className="field-sm min-w-[8rem] flex-1"
      />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-unit-sm py-1.5 text-label-md font-semibold text-primary transition-colors hover:bg-primary/20 disabled:opacity-40"
      >
        <Icon
          name={saved ? 'check' : 'save'}
          className={`text-[1rem] ${saving ? 'animate-pulse' : ''}`}
        />
        {saved ? t('academic.saved') : t('academic.save')}
      </button>
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-label-md font-medium text-on-surface-variant">{label}</span>
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  type = 'text',
  placeholder,
  dir,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  dir?: 'rtl' | 'ltr';
}) {
  return (
    <input
      type={type}
      value={value}
      dir={dir}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="field w-full"
    />
  );
}

function CenteredSpinner() {
  return (
    <div className="flex justify-center py-unit-xl text-on-surface-variant">
      <Icon name="progress_activity" className="animate-spin text-[2rem]" />
    </div>
  );
}

function EmptyPane({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-unit-sm p-unit-xl text-center text-on-surface-variant">
      <Icon name={icon} className="text-[2.5rem]" />
      <p className="text-body-md">{text}</p>
    </div>
  );
}
