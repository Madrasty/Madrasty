import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Icon } from '../../components/Icon';
import { AuthLayout, FormError } from './AuthLayout';
import { authApi } from './auth.api';
import { authErrorMessage } from './authError';
import { EGYPT_MOBILE_RE } from './validation';

type Field = 'name' | 'grade' | 'parentMobile';

export function StudentSelfRegisterPage() {
  const { t } = useTranslation();

  const [values, setValues] = useState<Record<Field, string>>({ name: '', grade: '', parentMobile: '' });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const set = (field: Field) => (e: { target: { value: string } }) =>
    setValues((prev) => ({ ...prev, [field]: e.target.value }));

  function validate(): boolean {
    const next: Partial<Record<Field, string>> = {};
    if (values.name.trim().length < 2) next.name = t('auth.validation.name');
    if (values.grade.trim().length < 1) next.grade = t('auth.validation.grade');
    if (!EGYPT_MOBILE_RE.test(values.parentMobile.trim())) next.parentMobile = t('auth.validation.phone');
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      await authApi.selfRegister({
        name: values.name.trim(),
        grade: values.grade.trim(),
        parentMobile: values.parentMobile.trim(),
      });
      setDone(true);
    } catch (err) {
      setError(authErrorMessage(t, err));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <AuthLayout title={t('auth.studentRegister.doneTitle')}>
        <div className="flex flex-col items-center gap-unit-md text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
            <Icon name="mark_email_read" className="text-[2rem]" />
          </span>
          <p className="text-body-md text-on-surface-variant">{t('auth.studentRegister.doneBody')}</p>
          <Link to="/" className="text-label-md font-semibold text-primary hover:underline">
            {t('auth.studentRegister.backHome')}
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={t('auth.studentRegister.title')}
      subtitle={t('auth.studentRegister.subtitle')}
      footer={
        <span className="text-on-surface-variant">
          {t('auth.studentRegister.isParent')}{' '}
          <Link to="/register" className="font-semibold text-primary hover:underline">
            {t('auth.studentRegister.parentLink')}
          </Link>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-unit-md" noValidate>
        <FormError message={error} />
        <Input
          label={t('auth.fields.studentName')}
          value={values.name}
          onChange={set('name')}
          error={fieldErrors.name}
          autoComplete="name"
        />
        <Input
          label={t('auth.fields.grade')}
          value={values.grade}
          onChange={set('grade')}
          error={fieldErrors.grade}
          placeholder={t('auth.fields.gradePlaceholder')}
        />
        <Input
          label={t('auth.fields.parentMobile')}
          type="tel"
          inputMode="tel"
          dir="ltr"
          value={values.parentMobile}
          onChange={set('parentMobile')}
          error={fieldErrors.parentMobile}
          placeholder={t('auth.fields.phonePlaceholder')}
          autoComplete="tel"
        />
        <p className="text-label-sm text-on-surface-variant">{t('auth.studentRegister.hint')}</p>
        <Button type="submit" size="large" disabled={submitting} className="mt-unit-sm w-full">
          {submitting ? t('auth.actions.submitting') : t('auth.studentRegister.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
