import { z } from 'zod';

// Localized text stored as { ar, en } (doc 12 uses JSONB titles for chapters;
// program/lesson titles ride in metadata until translations wiring lands).
const localized = z.object({ ar: z.string().optional(), en: z.string().optional() });

const lessonTypeEnum = z.enum([
  'recorded',
  'live',
  'pdf',
  'audio',
  'quiz',
  'homework',
  'exam',
  'private_session',
]);
const lessonStatusEnum = z.enum(['draft', 'scheduled', 'published', 'archived']);
const lessonVisibilityEnum = z.enum(['free', 'paid', 'locked', 'prerequisite', 'invite_only']);

// --- Programs ---
export const createProgramSchema = z.object({
  title: localized.optional(),
  subjectId: z.string().uuid().optional(),
  gradeLevel: z.string().trim().min(1).max(60).optional(),
  semester: z.string().trim().min(1).max(60).optional(),
  price: z.number().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateProgramSchema = createProgramSchema.partial();

// --- Chapters ---
export const createChapterSchema = z.object({
  title: localized.optional(),
  orderIndex: z.number().int().nonnegative().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export const updateChapterSchema = createChapterSchema.partial();

// --- Lessons ---
// `details` is type-specific and validated by the matching lesson-type handler.
export const createLessonSchema = z.object({
  lessonType: lessonTypeEnum,
  title: localized.optional(),
  status: lessonStatusEnum.optional(),
  visibility: lessonVisibilityEnum.optional(),
  orderIndex: z.number().int().nonnegative().optional(),
  prerequisiteLessonId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
  details: z.record(z.unknown()).optional(),
});

// lessonType is immutable (changing it would orphan the detail row) — omit it.
export const updateLessonSchema = createLessonSchema.omit({ lessonType: true }).partial();

export const listProgramsQuerySchema = z.object({
  subjectId: z.string().uuid().optional(),
  gradeLevel: z.string().trim().min(1).optional(),
  semester: z.string().trim().min(1).optional(),
});

// --- Enrollment / invites ---
// Direct grant by an owner-teacher/admin. 'purchase' is accepted for when the
// payments module writes enrollments, but the endpoint defaults to admin_grant.
export const grantEnrollmentSchema = z.object({
  studentId: z.string().uuid(),
  source: z.enum(['admin_grant', 'free', 'purchase']).optional(),
  expiresAt: z.coerce.date().optional(),
});

export const addInviteSchema = z.object({
  studentId: z.string().uuid(),
});

export type CreateProgramBody = z.infer<typeof createProgramSchema>;
export type UpdateProgramBody = z.infer<typeof updateProgramSchema>;
export type CreateChapterBody = z.infer<typeof createChapterSchema>;
export type UpdateChapterBody = z.infer<typeof updateChapterSchema>;
export type CreateLessonBody = z.infer<typeof createLessonSchema>;
export type UpdateLessonBody = z.infer<typeof updateLessonSchema>;
export type ListProgramsQuery = z.infer<typeof listProgramsQuerySchema>;
export type GrantEnrollmentBody = z.infer<typeof grantEnrollmentSchema>;
export type AddInviteBody = z.infer<typeof addInviteSchema>;
