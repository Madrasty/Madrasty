import type { TFunction } from 'i18next';
import { ApiError } from '../../lib/api';

// Server error codes we render with a tailored translation. Anything else falls
// back to auth.errors.generic (never the raw English server message).
const KNOWN_CODES = new Set([
  'network_error',
  'validation_error',
  'account_exists',
  'invalid_credentials',
  'invalid_current_password',
  'account_not_active',
  'invalid_refresh_token',
  'approval_request_not_found',
  'already_resolved',
  'request_expired',
  'phone_mismatch',
  'otp_not_found',
  'otp_expired',
  'otp_locked',
  'invalid_otp',
  'insufficient_role',
  'missing_token',
  'invalid_token',
]);

// Maps a thrown error to a translated, user-facing message.
export function authErrorMessage(t: TFunction, error: unknown): string {
  if (error instanceof ApiError && KNOWN_CODES.has(error.code)) {
    return t(`auth.errors.${error.code}`);
  }
  return t('auth.errors.generic');
}
