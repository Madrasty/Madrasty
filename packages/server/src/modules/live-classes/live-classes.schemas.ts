import { z } from 'zod';
import { ATTENDANCE_STATUSES } from '@madrasty/shared';

// Validation for the live-class endpoints. Policy (ownership, enrollment, the
// guardian gate, whether the class is actually live) lives in the service.
//
// Note what a client is NOT allowed to send anywhere here: the channel name, the
// RTC role, or its own attendance status. All three are decided server-side —
// they are what stops a student minting themselves a host token into a paid class.
export const setAttendanceSchema = z.object({
  studentId: z.string().uuid(),
  status: z.enum(ATTENDANCE_STATUSES),
});
