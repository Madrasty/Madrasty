import { z } from 'zod';

// Validation for the exams/gradebook endpoints. Deeper policy (exam ownership,
// program ownership, report-card viewer rights) lives in the service (doc 10 §6).
export const createExamSchema = z.object({
  subjectId: z.string().uuid(),
  programId: z.string().uuid().nullish(),
  // { ar?, en?, ... } — at least one non-empty value is enforced in the service.
  title: z.record(z.string(), z.string()),
  maxScore: z.number().positive(),
  weight: z.number().positive().optional(),
  term: z.string().trim().min(1).max(64).nullish(),
});

export const recordResultSchema = z.object({
  studentId: z.string().uuid(),
  score: z.number().min(0),
  comment: z.string().trim().max(2000).nullish(),
});
