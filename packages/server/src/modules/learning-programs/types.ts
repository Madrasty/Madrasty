import type { UserRole } from '@madrasty/shared';

export type ProgramStatus = 'draft' | 'pending_review' | 'published' | 'archived';
export type LessonType =
  | 'recorded'
  | 'live'
  | 'pdf'
  | 'audio'
  | 'quiz'
  | 'homework'
  | 'exam'
  | 'private_session';
export type LessonStatus = 'draft' | 'scheduled' | 'published' | 'archived';
export type LessonVisibility = 'free' | 'paid' | 'locked' | 'prerequisite' | 'invite_only';

// The authenticated actor performing a write (from the verified access token).
export interface Actor {
  id: string;
  role: UserRole;
}

// Who is viewing content — decides which lessons' details are revealed.
export interface Viewer {
  userId: string | null;
  role: UserRole | null;
}

export type EnrollmentSource = 'purchase' | 'admin_grant' | 'free';
export type EnrollmentStatus = 'active' | 'expired' | 'cancelled';

export interface EnrollmentRecord {
  id: string;
  studentId: string;
  programId: string;
  source: EnrollmentSource;
  status: EnrollmentStatus;
  grantedAt: Date;
  expiresAt: Date | null;
}

export interface LessonProgressRecord {
  studentId: string;
  lessonId: string;
  openedAt: Date | null;
  completedAt: Date | null;
  metadata: Record<string, unknown>;
}

export interface ProgramRecord {
  id: string;
  teacherId: string;
  subjectId: string | null;
  gradeLevel: string | null;
  semester: string | null;
  priceEgp: string | null;
  status: ProgramStatus;
  metadata: Record<string, unknown>;
}

export interface ChapterRecord {
  id: string;
  programId: string;
  orderIndex: number;
  title: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
}

export interface LessonRecord {
  id: string;
  chapterId: string;
  orderIndex: number;
  lessonType: LessonType;
  status: LessonStatus;
  visibility: LessonVisibility;
  prerequisiteLessonId: string | null;
  metadata: Record<string, unknown>;
}
