// Client-side validators that mirror the server's zod rules (server
// modules/auth/*.schemas.ts). The server re-validates everything — these just
// give fast, translated feedback before a round-trip.

// Egyptian mobile: optional +20 / 20 / 0 prefix, then 1 and 9 digits.
export const EGYPT_MOBILE_RE = /^(\+?20|0)?1[0-9]{9}$/;

// Deliberately permissive email shape (real validation is server-side).
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// A YYYY-MM-DD calendar date (matches addStudentSchema.dateOfBirth).
export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
