import {
  pgTable,
  uuid,
  text,
  numeric,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { subjects, learningPrograms } from './content';

// Parent–Teacher–Student engagement: exams & report cards (doc 10 §3.1, §4).
//
// Design notes:
// - Exams are a FIRST-CLASS object, distinct from "quiz score on lesson 4" — a
//   midterm/final with a max score, weight, subject and term (doc 10 §3.1).
// - `title` is JSONB { ar, en } (doc 10 §4) — a teacher-authored, low-volume
//   label, so it stays inline like loyalty_tiers.name rather than the
//   translations table used for catalog content.
// - `weight` drives weighted report-card averages; `program_id` is nullable so a
//   subject-level exam need not belong to one program.
export const exams = pgTable(
  'exams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => users.id),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id),
    // Optional link to a program; when set, the gradebook roster = its enrollees.
    programId: uuid('program_id').references(() => learningPrograms.id),
    title: jsonb('title').notNull(), // { "ar": "...", "en": "..." }
    maxScore: numeric('max_score').notNull(),
    weight: numeric('weight').notNull().default('1.0'),
    term: text('term'), // e.g. 'term1_2025'
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byTeacher: index('exams_teacher_idx').on(table.teacherId),
    bySubject: index('exams_subject_idx').on(table.subjectId),
  }),
);

// One graded result per (exam, student). Recording a grade is an upsert on the
// unique pair — re-grading updates the same row (doc 10 §3.1).
export const examResults = pgTable(
  'exam_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    examId: uuid('exam_id')
      .notNull()
      .references(() => exams.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id),
    score: numeric('score').notNull(),
    teacherComment: text('teacher_comment'),
    gradedBy: uuid('graded_by')
      .notNull()
      .references(() => users.id),
    gradedAt: timestamp('graded_at', { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb('metadata').notNull().default({}),
  },
  (table) => ({
    // One result per student per exam — the upsert target.
    perStudent: uniqueIndex('exam_results_exam_student_idx').on(table.examId, table.studentId),
    byStudent: index('exam_results_student_idx').on(table.studentId),
  }),
);
