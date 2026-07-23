// Shared type contract imported by BOTH client and server (see CLAUDE.md).
// Never duplicate these definitions on either side.

// --- Roles (mirrors the `user_role` DB enum, doc 03 / doc 11) ---
export const USER_ROLES = ['student', 'parent', 'teacher', 'admin', 'center_admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['active', 'suspended', 'pending_verification'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

// --- Public user shape (never carries password_hash) ---
export interface AuthUser {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  role: UserRole;
  localePreference: string;
  status: UserStatus;
  verificationLevel: number;
}

// --- Auth request/response DTOs ---
export interface RegisterParentRequest {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  localePreference?: string;
}

export interface RegisterParentResponse {
  user: AuthUser;
}

// Teacher self-registration — same fields as a parent; role is set server-side.
export interface RegisterTeacherRequest {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  localePreference?: string;
}

export interface RegisterTeacherResponse {
  user: AuthUser;
}

// Authenticated password change (e.g. the seeded admin rotating the 0000 default).
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface LoginRequest {
  // A parent may sign in with either their email or their phone number.
  identifier: string;
  password: string;
}

// The refresh token is delivered ONLY via an httpOnly cookie, never in a body.
export interface LoginResponse {
  user: AuthUser;
  accessToken: string;
}

export interface RefreshResponse {
  accessToken: string;
}

// --- Registration DTOs (doc 11 features 5-7) ---
export type GuardianRelationship = 'father' | 'mother' | 'guardian' | 'other';

// Feature 5 — parent adds a student sub-profile.
export interface AddStudentRequest {
  name: string;
  dateOfBirth: string; // YYYY-MM-DD
  grade: string;
  school?: string;
  city?: string;
  relationship?: GuardianRelationship;
}

// Flow A: the student is created active under the already-verified guardian.
export interface AddStudentResponse {
  studentId: string;
  name: string;
  grade: string;
  status: 'active';
}

// Feature 6 — student-first self-registration.
export interface StudentSelfRegisterRequest {
  name: string;
  grade: string;
  parentMobile: string;
}

// Flow B: the student profile is created pending until a guardian approves.
export interface StudentSelfRegisterResponse {
  studentId: string;
  status: 'pending_approval';
}

// Feature 7 — what a parent sees when opening the approval link (no PII/token).
export interface GuardianApprovalView {
  student: { name: string | null; grade: string | null };
  status: 'awaiting_parent' | 'approved' | 'rejected' | 'expired';
  expiresAt: string | null;
}

// Feature 7 — the guardian supplies the OTP delivered to their phone to approve.
export interface GuardianApproveRequest {
  otp: string;
}

// Feature 7 — result of approving/rejecting an approval request.
export interface GuardianApprovalActionResponse {
  studentId?: string;
  status: 'approved' | 'rejected';
}

// Session — logout acknowledgement.
export interface LogoutResponse {
  success: boolean;
}

// --- Learning programs: content authoring & browsing (doc 12) ---
export const LESSON_TYPES = [
  'recorded',
  'live',
  'pdf',
  'audio',
  'quiz',
  'homework',
  'exam',
  'private_session',
] as const;
export type LessonType = (typeof LESSON_TYPES)[number];

export const LESSON_STATUSES = ['draft', 'scheduled', 'published', 'archived'] as const;
export type LessonStatus = (typeof LESSON_STATUSES)[number];

export const LESSON_VISIBILITIES = [
  'free',
  'paid',
  'locked',
  'prerequisite',
  'invite_only',
] as const;
export type LessonVisibility = (typeof LESSON_VISIBILITIES)[number];

export const PROGRAM_STATUSES = ['draft', 'pending_review', 'published', 'archived'] as const;
export type ProgramStatus = (typeof PROGRAM_STATUSES)[number];

// Localized text on the way in (only the provided locales are written).
export interface LocalizedInput {
  ar?: string;
  en?: string;
}

// A program with title/description resolved for the request locale.
export interface ProgramSummary {
  id: string;
  teacherId: string;
  subjectId: string | null;
  gradeLevel: string | null;
  semester: string | null;
  priceEgp: string | null;
  status: string;
  title: string | null;
  description: string | null;
}

// Authoring view (create/update/listMine) — summary plus owner-only metadata.
export interface AuthoredProgram extends ProgramSummary {
  metadata: Record<string, unknown>;
}

export interface ListMyProgramsResponse {
  programs: AuthoredProgram[];
}

export interface CreateProgramRequest {
  title?: LocalizedInput;
  description?: LocalizedInput;
  subjectId?: string;
  gradeLevel?: string;
  semester?: string;
  price?: number;
}

export interface CreateChapterRequest {
  title?: LocalizedInput;
  description?: LocalizedInput;
  orderIndex?: number;
}

export interface CreateLessonRequest {
  lessonType: LessonType;
  title?: LocalizedInput;
  description?: LocalizedInput;
  status?: LessonStatus;
  visibility?: LessonVisibility;
  orderIndex?: number;
  prerequisiteLessonId?: string;
  details?: Record<string, unknown>;
}

// A chapter in the program tree, title/description resolved for the locale.
export interface ChapterView {
  id: string;
  orderIndex: number;
  title: string | null;
  description: string | null;
  lessons: LessonView[];
}

// A lesson in the program tree; `locked`/`details` reflect the viewer's access.
export interface LessonView {
  id: string;
  lessonType: LessonType | string;
  status: string;
  visibility: string;
  orderIndex: number;
  title: string | null;
  description: string | null;
  locked: boolean;
  details: Record<string, unknown> | null;
}

export interface ProgramContentView extends ProgramSummary {
  chapters: ChapterView[];
}

// A newly created/updated chapter (authoring response).
export interface AuthoredChapter {
  id: string;
  programId: string;
  orderIndex: number;
  title: string | null;
  description: string | null;
}

// A newly created/updated lesson (authoring response).
export interface AuthoredLesson {
  lesson: {
    id: string;
    chapterId: string;
    orderIndex: number;
    lessonType: LessonType | string;
    status: string;
    visibility: string;
    prerequisiteLessonId: string | null;
  };
  title: string | null;
  description: string | null;
  details: Record<string, unknown> | null;
}
