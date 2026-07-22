import bcrypt from 'bcryptjs';

// bcrypt with a work factor of 12. Passwords are only ever stored as this hash;
// the plaintext never leaves this function boundary.
const SALT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
