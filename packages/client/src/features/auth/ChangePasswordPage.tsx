import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Icon } from '../../components/Icon';
import { AuthLayout, FormError } from './AuthLayout';
import { useAuth } from './AuthProvider';
import { authApi } from './auth.api';
import { authErrorMessage } from './authError';
import { roleHome } from '../../app/navigation';

type Field = 'current' | 'next' | 'confirm';

export function ChangePasswordPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [values, setValues] = useState<Record<Field, string>>({ current: '', next: '', confirm: '' });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const set = (field: Field) => (e: { target: { value: string } }) =>
    setValues((prev) => ({ ...prev, [field]: e.target.value }));

  function validate(): boolean {
    const next: Partial<Record<Field, string>> = {};
    if (values.current.length < 1) next.current = t('auth.validation.currentPassword');
    if (values.next.length < 8) next.next = t('auth.validation.password');
    if (values.confirm !== values.next) next.confirm = t('auth.validation.confirm');
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      await authApi.changePassword({ currentPassword: values.current, newPassword: values.next });
      setDone(true);
    } catch (err) {
      setError(authErrorMessage(t, err));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <AuthLayout title={t('auth.changePassword.doneTitle')}>
        <div className="flex flex-col items-center gap-unit-md text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
            <Icon name="check_circle" className="text-[2rem]" />
          </span>
          <p className="text-body-md text-on-surface-variant">{t('auth.changePassword.doneBody')}</p>
          <Button onClick={() => navigate(roleHome(user?.role ?? 'student'))} size="large">
            {t('auth.changePassword.backToDashboard')}
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title={t('auth.changePassword.title')} subtitle={t('auth.changePassword.subtitle')}>
      <form onSubmit={onSubmit} className="flex flex-col gap-unit-md" noValidate>
        <FormError message={error} />
        <Input
          label={t('auth.fields.currentPassword')}
          type="password"
          value={values.current}
          onChange={set('current')}
          error={fieldErrors.current}
          autoComplete="current-password"
        />
        <Input
          label={t('auth.fields.newPassword')}
          type="password"
          value={values.next}
          onChange={set('next')}
          error={fieldErrors.next}
          autoComplete="new-password"
        />
        <Input
          label={t('auth.fields.confirmPassword')}
          type="password"
          value={values.confirm}
          onChange={set('confirm')}
          error={fieldErrors.confirm}
          autoComplete="new-password"
        />
        <Button type="submit" size="large" disabled={submitting} className="mt-unit-sm w-full">
          {submitting ? t('auth.actions.submitting') : t('auth.changePassword.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
