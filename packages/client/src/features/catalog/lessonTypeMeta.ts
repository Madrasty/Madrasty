import { LESSON_TYPES, type LessonType } from '@madrasty/shared';

// Material Symbols icon per lesson type. Labels are reused from the existing
// `authoring.lessonTypes.*` i18n keys (same wording, ar/en) — see locale files.
const LESSON_TYPE_ICONS: Record<LessonType, string> = {
  recorded: 'play_circle',
  live: 'videocam',
  pdf: 'picture_as_pdf',
  audio: 'headphones',
  quiz: 'quiz',
  homework: 'assignment',
  exam: 'history_edu',
  private_session: 'record_voice_over',
};

export function lessonTypeIcon(lessonType: string): string {
  return (LESSON_TYPE_ICONS as Record<string, string>)[lessonType] ?? 'article';
}

// i18n key for a lesson type's label; unknown types fall back to the raw value.
export function lessonTypeLabelKey(lessonType: string): string {
  return (LESSON_TYPES as readonly string[]).includes(lessonType)
    ? `authoring.lessonTypes.${lessonType}`
    : '';
}
