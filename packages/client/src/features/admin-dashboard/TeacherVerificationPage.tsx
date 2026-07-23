import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PendingTeacher } from '@madrasty/shared';
import { Icon } from '../../components/Icon';
import { adminApi } from './admin.api';
import { ReviewState } from './ReviewState';

// Admin teacher-verification queue (doc 09). Verify/reject each writes an audit
// entry server-side; the row leaves the queue on success.
export function TeacherVerificationPage() {
  const { t, i18n } = useTranslation();
  const [teachers, setTeachers] = useState<PendingTeacher[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    adminApi
      .listPendingTeachers()
      .then((r) => active && setTeachers(r.teachers))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, []);

  async function act(userId: string, action: 'verify' | 'reject') {
    setBusy(userId);
    try {
      if (action === 'verify') await adminApi.verifyTeacher(userId);
      else await adminApi.rejectTeacher(userId);
      setTeachers((cur) => cur?.filter((x) => x.userId !== userId) ?? cur);
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
        <h1 className="text-headline-lg font-semibold">{t('admin.verification.title')}</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          {t('admin.verification.subtitle')}
        </p>
      </div>

      <ReviewState
        items={teachers}
        error={error}
        emptyIcon="how_to_reg"
        emptyTitle={t('admin.verification.empty')}
        emptyHint={t('admin.verification.emptyHint')}
      >
        <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
          <table className="w-full text-start text-sm">
            <thead>
              <tr className="border-b border-outline-variant bg-surface-container-low text-xs uppercase tracking-wider text-on-surface-variant">
                <th className="px-unit-md py-3 text-start font-semibold">
                  {t('admin.verification.colApplicant')}
                </th>
                <th className="hidden px-unit-md py-3 text-start font-semibold sm:table-cell">
                  {t('admin.verification.colContact')}
                </th>
                <th className="hidden px-unit-md py-3 text-start font-semibold sm:table-cell">
                  {t('admin.verification.colApplied')}
                </th>
                <th className="px-unit-md py-3 text-end font-semibold">
                  {t('admin.review.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/60">
              {(teachers ?? []).map((teacher) => (
                <tr key={teacher.userId} className="align-middle hover:bg-surface-container-low/50">
                  <td className="px-unit-md py-3 font-semibold text-on-surface">
                    {teacher.fullName || t('admin.review.unnamed')}
                  </td>
                  <td className="hidden px-unit-md py-3 text-on-surface-variant sm:table-cell">
                    {teacher.email || teacher.phone || '—'}
                  </td>
                  <td className="hidden px-unit-md py-3 text-on-surface-variant sm:table-cell">
                    {dateFmt.format(new Date(teacher.createdAt))}
                  </td>
                  <td className="px-unit-md py-3">
                    <RowActions
                      busy={busy === teacher.userId}
                      onApprove={() => act(teacher.userId, 'verify')}
                      onReject={() => act(teacher.userId, 'reject')}
                      approveLabel={t('admin.review.verify')}
                      rejectLabel={t('admin.review.reject')}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReviewState>
    </div>
  );
}

export function RowActions({
  busy,
  onApprove,
  onReject,
  approveLabel,
  rejectLabel,
}: {
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  approveLabel: string;
  rejectLabel: string;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={onReject}
        className="inline-flex items-center gap-1 rounded-md border border-error/30 px-3 py-1.5 text-sm font-medium text-error hover:bg-error/10 disabled:opacity-50"
      >
        <Icon name="close" className="text-[1rem]" />
        {rejectLabel}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onApprove}
        className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
      >
        <Icon name={busy ? 'progress_activity' : 'check'} className={busy ? 'animate-spin text-[1rem]' : 'text-[1rem]'} />
        {approveLabel}
      </button>
    </div>
  );
}
