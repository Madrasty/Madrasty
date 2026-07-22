import { z } from 'zod';

const egyptianMobile = z
  .string()
  .trim()
  .regex(/^(\+?20|0)?1[0-9]{9}$/, 'Must be a valid Egyptian mobile number.');

// Feature 5 — a parent adds a student sub-profile (name, DOB, grade, school, city).
export const addStudentSchema = z.object({
  name: z.string().trim().min(2, 'Student name is required.').max(120),
  dateOfBirth: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD.'),
  grade: z.string().trim().min(1, 'Grade is required.'),
  school: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  relationship: z.enum(['father', 'mother', 'guardian', 'other']).optional().default('guardian'),
});

// Feature 6 — student-first self-registration (name, grade, parent mobile).
export const studentSelfRegisterSchema = z.object({
  name: z.string().trim().min(2, 'Student name is required.').max(120),
  grade: z.string().trim().min(1, 'Grade is required.'),
  parentMobile: egyptianMobile,
});

// Feature 7 — guardian supplies the OTP delivered to their phone to approve.
export const approveSchema = z.object({
  otp: z.string().trim().regex(/^\d{4,8}$/, 'OTP must be 4-8 digits.'),
});

export type AddStudentInput = z.infer<typeof addStudentSchema>;
export type StudentSelfRegisterInput = z.infer<typeof studentSelfRegisterSchema>;
export type ApproveInput = z.infer<typeof approveSchema>;
