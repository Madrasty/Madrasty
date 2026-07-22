import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  numeric,
  timestamp,
  primaryKey,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import {
  programStatus,
  lessonType,
  lessonStatus,
  lessonVisibility,
} from './enums';

export const subjects = pgTable('subjects', {
  id: uuid('id').primaryKey().defaultRandom(),
  gradeLevel: text('grade_level'),
  slug: text('slug').unique(),
  metadata: jsonb('metadata').notNull().default({}),
});

// Locale-aware content: one row per (entity, locale, field) rather than
// name_ar/name_en columns, so adding a language costs zero schema changes (doc 03).
export const translations = pgTable(
  'translations',
  {
    entityType: text('entity_type').notNull(), // 'subject' | 'learning_program' | 'chapter' | 'lesson' | ...
    entityId: uuid('entity_id').notNull(),
    locale: text('locale').notNull(), // 'ar' | 'en'
    field: text('field').notNull(), // 'title' | 'description' | ...
    value: text('value').notNull(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.entityType, table.entityId, table.locale, table.field],
    }),
  }),
);

// The sellable unit (doc 12). Sold whole or per-chapter/lesson via lesson visibility.
export const learningPrograms = pgTable('learning_programs', {
  id: uuid('id').primaryKey().defaultRandom(),
  teacherId: uuid('teacher_id')
    .notNull()
    .references(() => users.id),
  subjectId: uuid('subject_id').references(() => subjects.id),
  gradeLevel: text('grade_level'),
  semester: text('semester'),
  priceEgp: numeric('price_egp'),
  status: programStatus('status').notNull().default('draft'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const chapters = pgTable('chapters', {
  id: uuid('id').primaryKey().defaultRandom(),
  programId: uuid('program_id')
    .notNull()
    .references(() => learningPrograms.id),
  orderIndex: integer('order_index').notNull().default(0),
  title: jsonb('title'), // { "ar": "...", "en": "..." }
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// Each lesson carries its own type independent of its neighbors (doc 12).
// prerequisite_lesson_id self-references lessons for visibility='locked'/'prerequisite'.
export const lessons = pgTable('lessons', {
  id: uuid('id').primaryKey().defaultRandom(),
  chapterId: uuid('chapter_id')
    .notNull()
    .references(() => chapters.id),
  orderIndex: integer('order_index').notNull().default(0),
  lessonType: lessonType('lesson_type').notNull(),
  status: lessonStatus('status').notNull().default('draft'),
  visibility: lessonVisibility('visibility').notNull().default('paid'),
  prerequisiteLessonId: uuid('prerequisite_lesson_id').references(
    (): AnyPgColumn => lessons.id,
  ),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
