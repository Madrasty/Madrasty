import type { TranslationRow, TranslationsStore } from './learning-programs.repository';
import type { Localized } from './learning-programs.schemas';

// entity_type values used in the `translations` table (doc 03 / doc 12 §6).
export const PROGRAM_ENTITY = 'learning_program';
export const CHAPTER_ENTITY = 'chapter';
export const LESSON_ENTITY = 'lesson';

// The localized fields every content entity carries.
export interface LocalizedText {
  title: string | null;
  description: string | null;
}

// Persists provided title/description values to the translations table, one row
// per (locale, field). Empty/whitespace values are skipped; omitted fields leave
// existing translations untouched (so a partial update only writes what it sets).
export async function writeLocalizedFields(
  store: TranslationsStore,
  entityType: string,
  entityId: string,
  fields: { title?: Localized; description?: Localized },
): Promise<void> {
  for (const field of ['title', 'description'] as const) {
    const values = fields[field];
    if (!values) continue;
    for (const [locale, value] of Object.entries(values)) {
      if (typeof value === 'string' && value.trim() !== '') {
        await store.setTranslation(entityType, entityId, locale, field, value.trim());
      }
    }
  }
}

// Resolves a single field for a locale from a set of translation rows, falling
// back to defaultLocale, then null (doc: "fallback to DEFAULT_LOCALE when a
// translation is missing"). Prefers an exact-locale match if present.
export function resolveField(
  rows: TranslationRow[],
  entityId: string,
  field: string,
  locale: string,
  defaultLocale: string,
): string | null {
  let fallback: string | null = null;
  for (const row of rows) {
    if (row.entityId !== entityId || row.field !== field) continue;
    if (row.locale === locale) return row.value;
    if (row.locale === defaultLocale) fallback = row.value;
  }
  return fallback;
}

export function resolveLocalizedText(
  rows: TranslationRow[],
  entityId: string,
  locale: string,
  defaultLocale: string,
): LocalizedText {
  return {
    title: resolveField(rows, entityId, 'title', locale, defaultLocale),
    description: resolveField(rows, entityId, 'description', locale, defaultLocale),
  };
}
