import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users';

// Append-only record of every governance action an admin takes (verify a teacher,
// approve/reject a program, …). Least-privilege + full audit trail: admins *act
// on* accounts through logged, reversible-by-new-event actions, never silent
// edits (doc 01 §7). `action` and `target_type` are free-text slugs kept stable
// in code (e.g. 'teacher.verify', 'program.reject') so new governance actions
// don't need a migration; `metadata` holds the reason and any before/after.
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byTarget: index('admin_audit_log_target_idx').on(table.targetType, table.targetId),
    byActor: index('admin_audit_log_actor_idx').on(table.actorId),
  }),
);
