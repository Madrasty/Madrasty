import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PendingProgram } from '@madrasty/shared';
import { Icon } from '../../components/Icon';
import { adminApi } from './admin.api';
import { ReviewState } from './ReviewState';
import { RowActions } from './TeacherVerificationPage';

// Admin program-approval queue (doc 09). Approve publishes the program to the
// catalog; reject returns it to the teacher as a draft. Both are audited.
export function ProgramApprovalsPage() {
  const { t, i18n } = useTranslation();
  const [programs, setPrograms] = useState<PendingProgram[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    adminApi
      .listPendingPrograms(i18n.language)
      .then((r) => active && setPrograms(r.programs))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [i18n.language]);

  async function act(programId: string, action: 'approve' | 'reject') {
    setBusy(programId);
    try {
      if (action === 'approve') await adminApi.approveProgram(programId);
      else await adminApi.rejectProgram(programId);
      setPrograms((cur) => cur?.filter((p) => p.id !== programId) ?? cur);
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }

  const dateFmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });

  return (
    <div className="flex flex-col gap-unit-lg">
      <div>
        <h1 className="text-headline-lg font-semibold">{t('admin.approvals.title')}</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">{t('admin.approvals.subtitle')}</p>
      </div>

      <ReviewState
        items={programs}
        error={error}
        emptyIcon="fact_check"
        emptyTitle={t('admin.approvals.empty')}
        emptyHint={t('admin.approvals.emptyHint')}
      >
        <div className="flex flex-col gap-unit-md">
          {(programs ?? []).map((program) => (
            <div
              key={program.id}
              className="flex flex-col gap-unit-md rounded-xl border border-outline-variant bg-surface-container-lowest p-unit-md sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <h2 className="truncate text-body-lg font-semibold text-on-surface">
                  {program.title || t('admin.review.untitled')}
                </h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-label-sm text-on-surface-variant">
                  <span className="inline-flex items-center gap-1">
                    <Icon name="person" className="text-[1rem]" />
                    {program.teacherName || t('admin.review.unnamed')}
                  </span>
                  {program.gradeLevel && <span>{program.gradeLevel}</span>}
                  <span className="font-semibold text-primary">
                    {program.priceEgp && Number(program.priceEgp) > 0
                      ? t('admin.approvals.price', { price: program.priceEgp })
                      : t('admin.approvals.free')}
                  </span>
                  {program.submittedAt && (
                    <span>
                      {t('admin.approvals.submitted', {
                        date: dateFmt.format(new Date(program.submittedAt)),
                      })}
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0">
                <RowActions
                  busy={busy === program.id}
                  onApprove={() => act(program.id, 'approve')}
                  onReject={() => act(program.id, 'reject')}
                  approveLabel={t('admin.review.approve')}
                  rejectLabel={t('admin.review.reject')}
                />
              </div>
            </div>
          ))}
        </div>
      </ReviewState>
    </div>
  );
}
