import { pgTable, uuid, text, integer, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';
import { lessons, learningPrograms } from './content';

// AI Q&A tutor (doc 01 §3 "AI Services", doc 09 phase 3). A student asks
// curriculum questions; the answer comes from an LLM API call with the lesson /
// program supplied as context — prompt-based, not fine-tuned (doc 01 §1).
//
// Design notes:
// - `program_id` / `lesson_id` are the curriculum scope the tutor was given.
//   Both nullable: an unscoped conversation is general study help.
// - `program_id` is denormalized off the lesson so the enrollment check doesn't
//   re-walk lesson→chapter→program on every question (same trick as quizzes and
//   homework).
// - No `deleted_at`: a conversation is disposable per-student chat, not a record
//   another party depends on. Deleting removes its messages with it.
export const aiConversations = pgTable(
  'ai_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id),
    programId: uuid('program_id').references(() => learningPrograms.id),
    lessonId: uuid('lesson_id').references(() => lessons.id),
    // Derived from the first question — the student never types a title.
    title: text('title'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // The conversation list is always "mine, newest first".
    byStudent: index('ai_conversations_student_idx').on(table.studentId, table.updatedAt),
  }),
);

// Every turn of every conversation. APPEND-ONLY (doc 03's ledger instinct): a
// message is never edited or deleted in place, so this table is simultaneously
// the transcript, the audit trail for what the model was asked, and the usage
// ledger the per-student daily cap is computed from — `SUM/COUNT` over a time
// window, never a mutable counter column.
//
// `input_tokens` / `output_tokens` are what the provider reported for the call
// that produced an assistant turn (null on user turns). `model` records which
// model answered, so a model change is visible in history rather than silently
// rewriting what past answers came from.
export const aiMessages = pgTable(
  'ai_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => aiConversations.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id),
    role: text('role').notNull(), // 'user' | 'assistant'
    content: text('content').notNull(),
    model: text('model'),
    provider: text('provider'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byConversation: index('ai_messages_conversation_idx').on(
      table.conversationId,
      table.createdAt,
    ),
    // The quota query: count this student's turns since the window start.
    byStudentCreatedAt: index('ai_messages_student_created_idx').on(
      table.studentId,
      table.createdAt,
    ),
  }),
);
