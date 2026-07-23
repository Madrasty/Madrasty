import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import type { ChapterView, LessonView, ProgramContentView } from '@madrasty/shared';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { catalogApi } from './catalog.api';
import { lessonTypeIcon, lessonTypeLabelKey } from './lessonTypeMeta';
import { EnrollButton } from '../payments/EnrollButton';

// Public program detail (doc 12): the full chapter/lesson tree with per-lesson
// access already resolved server-side (`locked`). Free-preview lessons open in
// the player; everything else is gated. Enrollment/checkout is roadmap step 4,
// so the enroll CTA is present but disabled ("coming soon") — no payments yet.
export function ProgramDetailPage() {
  const { t, i18n } = useTranslation();
  const { programId } = useParams<{ programId: string }>();
  const [program, setProgram] = useState<ProgramContentView | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!programId) return;
    let active = true;
    setProgram(null);
    setError(false);
    catalogApi
      .getProgram(programId, i18n.language)
      .then((res) => active && setProgram(res))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [programId, i18n.language]);

  const lessonCount = (program?.chapters ?? []).reduce((n, c) => n + c.lessons.length, 0);
  const isFree = !program?.priceEgp || Number(program.priceEgp) === 0;

  return (
    <div className="flex flex-col gap-unit-lg">
      <Link
        to="/app/catalog"
        className="inline-flex items-center gap-1 text-label-md text-on-surface-variant hover:text-primary"
      >
        <Icon name="arrow_back" className="text-[1.1rem] rtl:-scale-x-100" />
        {t('catalog.backToCatalog')}
      </Link>

      {program === null && !error && (
        <div className="flex justify-center py-unit-xl text-on-surface-variant">
          <Icon name="progress_activity" className="animate-spin text-[2rem]" />
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center gap-unit-sm rounded-xl border border-dashed border-error/40 bg-error/5 p-unit-xl text-center">
          <Icon name="error" className="text-[2.5rem] text-error" />
          <p className="text-body-lg font-semibold">{t('catalog.notFound')}</p>
          <Link to="/app/catalog" className="mt-unit-sm">
            <Button variant="secondary">{t('catalog.backToCatalog')}</Button>
          </Link>
        </div>
      )}

      {program && !error && (
        <>
          <header className="flex flex-col gap-unit-md rounded-xl border border-outline-variant bg-surface-container-lowest p-unit-lg lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-col gap-unit-sm">
              <div className="flex flex-wrap items-center gap-2">
                {program.gradeLevel && (
                  <span className="rounded-full bg-surface-container-low px-2 py-0.5 text-label-sm text-on-surface-variant">
                    {program.gradeLevel}
                  </span>
                )}
                <span className="text-label-sm text-on-surface-variant">
                  {t('catalog.lessonCount', { count: lessonCount })}
                </span>
              </div>
              <h1 className="text-headline-lg font-semibold">
                {program.title || t('catalog.untitled')}
              </h1>
              {program.description && (
                <p className="max-w-2xl text-body-md text-on-surface-variant">
                  {program.description}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col items-start gap-unit-sm lg:items-end">
              <span className="text-headline-md font-bold text-primary">
                {isFree ? t('catalog.free') : t('catalog.price', { price: program.priceEgp })}
              </span>
              {isFree ? (
                <span className="inline-flex items-center gap-1 text-label-sm text-on-surface-variant">
                  <Icon name="lock_open" className="text-[1rem]" />
                  {t('catalog.freeNote')}
                </span>
              ) : (
                <EnrollButton programId={program.id} />
              )}
            </div>
          </header>

          <div className="flex flex-col gap-unit-md">
            <h2 className="text-headline-md font-semibold">{t('catalog.contents')}</h2>
            {program.chapters.length === 0 && (
              <p className="rounded-lg border border-dashed border-outline-variant bg-surface-container-lowest p-unit-lg text-center text-body-md text-on-surface-variant">
                {t('catalog.noContent')}
              </p>
            )}
            {program.chapters.map((chapter) => (
              <ChapterBlock key={chapter.id} chapter={chapter} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ChapterBlock({ chapter }: { chapter: ChapterView }) {
  const { t } = useTranslation();
  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
      <div className="border-b border-outline-variant bg-surface-container-low px-unit-md py-unit-sm">
        <h3 className="text-body-lg font-semibold text-on-surface">
          {chapter.title || t('catalog.untitledChapter')}
        </h3>
        {chapter.description && (
          <p className="mt-0.5 text-label-md text-on-surface-variant">{chapter.description}</p>
        )}
      </div>
      <ul className="divide-y divide-outline-variant/60">
        {chapter.lessons.length === 0 && (
          <li className="px-unit-md py-unit-sm text-label-md text-on-surface-variant">
            {t('catalog.noLessons')}
          </li>
        )}
        {chapter.lessons.map((lesson) => (
          <LessonRow key={lesson.id} lesson={lesson} />
        ))}
      </ul>
    </section>
  );
}

function LessonRow({ lesson }: { lesson: LessonView }) {
  const { t } = useTranslation();
  const labelKey = lessonTypeLabelKey(lesson.lessonType);
  const typeLabel = labelKey ? t(labelKey) : lesson.lessonType;
  const isFreePreview = lesson.visibility === 'free' && !lesson.locked;

  const inner = (
    <div className="flex items-center gap-unit-md px-unit-md py-unit-sm">
      <Icon
        name={lesson.locked ? 'lock' : lessonTypeIcon(lesson.lessonType)}
        filled={!lesson.locked}
        className={`text-[1.35rem] ${lesson.locked ? 'text-on-surface-variant' : 'text-primary'}`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-md font-medium text-on-surface">
          {lesson.title || typeLabel}
        </p>
        <p className="text-label-sm text-on-surface-variant">{typeLabel}</p>
      </div>
      {isFreePreview && (
        <span className="rounded-full bg-secondary/15 px-2 py-0.5 text-label-sm font-semibold text-secondary">
          {t('catalog.freePreview')}
        </span>
      )}
      {lesson.locked ? (
        <Icon name="lock" className="text-[1.1rem] text-on-surface-variant" />
      ) : (
        <Icon name="arrow_forward" className="text-[1.1rem] text-on-surface-variant rtl:-scale-x-100" />
      )}
    </div>
  );

  // Unlocked lessons open in the player; locked ones are non-interactive.
  return lesson.locked ? (
    <li className="opacity-70">{inner}</li>
  ) : (
    <li className="transition-colors hover:bg-surface-container-low">
      <Link to="/learn" aria-label={lesson.title ?? typeLabel} className="block">
        {inner}
      </Link>
    </li>
  );
}
