import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { AuthLayout, FormError } from './AuthLayout';
import { useAuth } from './AuthProvider';
import { authErrorMessage } from './authError';
import { EGYPT_MOBILE_RE, EMAIL_RE } from './validation';
import { dashboardPath } from '../../app/navigation';

type Field = 'fullName' | 'email' | 'phone' | 'password' | 'confirm';

export function TeacherRegisterPage() {
  const { t } = useTranslation();
  const { registerTeacher } = useAuth();
  const navigate = useNavigate();

  const [values, setValues] = useState<Record<Field, string>>({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirm: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (field: Field) => (e: { target: { value: string } }) =>
    setValues((prev) => ({ ...prev, [field]: e.target.value }));

  function validate(): boolean {
    const next: Partial<Record<Field, string>> = {};
    if (values.fullName.trim().length < 2) next.fullName = t('auth.validation.fullName');
    if (!EMAIL_RE.test(values.email.trim())) next.email = t('auth.validation.email');
    if (!EGYPT_MOBILE_RE.test(values.phone.trim())) next.phone = t('auth.validation.phone');
    if (values.password.length < 8) next.password = t('auth.validation.password');
    if (values.confirm !== values.password) next.confirm = t('auth.validation.confirm');
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      await registerTeacher({
        fullName: values.fullName.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
        password: values.password,
      });
      navigate(dashboardPath('teacher'), { replace: true });
    } catch (err) {
      setError(authErrorMessage(t, err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title={t('auth.teacherRegister.title')}
      subtitle={t('auth.teacherRegister.subtitle')}
      footer={
        <span className="text-on-surface-variant">
          {t('auth.register.haveAccount')}{' '}
          <Link to="/login" className="font-semibold text-primary hover:underline">
            {t('auth.register.loginLink')}
          </Link>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-unit-md" noValidate>
        <FormError message={error} />
        <Input
          label={t('auth.fields.fullName')}
          value={values.fullName}
          onChange={set('fullName')}
          error={fieldErrors.fullName}
          autoComplete="name"
        />
        <Input
          label={t('auth.fields.email')}
          type="email"
          value={values.email}
          onChange={set('email')}
          error={fieldErrors.email}
          autoComplete="email"
        />
        <Input
          label={t('auth.fields.phone')}
          type="tel"
          inputMode="tel"
          dir="ltr"
          value={values.phone}
          onChange={set('phone')}
          error={fieldErrors.phone}
          placeholder={t('auth.fields.phonePlaceholder')}
          autoComplete="tel"
        />
        <Input
          label={t('auth.fields.password')}
          type="password"
          value={values.password}
          onChange={set('password')}
          error={fieldErrors.password}
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
        <p className="text-label-sm text-on-surface-variant">{t('auth.teacherRegister.hint')}</p>
        <Button type="submit" size="large" disabled={submitting} className="mt-unit-sm w-full">
          {submitting ? t('auth.actions.submitting') : t('auth.teacherRegister.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
