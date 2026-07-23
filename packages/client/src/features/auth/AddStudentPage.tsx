import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { GuardianRelationship } from '@madrasty/shared';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { AuthLayout, FormError } from './AuthLayout';
import { authApi } from './auth.api';
import { authErrorMessage } from './authError';
import { ISO_DATE_RE } from './validation';
import { dashboardPath } from '../../app/navigation';

type Field = 'name' | 'dateOfBirth' | 'grade' | 'school' | 'city';

const RELATIONSHIPS: GuardianRelationship[] = ['father', 'mother', 'guardian', 'other'];

export function AddStudentPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [values, setValues] = useState<Record<Field, string>>({
    name: '',
    dateOfBirth: '',
    grade: '',
    school: '',
    city: '',
  });
  const [relationship, setRelationship] = useState<GuardianRelationship>('guardian');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (field: Field) => (e: { target: { value: string } }) =>
    setValues((prev) => ({ ...prev, [field]: e.target.value }));

  function validate(): boolean {
    const next: Partial<Record<Field, string>> = {};
    if (values.name.trim().length < 2) next.name = t('auth.validation.name');
    if (!ISO_DATE_RE.test(values.dateOfBirth)) next.dateOfBirth = t('auth.validation.dateOfBirth');
    if (values.grade.trim().length < 1) next.grade = t('auth.validation.grade');
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      await authApi.addStudent({
        name: values.name.trim(),
        dateOfBirth: values.dateOfBirth,
        grade: values.grade.trim(),
        school: values.school.trim() || undefined,
        city: values.city.trim() || undefined,
        relationship,
      });
      navigate(dashboardPath('parent'), { replace: true });
    } catch (err) {
      setError(authErrorMessage(t, err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title={t('auth.addStudent.title')}
      subtitle={t('auth.addStudent.subtitle')}
      footer={
        <button
          type="button"
          onClick={() => navigate(dashboardPath('parent'))}
          className="text-on-surface-variant hover:text-primary hover:underline"
        >
          {t('auth.addStudent.skip')}
        </button>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-unit-md" noValidate>
        <FormError message={error} />
        <Input
          label={t('auth.fields.studentName')}
          value={values.name}
          onChange={set('name')}
          error={fieldErrors.name}
        />
        <Input
          label={t('auth.fields.dateOfBirth')}
          type="date"
          value={values.dateOfBirth}
          onChange={set('dateOfBirth')}
          error={fieldErrors.dateOfBirth}
        />
        <Input
          label={t('auth.fields.grade')}
          value={values.grade}
          onChange={set('grade')}
          error={fieldErrors.grade}
          placeholder={t('auth.fields.gradePlaceholder')}
        />
        <div className="flex flex-col gap-unit-xs text-start">
          <label htmlFor="relationship" className="text-label-md text-on-surface-variant">
            {t('auth.fields.relationship')}
          </label>
          <select
            id="relationship"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value as GuardianRelationship)}
            className="h-10 rounded border border-outline-variant bg-surface-container-lowest px-unit-md text-body-md text-on-surface outline-none focus:border-primary"
          >
            {RELATIONSHIPS.map((rel) => (
              <option key={rel} value={rel}>
                {t(`auth.relationships.${rel}`)}
              </option>
            ))}
          </select>
        </div>
        <Input label={t('auth.fields.school')} value={values.school} onChange={set('school')} />
        <Input label={t('auth.fields.city')} value={values.city} onChange={set('city')} />
        <Button type="submit" size="large" disabled={submitting} className="mt-unit-sm w-full">
          {submitting ? t('auth.actions.submitting') : t('auth.addStudent.submit')}
        </Button>
      </form>
    </AuthLayout>
  );
}
