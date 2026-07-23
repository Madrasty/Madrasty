import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LESSON_TYPES,
  LESSON_VISIBILITIES,
  type CreateLessonRequest,
  type LessonType,
  type LessonVisibility,
} from '@madrasty/shared';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Icon } from '../../components/Icon';
import { FormError } from '../auth/AuthLayout';
import { authErrorMessage } from '../auth/authError';
import { programsApi } from './programs.api';
import { toLocalized } from './localized';

interface AddLessonFormProps {
  programId: string;
  chapterId: string;
  // Existing lessons across the program, for the prerequisite picker.
  existingLessons: { id: string; label: string }[];
  onCreated: () => void;
}

const SELECT_CLASS =
  'h-10 rounded border border-outline-variant bg-surface-container-lowest px-unit-md text-body-md text-on-surface outline-none focus:border-primary';

// Which detail fields each lesson type needs (matches the server handler schemas).
function detailFieldsFor(type: LessonType): Array<'videoUrl' | 'audioUrl' | 'fileUrl' | 'meetingUrl' | 'durationSeconds' | 'pageCount' | 'scheduledStart'> {
  switch (type) {
    case 'recorded':
      return ['videoUrl', 'durationSeconds'];
    case 'audio':
      return ['audioUrl', 'durationSeconds'];
    case 'pdf':
      return ['fileUrl', 'pageCount'];
    case 'live':
      return ['meetingUrl', 'scheduledStart'];
    default:
      return [];
  }
}

export function AddLessonForm({ programId, chapterId, existingLessons, onCreated }: AddLessonFormProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<LessonType>('recorded');
  const [titleEn, setTitleEn] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [visibility, setVisibility] = useState<LessonVisibility>('paid');
  const [status, setStatus] = useState<'draft' | 'published'>('published');
  const [prereq, setPrereq] = useState('');
  const [details, setDetails] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const detailFields = detailFieldsFor(type);
  const needsPrereq = visibility === 'locked' || visibility === 'prerequisite';

  function setDetail(key: string, value: string) {
    setDetails((prev) => ({ ...prev, [key]: value }));
  }

  function reset() {
    setTitleEn('');
    setTitleAr('');
    setDetails({});
    setPrereq('');
    setError(null);
  }

  function buildDetails(): Record<string, unknown> | undefined {
    const payload: Record<string, unknown> = {};
    for (const field of detailFields) {
      const raw = details[field]?.trim();
      if (!raw) continue;
      if (field === 'durationSeconds' || field === 'pageCount') payload[field] = Number(raw);
      else payload[field] = raw; // urls + scheduledStart (ISO) are coerced server-side
    }
    return Object.keys(payload).length ? payload : undefined;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const body: CreateLessonRequest = {
      lessonType: type,
      title: toLocalized(titleEn, titleAr),
      visibility,
      status,
      details: buildDetails(),
    };
    if (needsPrereq && prereq) body.prerequisiteLessonId = prereq;
    setSubmitting(true);
    try {
      await programsApi.createLesson(programId, chapterId, body);
      reset();
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(authErrorMessage(t, err));
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-dashed border-outline-variant px-unit-md py-unit-sm text-label-md text-primary hover:bg-surface-container-low"
      >
        <Icon name="add" className="text-[1.1rem]" />
        {t('authoring.editor.addLesson')}
      </button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-unit-md rounded-lg border border-outline-variant bg-surface-container-low p-unit-md"
      noValidate
    >
      <FormError message={error} />
      <div className="grid grid-cols-1 gap-unit-md sm:grid-cols-2">
        <label className="flex flex-col gap-unit-xs text-start">
          <span className="text-label-md text-on-surface-variant">{t('authoring.editor.lessonType')}</span>
          <select className={SELECT_CLASS} value={type} onChange={(e) => setType(e.target.value as LessonType)}>
            {LESSON_TYPES.map((lt) => (
              <option key={lt} value={lt}>
                {t(`authoring.lessonTypes.${lt}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-unit-xs text-start">
          <span className="text-label-md text-on-surface-variant">{t('authoring.editor.visibility')}</span>
          <select
            className={SELECT_CLASS}
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as LessonVisibility)}
          >
            {LESSON_VISIBILITIES.map((v) => (
              <option key={v} value={v}>
                {t(`authoring.visibilities.${v}`)}
              </option>
            ))}
          </select>
        </label>
        <Input
          label={t('authoring.editor.lessonTitleEn')}
          value={titleEn}
          onChange={(e) => setTitleEn(e.target.value)}
        />
        <Input
          label={t('authoring.editor.lessonTitleAr')}
          dir="rtl"
          value={titleAr}
          onChange={(e) => setTitleAr(e.target.value)}
        />

        {needsPrereq && (
          <label className="flex flex-col gap-unit-xs text-start sm:col-span-2">
            <span className="text-label-md text-on-surface-variant">{t('authoring.editor.prerequisite')}</span>
            <select className={SELECT_CLASS} value={prereq} onChange={(e) => setPrereq(e.target.value)}>
              <option value="">{t('authoring.editor.prerequisitePlaceholder')}</option>
              {existingLessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {detailFields.map((field) => (
          <Input
            key={field}
            label={t(`authoring.editor.${field}`)}
            type={field === 'durationSeconds' || field === 'pageCount' ? 'number' : field === 'scheduledStart' ? 'datetime-local' : 'url'}
            dir={field === 'scheduledStart' ? undefined : 'ltr'}
            value={details[field] ?? ''}
            onChange={(e) => setDetail(field, e.target.value)}
          />
        ))}

        {detailFields.length === 0 && (
          <p className="text-label-sm text-on-surface-variant sm:col-span-2">
            {t('authoring.editor.detailsNote')}
          </p>
        )}
      </div>

      <div className="flex items-center gap-unit-md">
        <label className="flex items-center gap-2 text-label-md text-on-surface-variant">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-outline-variant text-primary"
            checked={status === 'published'}
            onChange={(e) => setStatus(e.target.checked ? 'published' : 'draft')}
          />
          {t('authoring.statuses.published')}
        </label>
        <div className="ms-auto flex gap-unit-sm">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            {t('authoring.newProgram.cancel')}
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? t('auth.actions.submitting') : t('authoring.editor.saveLesson')}
          </Button>
        </div>
      </div>
    </form>
  );
}
