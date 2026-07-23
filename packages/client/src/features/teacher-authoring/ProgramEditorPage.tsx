import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import type { ChapterView, ProgramContentView } from '@madrasty/shared';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Icon } from '../../components/Icon';
import { FormError } from '../auth/AuthLayout';
import { authErrorMessage } from '../auth/authError';
import { ProgramStatusPill, LessonStatusPill } from './StatusPill';
import { AddLessonForm } from './AddLessonForm';
import { programsApi } from './programs.api';
import { toLocalized } from './localized';

export function ProgramEditorPage() {
  const { t } = useTranslation();
  const { programId = '' } = useParams();
  const [program, setProgram] = useState<ProgramContentView | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const reload = useCallback(async () => {
    try {
      setProgram(await programsApi.getProgram(programId));
    } catch {
      setLoadError(true);
    }
  }, [programId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Flattened lesson list for the prerequisite picker (label = chapter + title).
  const allLessons =
    program?.chapters.flatMap((c, ci) =>
      c.lessons.map((l) => ({
        id: l.id,
        label: `${t('authoring.editor.chapterLabel', { n: ci + 1 })} · ${l.title || l.lessonType}`,
      })),
    ) ?? [];

  async function onSubmitProgram() {
    setPublishing(true);
    try {
      await programsApi.submitProgram(programId);
      await reload();
    } finally {
      setPublishing(false);
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl">
        <FormError message={t('authoring.editor.reloadError')} />
        <Link to="/app/teacher/programs" className="text-label-md text-primary hover:underline">
          {t('authoring.editor.back')}
        </Link>
      </div>
    );
  }

  if (!program) {
    return (
      <div className="flex justify-center py-unit-xl text-on-surface-variant">
        <Icon name="progress_activity" className="animate-spin text-[2rem]" />
      </div>
    );
  }

  const isDraft = program.status === 'draft';
  const isPending = program.status === 'pending_review';

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-unit-lg">
      <Link
        to="/app/teacher/programs"
        className="inline-flex w-fit items-center gap-1 text-label-md text-on-surface-variant hover:text-primary"
      >
        <Icon name="arrow_back" className="rtl:-scale-x-100" />
        {t('authoring.editor.back')}
      </Link>

      {/* Program header */}
      <div className="flex flex-wrap items-start justify-between gap-unit-md rounded-xl border border-outline-variant bg-surface-container-lowest p-unit-lg">
        <div>
          <div className="mb-unit-xs flex items-center gap-unit-sm">
            <h1 className="text-headline-md font-semibold">
              {program.title || t('authoring.myPrograms.untitled')}
            </h1>
            <ProgramStatusPill status={program.status} />
          </div>
          {program.description && (
            <p className="max-w-xl text-body-md text-on-surface-variant">{program.description}</p>
          )}
          <div className="mt-unit-sm flex flex-wrap gap-unit-md text-label-md text-on-surface-variant">
            {program.gradeLevel && (
              <span className="flex items-center gap-1">
                <Icon name="school" className="text-[1.1rem]" /> {program.gradeLevel}
              </span>
            )}
            {program.priceEgp && (
              <span className="flex items-center gap-1">
                <Icon name="payments" className="text-[1.1rem]" /> EGP {program.priceEgp}
              </span>
            )}
          </div>
        </div>
        {isDraft && (
          <Button variant="primary" onClick={onSubmitProgram} disabled={publishing}>
            <Icon name="send" className="rtl:-scale-x-100" />
            {publishing ? t('auth.actions.submitting') : t('authoring.editor.submitProgram')}
          </Button>
        )}
        {isPending && (
          <span className="flex items-center gap-1 rounded-lg bg-tertiary-container/50 px-3 py-2 text-label-md font-semibold text-on-tertiary-container">
            <Icon name="hourglass_top" filled className="text-[1.1rem]" />
            {t('authoring.editor.pendingBadge')}
          </span>
        )}
        {program.status === 'published' && (
          <span className="flex items-center gap-1 rounded-lg bg-secondary-container px-3 py-2 text-label-md font-semibold text-on-secondary-container">
            <Icon name="check_circle" filled className="text-[1.1rem]" />
            {t('authoring.editor.publishedBadge')}
          </span>
        )}
      </div>

      {/* Chapters */}
      {program.chapters.length === 0 ? (
        <p className="rounded-xl border border-dashed border-outline-variant p-unit-lg text-center text-body-md text-on-surface-variant">
          {t('authoring.editor.noChapters')}
        </p>
      ) : (
        program.chapters.map((chapter, index) => (
          <ChapterBlock
            key={chapter.id}
            programId={programId}
            chapter={chapter}
            index={index}
            existingLessons={allLessons}
            onChange={reload}
          />
        ))
      )}

      <AddChapterForm programId={programId} onCreated={reload} />
    </div>
  );
}

function ChapterBlock({
  programId,
  chapter,
  index,
  existingLessons,
  onChange,
}: {
  programId: string;
  chapter: ChapterView;
  index: number;
  existingLessons: { id: string; label: string }[];
  onChange: () => void;
}) {
  const { t } = useTranslation();

  async function publishLesson(lessonId: string) {
    await programsApi.publishLesson(programId, chapter.id, lessonId);
    onChange();
  }

  return (
    <section className="rounded-xl border border-outline-variant bg-surface-container-lowest p-unit-lg">
      <div className="mb-unit-md">
        <span className="text-label-sm uppercase tracking-wider text-on-surface-variant">
          {t('authoring.editor.chapterLabel', { n: index + 1 })}
        </span>
        <h2 className="text-headline-md">{chapter.title || '—'}</h2>
      </div>

      <div className="mb-unit-md flex flex-col gap-unit-sm">
        {chapter.lessons.length === 0 ? (
          <p className="text-label-md text-on-surface-variant">{t('authoring.editor.noLessons')}</p>
        ) : (
          chapter.lessons.map((lesson) => (
            <div
              key={lesson.id}
              className="flex flex-wrap items-center gap-unit-md rounded-lg border border-outline-variant bg-surface p-unit-sm"
            >
              <Icon name={lessonIcon(lesson.lessonType)} className="text-on-surface-variant" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-label-md font-semibold">
                  {lesson.title || t(`authoring.lessonTypes.${lesson.lessonType}`, lesson.lessonType)}
                </div>
                <div className="flex flex-wrap gap-unit-sm text-label-sm text-on-surface-variant">
                  <span>{t(`authoring.lessonTypes.${lesson.lessonType}`, lesson.lessonType)}</span>
                  <span>·</span>
                  <span>{t(`authoring.visibilities.${lesson.visibility}`, lesson.visibility)}</span>
                </div>
              </div>
              <LessonStatusPill status={lesson.status} />
              {lesson.status !== 'published' && (
                <button
                  type="button"
                  onClick={() => publishLesson(lesson.id)}
                  className="rounded-md border border-primary/20 px-2.5 py-1 text-label-sm font-medium text-primary hover:bg-primary/10"
                >
                  {t('authoring.editor.publishLesson')}
                </button>
              )}
            </div>
          ))
        )}
      </div>

      <AddLessonForm
        programId={programId}
        chapterId={chapter.id}
        existingLessons={existingLessons}
        onCreated={onChange}
      />
    </section>
  );
}

function AddChapterForm({ programId, onCreated }: { programId: string; onCreated: () => void }) {
  const { t } = useTranslation();
  const [titleEn, setTitleEn] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await programsApi.createChapter(programId, { title: toLocalized(titleEn, titleAr) });
      setTitleEn('');
      setTitleAr('');
      onCreated();
    } catch (err) {
      setError(authErrorMessage(t, err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-unit-md rounded-xl border border-dashed border-outline-variant p-unit-lg"
      noValidate
    >
      <h3 className="text-label-md font-semibold text-on-surface-variant">
        {t('authoring.editor.addChapter')}
      </h3>
      <FormError message={error} />
      <div className="grid grid-cols-1 gap-unit-md sm:grid-cols-2">
        <Input label={t('authoring.editor.chapterTitleEn')} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
        <Input label={t('authoring.editor.chapterTitleAr')} dir="rtl" value={titleAr} onChange={(e) => setTitleAr(e.target.value)} />
      </div>
      <Button type="submit" className="w-fit" disabled={submitting}>
        <Icon name="add" className="text-[1.1rem]" />
        {submitting ? t('auth.actions.submitting') : t('authoring.editor.saveChapter')}
      </Button>
    </form>
  );
}

function lessonIcon(type: string): string {
  const map: Record<string, string> = {
    recorded: 'play_circle',
    live: 'videocam',
    pdf: 'picture_as_pdf',
    audio: 'headphones',
    quiz: 'quiz',
    homework: 'assignment',
    exam: 'fact_check',
    private_session: 'record_voice_over',
  };
  return map[type] ?? 'article';
}
