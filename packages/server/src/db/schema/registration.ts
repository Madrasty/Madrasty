import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { users, studentProfiles } from './users';
import { otpChannel, guardianApprovalStatus } from './enums';

// Registration/consent tables (doc 11 §8). Kept in their own file since they are
// a self-contained onboarding feature layered on top of the core `users` tables.

// SMS/email OTP challenges used by both registration flows (doc 11 §3, §4).
// The raw code is NEVER stored — only a hash — same instinct as password hashing.
export const otpVerifications = pgTable('otp_verifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  channel: otpChannel('channel').notNull(),
  codeHash: text('code_hash').notNull(), // hashed OTP, never the raw code (doc 11)
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  attemptCount: integer('attempt_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Flow B (student-first): a pending request captured before a parent account may
// even exist — hence matched_parent_id / student_profile_id are nullable until a
// verified guardian resolves the request (doc 11 §3, §8).
export const guardianApprovalRequests = pgTable('guardian_approval_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  pendingStudentName: text('pending_student_name'),
  pendingStudentGrade: text('pending_student_grade'),
  parentMobile: text('parent_mobile'), // number the student typed, pre-verification
  matchedParentId: uuid('matched_parent_id').references(() => users.id),
  studentProfileId: uuid('student_profile_id').references(() => studentProfiles.userId),
  status: guardianApprovalStatus('status').notNull().default('awaiting_parent'),
  approvalToken: text('approval_token').unique(), // token embedded in the SMS link
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});
