// Shared type contract imported by BOTH client and server (see CLAUDE.md).
// Never duplicate these definitions on either side.

// --- Roles (mirrors the `user_role` DB enum, doc 03 / doc 11) ---
export const USER_ROLES = ['student', 'parent', 'teacher', 'admin', 'center_admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['active', 'suspended', 'pending_verification'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

// --- Public user shape (never carries password_hash) ---
export interface AuthUser {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  role: UserRole;
  localePreference: string;
  status: UserStatus;
  verificationLevel: number;
}

// --- Auth request/response DTOs ---
export interface RegisterParentRequest {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  localePreference?: string;
}

export interface RegisterParentResponse {
  user: AuthUser;
}

export interface LoginRequest {
  // A parent may sign in with either their email or their phone number.
  identifier: string;
  password: string;
}

// The refresh token is delivered ONLY via an httpOnly cookie, never in a body.
export interface LoginResponse {
  user: AuthUser;
  accessToken: string;
}

export interface RefreshResponse {
  accessToken: string;
}
