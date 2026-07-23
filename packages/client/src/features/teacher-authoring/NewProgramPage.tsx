import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import type { CreateProgramRequest } from '@madrasty/shared';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Icon } from '../../components/Icon';
import { FormError } from '../auth/AuthLayout';
import { authErrorMessage } from '../auth/authError';
import { programsApi } from './programs.api';
import { toLocalized as localized } from './localized';

export function NewProgramPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [titleEn, setTitleEn] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [descEn, setDescEn] = useState('');
  const [descAr, setDescAr] = useState('');
  const [grade, setGrade] = useState('');
  const [semester, setSemester] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const title = localized(titleEn, titleAr);
    if (!title) {
      setError(t('authoring.newProgram.needTitle'));
      return;
    }
    const body: CreateProgramRequest = {
      title,
      description: localized(descEn, descAr),
      gradeLevel: grade.trim() || undefined,
      semester: semester.trim() || undefined,
      price: price.trim() ? Number(price) : undefined,
    };
    setSubmitting(true);
    try {
      const created = await programsApi.create(body);
      navigate(`/app/teacher/programs/${created.id}`, { replace: true });
    } catch (err) {
      setError(authErrorMessage(t, err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-unit-lg">
      <Link
        to="/app/teacher/programs"
        className="inline-flex w-fit items-center gap-1 text-label-md text-on-surface-variant hover:text-primary"
      >
        <Icon name="arrow_back" className="rtl:-scale-x-100" />
        {t('authoring.editor.back')}
      </Link>

      <div>
        <h1 className="text-headline-lg font-semibold">{t('authoring.newProgram.title')}</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          {t('authoring.newProgram.subtitle')}
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-unit-md rounded-xl border border-outline-variant bg-surface-container-lowest p-unit-lg"
        noValidate
      >
        <FormError message={error} />
        <div className="grid grid-cols-1 gap-unit-md sm:grid-cols-2">
          <Input label={t('authoring.newProgram.titleEn')} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
          <Input label={t('authoring.newProgram.titleAr')} dir="rtl" value={titleAr} onChange={(e) => setTitleAr(e.target.value)} />
          <Input label={t('authoring.newProgram.descriptionEn')} value={descEn} onChange={(e) => setDescEn(e.target.value)} />
          <Input label={t('authoring.newProgram.descriptionAr')} dir="rtl" value={descAr} onChange={(e) => setDescAr(e.target.value)} />
          <Input
            label={t('authoring.newProgram.grade')}
            placeholder={t('authoring.newProgram.gradePlaceholder')}
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
          />
          <Input
            label={t('authoring.newProgram.semester')}
            placeholder={t('authoring.newProgram.semesterPlaceholder')}
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
          />
          <Input
            label={t('authoring.newProgram.price')}
            type="number"
            inputMode="decimal"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div className="flex gap-unit-md">
          <Button type="submit" size="large" disabled={submitting}>
            {submitting ? t('auth.actions.submitting') : t('authoring.newProgram.submit')}
          </Button>
          <Link to="/app/teacher/programs">
            <Button type="button" variant="secondary" size="large">
              {t('authoring.newProgram.cancel')}
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
}
