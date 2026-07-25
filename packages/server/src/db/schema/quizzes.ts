import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { lessons, learningPrograms } from './content';

// Quizzes (doc 03 "quizzes", doc 12 §6). A quiz-type lesson delegates here (the
// quiz.handler stub points at this module).
//
// Design notes:
// - A quiz belongs to exactly one quiz-type lesson (`lesson_id` unique). The
//   lesson supplies ordering/title/visibility; the quiz supplies the questions.
// - `program_id` is denormalized from the lesson at creation so access checks
//   ("is this student enrolled?") don't re-walk lesson→chapter→program each time.
// - `passing_score` is a percentage; a passing attempt can gate the next lesson
//   (doc 12 §5 "Locked until Quiz Passed") by completing the lesson.
// - `generated_by` = 'teacher' | 'ai' (doc 03) — reserved for the AI Q&A slice.
export const quizzes = pgTable(
  'quizzes',
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
    passingScore: numeric('passing_score').notNull().default('60'),
    timeLimitMinutes: integer('time_limit_minutes'),
    generatedBy: text('generated_by').notNull().default('teacher'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // One quiz per lesson — creation is a guarded find-or-reject.
    perLesson: uniqueIndex('quizzes_lesson_idx').on(table.lessonId),
    byProgram: index('quizzes_program_idx').on(table.programId),
  }),
);

// A single-correct multiple-choice question (MVP). `prompt` is localized
// { ar, en }; `options` is an array of { id, text: { ar, en } }; `correct_option_id`
// names the right option. `type` is reserved so multi-select / true-false extend
// without a migration.
export const quizQuestions = pgTable(
  'quiz_questions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quizzes.id),
    orderIndex: integer('order_index').notNull().default(0),
    type: text('type').notNull().default('single_choice'),
    prompt: jsonb('prompt').notNull(), // { ar, en }
    options: jsonb('options').notNull(), // [{ id, text: { ar, en } }]
    correctOptionId: text('correct_option_id').notNull(),
    points: numeric('points').notNull().default('1'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byQuiz: index('quiz_questions_quiz_idx').on(table.quizId, table.orderIndex),
  }),
);

// Append-only record of a student's graded attempt. Multiple attempts allowed;
// gating/report-card use the best/most-recent. `answers` maps questionId→optionId.
export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quizId: uuid('quiz_id')
      .notNull()
      .references(() => quizzes.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id),
    answers: jsonb('answers').notNull(), // { [questionId]: optionId }
    score: numeric('score').notNull(),
    maxScore: numeric('max_score').notNull(),
    percentage: numeric('percentage').notNull(),
    passed: boolean('passed').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byStudent: index('quiz_attempts_quiz_student_idx').on(table.quizId, table.studentId),
  }),
);
