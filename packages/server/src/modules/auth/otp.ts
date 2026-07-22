import { randomBytes, randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';

// OTP codes are low-entropy, so we still bcrypt them (never store the raw code —
// doc 11) and rely on short expiry + attempt limits for brute-force resistance.
const OTP_SALT_ROUNDS = 10;

export function generateOtpCode(length: number): string {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += randomInt(0, 10).toString();
  }
  return code;
}

export function hashOtp(code: string): Promise<string> {
  return bcrypt.hash(code, OTP_SALT_ROUNDS);
}

export function verifyOtp(code: string, hash: string): Promise<boolean> {
  return bcrypt.compare(code, hash);
}

// Opaque, URL-safe token embedded in the guardian-approval SMS link (doc 11 §8).
export function generateApprovalToken(): string {
  return randomBytes(32).toString('hex');
}
