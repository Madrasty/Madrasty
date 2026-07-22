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
