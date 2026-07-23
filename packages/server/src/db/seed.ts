import { eq } from 'drizzle-orm';
import { config } from '../config/index';
import { hashPassword } from '../modules/auth/password';
import { db, pool } from './client';
import { users } from './schema/index';

// Bootstraps the platform admin account (ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD).
// Idempotent: if an account with that email already exists, it is left untouched
// (so re-seeding never resets a password the admin has since changed). Rotate the
// initial password after first login via POST /api/auth/change-password.
async function seedAdmin(): Promise<void> {
  const email = config.ADMIN_EMAIL.toLowerCase();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);

  if (existing.length > 0) {
    console.log(`Admin account already exists (${email}); leaving it unchanged.`);
    return;
  }

  const passwordHash = await hashPassword(config.ADMIN_INITIAL_PASSWORD);
  await db.insert(users).values({
    email,
    passwordHash,
    role: 'admin',
    localePreference: config.DEFAULT_LOCALE,
    verificationLevel: 1,
    metadata: { fullName: 'Administrator' },
  });

  console.log(`Created admin account: ${email}`);
  console.log('Log in with the initial password, then change it via POST /api/auth/change-password.');
}

async function main() {
  console.log('Seeding…');
  await seedAdmin();
  console.log('Seed complete.');
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
