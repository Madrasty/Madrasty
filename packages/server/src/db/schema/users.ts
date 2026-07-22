import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  numeric,
  primaryKey,
} from 'drizzle-orm/pg-core';
import {
  userRole,
  userStatus,
  studentStatus,
  teacherVerificationStatus,
  guardianRelationship,
} from './enums';

// Root account. A parent is the billing/root account; students are managed
// sub-profiles (doc 11). Minors never hold a self-sufficient account.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique(),
  phone: text('phone').unique(),
  passwordHash: text('password_hash'),
  role: userRole('role').notNull(),
  localePreference: text('locale_preference').notNull().default('ar'),
  status: userStatus('status').notNull().default('active'),
  verificationLevel: integer('verification_level').notNull().default(1),
  phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export const studentProfiles = pgTable('student_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  gradeLevel: text('grade_level'),
  schoolName: text('school_name'),
  status: studentStatus('status').notNull().default('pending_approval'),
  metadata: jsonb('metadata').notNull().default({}),
});

export const teacherProfiles = pgTable('teacher_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  bio: jsonb('bio'), // { "ar": "...", "en": "..." }
  verificationStatus: teacherVerificationStatus('verification_status')
    .notNull()
    .default('pending'),
  verificationDocs: jsonb('verification_docs'),
  payoutDetails: jsonb('payout_details'),
  commissionRate: numeric('commission_rate').notNull().default('0.20'),
  metadata: jsonb('metadata').notNull().default({}),
});

// Links a guardian to a student. approved_at is NULL until guardian approval
// completes — content-access checks must confirm approved_at IS NOT NULL (doc 11).
export const parentChildren = pgTable(
  'parent_children',
  {
    parentId: uuid('parent_id')
      .notNull()
      .references(() => users.id),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id),
    relationship: guardianRelationship('relationship').notNull().default('guardian'),
    isPrimary: boolean('is_primary').notNull().default(true),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.parentId, table.studentId] }),
  }),
);
