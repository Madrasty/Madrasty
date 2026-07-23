import { z } from 'zod';
import { config } from '../../config/index';

// Egyptian mobile numbers, permissive but structured: optional +20 / 0 prefix.
const phoneSchema = z
  .string()
  .trim()
  .regex(/^(\+?20|0)?1[0-9]{9}$/, 'Must be a valid Egyptian mobile number.');

export const registerParentSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required.').max(120),
  email: z.string().trim().toLowerCase().email('Must be a valid email address.'),
  phone: phoneSchema,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password is too long.'),
  localePreference: z
    .enum(config.SUPPORTED_LOCALES as [string, ...string[]])
    .optional()
    .default(config.DEFAULT_LOCALE),
});

// Teacher self-registration — identical fields to a parent; the role is fixed
// server-side, never taken from the client.
export const registerTeacherSchema = registerParentSchema;

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Email or phone is required.'),
  password: z.string().min(1, 'Password is required.'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters.')
    .max(128, 'New password is too long.'),
});

export type RegisterParentInput = z.infer<typeof registerParentSchema>;
export type RegisterTeacherInput = z.infer<typeof registerTeacherSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
