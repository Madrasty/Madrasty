import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { ProgramSummary } from '@madrasty/shared';
import { Icon } from '../../components/Icon';
import { catalogApi } from './catalog.api';

// Public catalog: the published Learning Programs a student/parent can browse
// before enrolling (doc 12). Free-preview only — no payments yet (roadmap step
// 4), so cards link to the program detail page, not a checkout.
export function CatalogBrowsePage() {
  const { t, i18n } = useTranslation();
  const [programs, setPrograms] = useState<ProgramSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [gradeLevel, setGradeLevel] = useState('');

  useEffect(() => {
    let active = true;
    setPrograms(null);
    setError(false);
    catalogApi
      .listPublished({ gradeLevel: gradeLevel || undefined, locale: i18n.language })
      .then((res) => active && setPrograms(res.programs))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [gradeLevel, i18n.language]);

  // Grade filter options are derived from what's actually returned, so the
  // filter never offers an empty result set. Unfiltered load seeds the list.
  const grades = useMemo(() => {
    const seen = new Set<string>();
    (programs ?? []).forEach((p) => p.gradeLevel && seen.add(p.gradeLevel));
    return [...seen].sort();
  }, [programs]);

  return (
    <div className="flex flex-col gap-unit-lg">
      <div className="flex flex-wrap items-end justify-between gap-unit-md">
        <div>
          <h1 className="text-headline-lg font-semibold">{t('catalog.title')}</h1>
          <p className="mt-1 text-body-md text-on-surface-variant">{t('catalog.subtitle')}</p>
        </div>
        {programs !== null && !error && (
          <span className="text-label-md text-on-surface-variant">
            {t('catalog.found', { count: programs.length })}
          </span>
        )}
      </div>

      {(grades.length > 0 || gradeLevel) && (
        <div className="flex flex-wrap items-center gap-unit-sm">
          <FilterChip active={gradeLevel === ''} onClick={() => setGradeLevel('')}>
            {t('catalog.allGrades')}
          </FilterChip>
          {grades.map((g) => (
            <FilterChip key={g} active={gradeLevel === g} onClick={() => setGradeLevel(g)}>
              {g}
            </FilterChip>
          ))}
        </div>
      )}

      {programs === null && !error && (
        <div className="flex justify-center py-unit-xl text-on-surface-variant">
          <Icon name="progress_activity" className="animate-spin text-[2rem]" />
        </div>
      )}

      {error && (
        <div className="flex flex-col items-center gap-unit-sm rounded-xl border border-dashed border-error/40 bg-error/5 p-unit-xl text-center">
          <Icon name="error" className="text-[2.5rem] text-error" />
          <p className="text-body-lg font-semibold">{t('catalog.error')}</p>
        </div>
      )}

      {programs !== null && !error && programs.length === 0 && (
        <div className="flex flex-col items-center gap-unit-sm rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-unit-xl text-center">
          <Icon name="school" className="text-[2.5rem] text-on-surface-variant" />
          <p className="text-body-lg font-semibold">{t('catalog.empty')}</p>
          <p className="text-body-md text-on-surface-variant">{t('catalog.emptyHint')}</p>
        </div>
      )}

      {programs !== null && !error && programs.length > 0 && (
        <div className="grid grid-cols-1 gap-unit-md sm:grid-cols-2 lg:grid-cols-3">
          {programs.map((program) => (
            <ProgramCard key={program.id} program={program} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-unit-md py-1.5 text-label-md transition-colors ${
        active
          ? 'border-primary bg-primary/10 font-semibold text-primary'
          : 'border-outline-variant text-on-surface-variant hover:bg-surface-container-low'
      }`}
    >
      {children}
    </button>
  );
}

function ProgramCard({ program }: { program: ProgramSummary }) {
  const { t } = useTranslation();
  const isFree = !program.priceEgp || Number(program.priceEgp) === 0;

  return (
    <Link
      to={`/app/catalog/${program.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest transition-shadow hover:shadow-md"
    >
      <div className="flex h-28 items-center justify-center bg-primary/5 text-primary/70">
        <Icon name="menu_book" filled className="text-[2.5rem]" />
      </div>
      <div className="flex flex-1 flex-col gap-unit-sm p-unit-md">
        <div className="flex flex-wrap items-center gap-2">
          {program.gradeLevel && (
            <span className="rounded-full bg-surface-container-low px-2 py-0.5 text-label-sm text-on-surface-variant">
              {program.gradeLevel}
            </span>
          )}
        </div>
        <h2 className="text-body-lg font-semibold text-on-surface group-hover:text-primary">
          {program.title || t('catalog.untitled')}
        </h2>
        {program.description && (
          <p className="line-clamp-2 text-body-md text-on-surface-variant">{program.description}</p>
        )}
        <div className="mt-auto flex items-center justify-between pt-unit-sm">
          <span className="text-body-lg font-bold text-primary">
            {isFree ? t('catalog.free') : t('catalog.price', { price: program.priceEgp })}
          </span>
          <span className="inline-flex items-center gap-1 text-label-md text-on-surface-variant group-hover:text-primary">
            {t('catalog.view')}
            <Icon name="arrow_forward" className="text-[1rem] rtl:-scale-x-100" />
          </span>
        </div>
      </div>
    </Link>
  );
}
