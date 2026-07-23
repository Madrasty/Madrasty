import { pgEnum } from 'drizzle-orm/pg-core';

// --- Users / accounts (doc 03, doc 11) ---
export const userRole = pgEnum('user_role', [
  'student',
  'parent',
  'teacher',
  'admin',
  'center_admin',
]);

export const userStatus = pgEnum('user_status', [
  'active',
  'suspended',
  'pending_verification',
]);

// Student profile lifecycle under a guardian (doc 11).
export const studentStatus = pgEnum('student_status', [
  'pending_approval',
  'active',
  'suspended',
]);

export const teacherVerificationStatus = pgEnum('teacher_verification_status', [
  'pending',
  'verified',
  'rejected',
]);

// Guardian relationship to a student (doc 11).
export const guardianRelationship = pgEnum('guardian_relationship', [
  'father',
  'mother',
  'guardian',
  'other',
]);

// --- Registration / consent (doc 11 §8) ---
// Channel an OTP was delivered over.
export const otpChannel = pgEnum('otp_channel', ['sms', 'email']);

// Lifecycle of a student-first (Flow B) guardian approval request.
export const guardianApprovalStatus = pgEnum('guardian_approval_status', [
  'awaiting_parent',
  'approved',
  'rejected',
  'expired',
]);

// --- Learning programs / content (doc 03, doc 12) ---
export const programStatus = pgEnum('program_status', [
  'draft',
  'pending_review',
  'published',
  'archived',
]);

export const lessonType = pgEnum('lesson_type', [
  'recorded',
  'live',
  'pdf',
  'audio',
  'quiz',
  'homework',
  'exam',
  'private_session',
]);

export const lessonStatus = pgEnum('lesson_status', [
  'draft',
  'scheduled',
  'published',
  'archived',
]);

export const lessonVisibility = pgEnum('lesson_visibility', [
  'free',
  'paid',
  'locked',
  'prerequisite',
  'invite_only',
]);

// --- Enrollment / progress (doc 12 §5, §8) ---
// How a student came to be enrolled in a program. 'purchase' lands once payments
// exist (doc 04); 'admin_grant' lets access be tested before then; 'free' is a
// zero-cost program a student self-enrolls into.
export const enrollmentSource = pgEnum('enrollment_source', [
  'purchase',
  'admin_grant',
  'free',
]);

// Access lifecycle. `active` grants access (subject to expires_at); the rest deny.
export const enrollmentStatus = pgEnum('enrollment_status', [
  'active',
  'expired',
  'cancelled',
]);

// --- Payments (doc 03, doc 04) ---
// Adding a gateway = a new value here + a new provider class — zero other schema
// change (doc 04 §1). `mock` is a dev/test-only provider (never enabled in prod).
export const paymentProvider = pgEnum('payment_provider', [
  'paymob',
  'fawry',
  'vodafone_cash',
  'instapay',
  'stripe',
  'mock',
]);

// What a transaction buys. Only 'learning_program' is wired now; the rest are
// reserved so the column is stable as subscriptions/bookings land (doc 04 §3).
export const purchasableType = pgEnum('purchasable_type', [
  'learning_program',
  'subscription',
  'booking',
  'center_plan',
]);

// Transaction lifecycle (doc 03). This is the CUSTOMER-paid lifecycle; teacher
// payout (escrow, doc 13) is a separate field and must not be inferred from this.
export const transactionStatus = pgEnum('transaction_status', [
  'pending',
  'paid',
  'failed',
  'refunded',
  'partially_refunded',
]);
