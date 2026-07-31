import { z } from 'zod';

// Validation for the AI tutor endpoints. Deeper policy (guardian gate,
// enrollment, daily quota) lives in the service.
export const startConversationSchema = z.object({
  lessonId: z.string().uuid().nullish(),
  programId: z.string().uuid().nullish(),
});

// The upper bound is a cost guard as much as a validation rule: a pasted essay
// would be billed as input tokens on every subsequent turn of the thread.
export const askSchema = z.object({
  question: z.string().trim().min(1).max(4000),
});
