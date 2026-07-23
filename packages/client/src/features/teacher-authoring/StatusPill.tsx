import { useTranslation } from 'react-i18next';

// Maps a program/lesson status to a semantic tint (emerald=live, amber=in
// progress, gray=draft/archived). Colours are status semantics, not the accent.
const STATUS_CLASS: Record<string, string> = {
  published: 'bg-secondary-container text-on-secondary-container',
  pending_review: 'bg-tertiary-container/40 text-on-tertiary-container',
  scheduled: 'bg-tertiary-container/40 text-on-tertiary-container',
  draft: 'bg-surface-container-high text-on-surface-variant',
  archived: 'bg-surface-container-high text-on-surface-variant',
};

function Pill({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-label-sm font-semibold ${
        STATUS_CLASS[status] ?? STATUS_CLASS.draft
      }`}
    >
      {label}
    </span>
  );
}

export function ProgramStatusPill({ status }: { status: string }) {
  const { t } = useTranslation();
  return <Pill status={status} label={t(`authoring.statuses.${status}`, status)} />;
}

export function LessonStatusPill({ status }: { status: string }) {
  const { t } = useTranslation();
  return <Pill status={status} label={t(`authoring.statuses.${status}`, status)} />;
}
