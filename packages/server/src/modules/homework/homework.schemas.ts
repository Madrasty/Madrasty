import { z } from 'zod';

// Validation for the homework endpoints. Deeper policy (owner/enrollment,
// deadline handling, grade ≤ maxGrade) lives in the service (doc 12 §6).
const localized = z.record(z.string(), z.string());

export const createAssignmentSchema = z.object({
  lessonId: z.string().uuid(),
  brief: localized,
  maxGrade: z.number().positive().optional(),
  dueAt: z.string().datetime().nullish(),
  allowLate: z.boolean().optional(),
});

export const updateAssignmentSchema = z.object({
  brief: localized.optional(),
  maxGrade: z.number().positive().optional(),
  dueAt: z.string().datetime().nullish(),
  allowLate: z.boolean().optional(),
});

// Text-only submissions for now (doc 01 §6 — attachments wait on object storage).
export const submitHomeworkSchema = z.object({
  content: z.string().trim().min(1).max(20000),
});

export const gradeHomeworkSchema = z.object({
  grade: z.number().min(0),
  teacherComment: z.string().trim().max(2000).nullish(),
});
