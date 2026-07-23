import {
  pgTable,
  uuid,
  jsonb,
  timestamp,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { learningPrograms, lessons } from './content';
import { enrollmentSource, enrollmentStatus } from './enums';

// A student's access grant to a whole program (doc 12 §5/§8). "Is this student
// enrolled?" = an `active` row whose expires_at is null or in the future.
// Multiple rows over time are allowed (e.g. re-purchase after expiry); access is
// computed from them rather than mutating a single row in place.
export const enrollments = pgTable(
  'enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id),
    programId: uuid('program_id')
      .notNull()
      .references(() => learningPrograms.id),
    source: enrollmentSource('source').notNull(),
    status: enrollmentStatus('status').notNull().default('active'),
    grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
    // Null = never expires. A past value means the grant has lapsed.
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default({}),
  },
  (table) => ({
    byStudentProgram: index('enrollments_student_program_idx').on(
      table.studentId,
      table.programId,
    ),
  }),
);

// One row per (student, lesson) tracking open/complete. `completed_at IS NOT NULL`
// is what unlocks prerequisite/locked lessons (doc 12 §5) and feeds progress
// roll-ups later (doc 10). Composite PK enforces one row per pair (upserted).
export const lessonProgress = pgTable(
  'lesson_progress',
  {
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default({}),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.studentId, table.lessonId] }),
  }),
);

// Explicit allow-list for `invite_only` lessons (doc 12 §5 — a private cohort).
// Presence of a row grants that student access to that specific lesson.
export const lessonInvites = pgTable(
  'lesson_invites',
  {
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id),
    invitedAt: timestamp('invited_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.lessonId, table.studentId] }),
  }),
);
