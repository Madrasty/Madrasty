import { z } from 'zod';

// Validation for the quiz endpoints. Deeper policy (owner/enrollment, correct
// option matching an option id) lives in the service (doc 12 §6).
const localized = z.record(z.string(), z.string());

export const createQuizSchema = z.object({
  lessonId: z.string().uuid(),
  passingScore: z.number().min(0).max(100).optional(),
  timeLimitMinutes: z.number().int().positive().nullish(),
});

export const createQuestionSchema = z.object({
  prompt: localized,
  options: z
    .array(z.object({ id: z.string().trim().min(1).optional(), text: localized }))
    .min(2),
  correctOptionId: z.string().trim().min(1),
  points: z.number().positive().optional(),
});

export const submitAttemptSchema = z.object({
  answers: z.record(z.string(), z.string()),
});
