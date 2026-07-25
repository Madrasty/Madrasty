import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { conversationStatus } from './enums';

// Parent–Teacher–Student engagement: messaging (doc 10 §3.3).
//
// Design notes from the doc:
// - A conversation is scoped to a (parent, teacher, student) TRIPLE — a parent
//   messaging a teacher is always about a specific child, never a generic DM.
//   The UNIQUE(parent, teacher, student) constraint enforces one thread per
//   triple, so opening a conversation is a find-or-create (doc 10 §3.3).
// - Messages are kept, never deleted — schools/parents expect an admin to be
//   able to audit communication if there's ever a dispute (doc 10 §3.3, §6).
//   So there is no soft-delete here; `messages` is an append-only log.
// - `read_at` on a message is when the OTHER participant read it (drives unread
//   badges in the inbox). NULL = unread.

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    parentId: uuid('parent_id')
      .notNull()
      .references(() => users.id),
    teacherId: uuid('teacher_id')
      .notNull()
      .references(() => users.id),
    // The child this conversation is about (a student user).
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id),
    status: conversationStatus('status').notNull().default('open'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // Bumped whenever a message is sent, so the inbox can sort by recency.
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
  },
  (table) => ({
    // One thread per (parent, teacher, student) — find-or-create relies on this.
    tripleUnique: uniqueIndex('conversations_triple_idx').on(
      table.parentId,
      table.teacherId,
      table.studentId,
    ),
    byParent: index('conversations_parent_idx').on(table.parentId),
    byTeacher: index('conversations_teacher_idx').on(table.teacherId),
  }),
);

// Append-only message log within a conversation (doc 10 §3.3 — "log everything,
// don't delete"). `sender_id` is always one of the conversation's participants
// (enforced in the service layer, not the schema).
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id),
    senderId: uuid('sender_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    // When the recipient read this message (NULL = unread). Drives inbox badges.
    readAt: timestamp('read_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // The hot query: fetch a thread newest-first / mark-read by conversation.
    byConversation: index('messages_conversation_idx').on(
      table.conversationId,
      table.createdAt,
    ),
  }),
);
