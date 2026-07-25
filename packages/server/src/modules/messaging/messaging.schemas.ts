import { z } from 'zod';
import { MESSAGE_MAX_LENGTH } from '@madrasty/shared';

// Validation for the messaging endpoints. UUIDs and body length are checked at
// the API boundary; deeper policy (guardian link, teacher-teaches-student) lives
// in the service (doc 10 §6).
export const startConversationSchema = z.object({
  teacherId: z.string().uuid(),
  studentId: z.string().uuid(),
});

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, 'Message cannot be empty.').max(MESSAGE_MAX_LENGTH),
});
