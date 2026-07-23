import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router-dom';
import type { GuardianApprovalView } from '@madrasty/shared';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Icon } from '../../components/Icon';
import { AuthLayout, FormError } from './AuthLayout';
import { useAuth } from './AuthProvider';
import { authApi } from './auth.api';
import { authErrorMessage } from './authError';

type TerminalStatus = 'approved' | 'rejected' | 'expired';

const TERMINAL_ICON: Record<TerminalStatus, { icon: string; className: string }> = {
  approved: { icon: 'check_circle', className: 'bg-secondary-container text-on-secondary-container' },
  rejected: { icon: 'cancel', className: 'bg-error-container text-on-error-container' },
  expired: { icon: 'schedule', className: 'bg-surface-container-high text-on-surface-variant' },
};

export function GuardianApprovalPage() {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const location = useLocation();
  const { status: authStatus, user } = useAuth();

  const [view, setView] = useState<GuardianApprovalView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [otp, setOtp] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resolved, setResolved] = useState<TerminalStatus | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    authApi
      .getApproval(token, controller.signal)
      .then((data) => setView(data))
      .catch((err) => {
        if (!controller.signal.aborted) setLoadError(authErrorMessage(t, err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token, t]);

  async function onApprove(event: FormEvent) {
    event.preventDefault();
    setActionError(null);
    setSubmitting(true);
    try {
      await authApi.approve(token, { otp: otp.trim() });
      setResolved('approved');
    } catch (err) {
      setActionError(authErrorMessage(t, err));
    } finally {
      setSubmitting(false);
    }
  }

  async function onReject() {
    setActionError(null);
    setSubmitting(true);
    try {
      await authApi.reject(token);
      setResolved('rejected');
    } catch (err) {
      setActionError(authErrorMessage(t, err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || authStatus === 'loading') {
    return (
      <AuthLayout title={t('auth.approval.title')}>
        <div className="flex justify-center py-unit-lg text-on-surface-variant">
          <Icon name="progress_activity" className="animate-spin text-[2rem]" />
        </div>
      </AuthLayout>
    );
  }

  if (loadError || !view) {
    return (
      <AuthLayout title={t('auth.approval.title')}>
        <FormError message={loadError ?? t('auth.errors.generic')} />
      </AuthLayout>
    );
  }

  const effectiveStatus: GuardianApprovalView['status'] = resolved ?? view.status;
  const studentName = view.student.name ?? t('auth.approval.unknownStudent');

  // Terminal states: approved / rejected / expired — informational, no actions.
  if (effectiveStatus !== 'awaiting_parent') {
    const meta = TERMINAL_ICON[effectiveStatus];
    return (
      <AuthLayout title={t('auth.approval.title')}>
        <div className="flex flex-col items-center gap-unit-md text-center">
          <span className={`flex h-16 w-16 items-center justify-center rounded-full ${meta.className}`}>
            <Icon name={meta.icon} className="text-[2rem]" />
          </span>
          <p className="text-body-md text-on-surface-variant">
            {t(`auth.approval.status.${effectiveStatus}`, { name: studentName })}
          </p>
          <Link to="/" className="text-label-md font-semibold text-primary hover:underline">
            {t('auth.approval.backHome')}
          </Link>
        </div>
      </AuthLayout>
    );
  }

  // Awaiting a guardian who is not signed in as a parent — approving requires the
  // parent's session (the server checks the phone matches), so send them to login.
  if (authStatus !== 'authenticated' || user?.role !== 'parent') {
    const next = encodeURIComponent(location.pathname);
    return (
      <AuthLayout title={t('auth.approval.title')} subtitle={t('auth.approval.forStudent', { name: studentName })}>
        <div className="flex flex-col items-center gap-unit-md text-center">
          <p className="text-body-md text-on-surface-variant">{t('auth.approval.loginPrompt')}</p>
          <Link to={`/login?next=${next}`} className="w-full">
            <Button size="large" className="w-full">
              {t('auth.approval.loginAsGuardian')}
            </Button>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  // Signed-in parent: enter the OTP delivered to their phone, then approve/reject.
  return (
    <AuthLayout
      title={t('auth.approval.title')}
      subtitle={t('auth.approval.forStudent', { name: studentName })}
    >
      <div className="mb-unit-md rounded-lg border border-outline-variant bg-surface-container-low p-unit-md">
        <p className="text-label-sm uppercase tracking-wider text-on-surface-variant">
          {t('auth.approval.requestLabel')}
        </p>
        <p className="mt-unit-xs text-body-md font-semibold">{studentName}</p>
        {view.student.grade && (
          <p className="text-label-md text-on-surface-variant">
            {t('auth.fields.grade')}: {view.student.grade}
          </p>
        )}
      </div>

      <form onSubmit={onApprove} className="flex flex-col gap-unit-md" noValidate>
        <FormError message={actionError} />
        <Input
          label={t('auth.fields.otp')}
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
          inputMode="numeric"
          dir="ltr"
          placeholder={t('auth.fields.otpPlaceholder')}
          autoComplete="one-time-code"
        />
        <Button type="submit" size="large" disabled={submitting} className="w-full">
          {submitting ? t('auth.actions.submitting') : t('auth.approval.approve')}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onReject}
          disabled={submitting}
          className="w-full"
        >
          {t('auth.approval.reject')}
        </Button>
      </form>
    </AuthLayout>
  );
}
