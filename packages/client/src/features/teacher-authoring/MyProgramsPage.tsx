import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { AuthoredProgram } from '@madrasty/shared';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { ProgramStatusPill } from './StatusPill';
import { programsApi } from './programs.api';

export function MyProgramsPage() {
  const { t } = useTranslation();
  const [programs, setPrograms] = useState<AuthoredProgram[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    programsApi
      .listMine()
      .then((res) => active && setPrograms(res.programs))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-unit-lg">
      <div className="flex flex-wrap items-end justify-between gap-unit-md">
        <div>
          <h1 className="text-headline-lg font-semibold">{t('authoring.myPrograms.title')}</h1>
          <p className="mt-1 text-body-md text-on-surface-variant">
            {t('authoring.myPrograms.subtitle')}
          </p>
        </div>
        <Link to="/app/teacher/programs/new">
          <Button variant="primary" size="large">
            <Icon name="add" filled />
            {t('authoring.myPrograms.new')}
          </Button>
        </Link>
      </div>

      {programs === null && !error && (
        <div className="flex justify-center py-unit-xl text-on-surface-variant">
          <Icon name="progress_activity" className="animate-spin text-[2rem]" />
        </div>
      )}

      {programs !== null && programs.length === 0 && (
        <div className="flex flex-col items-center gap-unit-sm rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-unit-xl text-center">
          <Icon name="school" className="text-[2.5rem] text-on-surface-variant" />
          <p className="text-body-lg font-semibold">{t('authoring.myPrograms.empty')}</p>
          <p className="text-body-md text-on-surface-variant">{t('authoring.myPrograms.emptyHint')}</p>
          <Link to="/app/teacher/programs/new" className="mt-unit-sm">
            <Button variant="primary">{t('authoring.myPrograms.new')}</Button>
          </Link>
        </div>
      )}

      {programs !== null && programs.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low text-xs uppercase tracking-wider text-on-surface-variant">
                <th className="px-unit-md py-3 text-start font-semibold">
                  {t('authoring.myPrograms.colTitle')}
                </th>
                <th className="hidden px-unit-md py-3 text-start font-semibold sm:table-cell">
                  {t('authoring.myPrograms.colGrade')}
                </th>
                <th className="hidden px-unit-md py-3 text-start font-semibold sm:table-cell">
                  {t('authoring.myPrograms.colPrice')}
                </th>
                <th className="px-unit-md py-3 text-start font-semibold">
                  {t('authoring.myPrograms.colStatus')}
                </th>
                <th className="px-unit-md py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/60">
              {programs.map((p) => (
                <tr key={p.id} className="hover:bg-surface-container-low/50">
                  <td className="px-unit-md py-3 font-semibold text-on-surface">
                    {p.title || t('authoring.myPrograms.untitled')}
                  </td>
                  <td className="hidden px-unit-md py-3 text-on-surface-variant sm:table-cell">
                    {p.gradeLevel || '—'}
                  </td>
                  <td className="hidden px-unit-md py-3 text-on-surface-variant sm:table-cell">
                    {p.priceEgp ? `EGP ${p.priceEgp}` : '—'}
                  </td>
                  <td className="px-unit-md py-3">
                    <ProgramStatusPill status={p.status} />
                  </td>
                  <td className="px-unit-md py-3 text-end">
                    <Link
                      to={`/app/teacher/programs/${p.id}`}
                      className="inline-flex items-center gap-1 rounded-md border border-primary/20 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/10"
                    >
                      {t('authoring.myPrograms.open')}
                      <Icon name="arrow_forward" className="text-[1rem] rtl:-scale-x-100" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
