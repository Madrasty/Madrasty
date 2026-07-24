import { eq, sql } from 'drizzle-orm';
import { config } from '../config/index';
import { hashPassword } from '../modules/auth/password';
import { db, pool } from './client';
import { earnRules, loyaltyTiers, pointsConfig, users } from './schema/index';

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

// Loyalty defaults (doc 05). Idempotent: each block only seeds if that table is
// still empty, so re-seeding never overrides a rule/config/tier an admin has since
// tuned. Rules/config/tiers are DATA, not code — they can be edited live.
async function seedLoyaltyDefaults(): Promise<void> {
  const [{ count: ruleCount }] = await db
    .select({ count: sql<string>`COUNT(*)` })
    .from(earnRules);
  if (Number(ruleCount) === 0) {
    // Standard: 1 point per 10 EGP spent (doc 05 §1).
    await db.insert(earnRules).values({
      trigger: 'purchase',
      pointsFormula: { type: 'per_currency', rate: 0.1 },
      conditions: {},
      priority: 0,
    });
    console.log('Seeded default earn rule (1 pt / 10 EGP on purchase).');
  } else {
    console.log('Earn rules already present; leaving them unchanged.');
  }

  const [{ count: cfgCount }] = await db
    .select({ count: sql<string>`COUNT(*)` })
    .from(pointsConfig);
  if (Number(cfgCount) === 0) {
    // 10 points = 1 EGP (100 pts = 10 EGP off); min 200 points to redeem (doc 05 §1).
    await db.insert(pointsConfig).values({
      redeemPointsPerEgp: 10,
      minRedeemPoints: 200,
      maxRedeemPercent: 100,
    });
    console.log('Seeded points config (10 pts = 1 EGP, min 200).');
  } else {
    console.log('Points config already present; leaving it unchanged.');
  }

  const [{ count: tierCount }] = await db
    .select({ count: sql<string>`COUNT(*)` })
    .from(loyaltyTiers);
  if (Number(tierCount) === 0) {
    // Tiers derived from lifetime points (doc 05 §3).
    await db.insert(loyaltyTiers).values([
      { name: { ar: 'برونزي', en: 'Bronze' }, minPoints: 0, perks: {} },
      { name: { ar: 'فضي', en: 'Silver' }, minPoints: 1000, perks: { discount_pct: 5 } },
      {
        name: { ar: 'ذهبي', en: 'Gold' },
        minPoints: 5000,
        perks: { discount_pct: 10, priority_support: true },
      },
      {
        name: { ar: 'بلاتيني', en: 'Platinum' },
        minPoints: 15000,
        perks: { discount_pct: 15, priority_support: true, monthly_session_credit: 1 },
      },
    ]);
    console.log('Seeded loyalty tiers (Bronze/Silver/Gold/Platinum).');
  } else {
    console.log('Loyalty tiers already present; leaving them unchanged.');
  }
}

async function main() {
  console.log('Seeding…');
  await seedAdmin();
  await seedLoyaltyDefaults();
  console.log('Seed complete.');
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
