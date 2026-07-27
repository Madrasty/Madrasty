import {
  pgTable,
  uuid,
  text,
  numeric,
  boolean,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { lessons, learningPrograms } from './content';

// Homework (doc 03 "homework_submissions", doc 12 §6). A homework-type lesson
// delegates here (homework.handler).
//
// Design notes:
// - Mirrors the quizzes shape deliberately: one assignment per homework-type
//   lesson (`lesson_id` unique), `program_id` denormalized from the lesson so
//   enrollment checks don't re-walk lesson→chapter→program.
// - `brief` is JSONB { ar, en } — teacher-authored, low-volume text, so it stays
//   inline like exams.title rather than going through the translations table.
// - `due_at` + `allow_late` decide the submission's status; a hard deadline
//   (allow_late = false) rejects late submissions outright.
export const homeworkAssignments = pgTable(
  'homework_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    lessonId: uuid('lesson_id')
      .notNull()
      .references(() => lessons.id),
    programId: uuid('program_id')
      .notNull()
      .references(() => learningPrograms.id),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => users.id),
    brief: jsonb('brief').notNull(), // { "ar": "...", "en": "..." }
    maxGrade: numeric('max_grade').notNull().default('100'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    allowLate: boolean('allow_late').notNull().default(true),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // One assignment per lesson — creation is a guarded find-or-reject.
    perLesson: uniqueIndex('homework_assignments_lesson_idx').on(table.lessonId),
    byProgram: index('homework_assignments_program_idx').on(table.programId),
  }),
);

// One submission per (assignment, student) — doc 03's `homework_submissions`.
// Unlike quiz_attempts this is NOT append-only: a student may replace their text
// while it is still ungraded, and grading updates the same row (the same upsert
// shape as exam_results). Grades are not a financial/points ledger, so the
// append-only rule from doc 03 doesn't apply here.
//
// MVP is text-only: `content` holds the student's answer. `metadata` is reserved
// for attachment references once object storage is wired (doc 01 §6).
export const homeworkSubmissions = pgTable(
  'homework_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => homeworkAssignments.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id),
    content: text('content').notNull(),
    // submitted | late | graded (doc 03). Set server-side from due_at, never by
    // the client.
    status: text('status').notNull().default('submitted'),
    grade: numeric('grade'),
    teacherComment: text('teacher_comment'),
    // 'teacher' | 'ai' (doc 03) — reserved for the auto-correction slice.
    gradedBy: text('graded_by'),
    graderId: uuid('grader_id').references(() => users.id),
    gradedAt: timestamp('graded_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata').notNull().default({}),
  },
  (table) => ({
    // One submission per student per assignment — the upsert target.
    perStudent: uniqueIndex('homework_submissions_assignment_student_idx').on(
      table.assignmentId,
      table.studentId,
    ),
    byStudent: index('homework_submissions_student_idx').on(table.studentId),
  }),
);
