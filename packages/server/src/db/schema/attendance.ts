import { pgTable, uuid, text, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { users } from './users';

// Attendance (doc 10 §3.4, §4). One row per student per session, recorded from
// real join/leave events rather than typed in by hand.
//
// Design notes:
// - `session_id` is deliberately NOT a foreign key: a session is a live-class
//   LESSON today and a tutoring BOOKING later (doc 13), and `session_type` says
//   which. This is the same polymorphic shape doc 10 §4 specifies.
// - A live lesson IS the session — there is no separate `live_sessions` table.
//   Its schedule and runtime state live on `live_lesson_details` (doc 12 §6's
//   per-lesson-type detail table), so a live class costs zero new tables here.
// - NOT append-only: one row per (session, student), upserted. A student who
//   rejoins after a dropout must not produce two conflicting rows, and a teacher
//   override corrects the same row. The append-only rule in doc 03 covers money
//   and points, not attendance — the same call already made for `exam_results`.
// - `metadata` carries the audit trail the single `status` column can't: first
//   join, last leave, minutes present, and who overrode what.
export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id),
    sessionType: text('session_type').notNull(), // 'live_class' | 'tutoring'
    sessionId: uuid('session_id').notNull(), // live lesson id, or booking id later
    status: text('status').notNull(), // 'present' | 'absent' | 'late'
    // Set when a teacher/admin overrides what the join events recorded.
    recordedBy: uuid('recorded_by').references(() => users.id),
    metadata: jsonb('metadata').notNull().default({}),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // The upsert target: one row per student per session.
    perSession: uniqueIndex('attendance_records_session_student_idx').on(
      table.sessionType,
      table.sessionId,
      table.studentId,
    ),
    // The report-card query: this student's attendance across all sessions.
    byStudent: index('attendance_records_student_idx').on(table.studentId, table.recordedAt),
  }),
);
