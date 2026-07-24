import {
  pgTable,
  uuid,
  integer,
  numeric,
  text,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { transactions } from './payments';

// Loyalty / points / coupons (doc 03 "Loyalty" section, doc 05).
//
// Design notes carried from the docs:
// - The points system is an APPEND-ONLY LEDGER (like transactions). A balance is
//   never a mutated column — it is SUM(delta). Earning, redeeming, expiry, admin
//   adjustments and reversals are all just rows (doc 03 ledger pattern, doc 05 §1).
// - Earn rules are DATA, not code: the rules engine reads `earn_rules` rows so a
//   campaign ("2x points on Math this week") is an insert, not a deploy (doc 05 §1).
// - `reason`, `trigger`, and `discount_type` are TEXT (as in doc 03) rather than
//   enums, so new campaign types / reasons don't need a migration; the allowed
//   values live in @madrasty/shared and are enforced by zod at the API layer.

// How points are earned. `points_formula` is interpreted by the rules engine, e.g.
// { "type": "per_currency", "rate": 0.1 } → 1 point per 10 EGP; { "type": "flat",
// "points": 100 } → a fixed award. `conditions` gates the rule (min_amount,
// subjects, …). Highest `priority` wins when several rules match a trigger.
export const earnRules = pgTable(
  'earn_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    trigger: text('trigger').notNull(), // 'purchase' | 'referral_signup' | 'program_completion' | 'quiz_streak'
    pointsFormula: jsonb('points_formula').notNull(),
    conditions: jsonb('conditions').notNull().default({}),
    priority: integer('priority').notNull().default(0),
    // Campaign window. `active_until` NULL = always on (doc 05 §1).
    activeFrom: timestamp('active_from', { withTimezone: true }).notNull().defaultNow(),
    activeUntil: timestamp('active_until', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byTrigger: index('earn_rules_trigger_idx').on(table.trigger),
  }),
);

// Append-only points ledger. balance = SUM(delta) WHERE user_id = X;
// lifetime = SUM(delta) WHERE delta > 0 (drives tier — spending never demotes).
// `reason`: 'purchase' | 'redeem_reward' | 'redeem_reversal' | 'coupon_bonus' |
// 'referral' | 'expiry' | 'admin_adjustment' (doc 03; extended for redemption
// reversal + coupon bonus — see @madrasty/shared POINTS_REASONS).
export const pointsLedger = pgTable(
  'points_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    delta: integer('delta').notNull(), // positive = earn, negative = redeem/expire
    reason: text('reason').notNull(),
    relatedTransactionId: uuid('related_transaction_id').references(() => transactions.id),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byUser: index('points_ledger_user_idx').on(table.userId),
    byTransaction: index('points_ledger_transaction_idx').on(table.relatedTransactionId),
  }),
);

// Singleton config for point↔currency conversion at redemption (doc 05 §1 —
// "configurable ratio in a points_config table, not hardcoded"). One row; read the
// first. `redeem_points_per_egp` = points needed for 1 EGP off (10 → 100 pts = 10 EGP).
export const pointsConfig = pgTable('points_config', {
  id: uuid('id').primaryKey().defaultRandom(),
  redeemPointsPerEgp: integer('redeem_points_per_egp').notNull().default(10),
  minRedeemPoints: integer('min_redeem_points').notNull().default(200),
  // Cap points discount to this % of the order total (guardrail; 100 = no cap).
  maxRedeemPercent: integer('max_redeem_percent').notNull().default(100),
  metadata: jsonb('metadata').notNull().default({}),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Coupons (doc 03, doc 05 §2). `discount_type`: 'percentage' | 'fixed_amount' |
// 'free_points'. `applicable_to`: { programs?, subjects?, min_amount? }.
export const coupons = pgTable(
  'coupons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull(),
    discountType: text('discount_type').notNull(),
    discountValue: numeric('discount_value').notNull(),
    usageLimit: integer('usage_limit'), // null = unlimited
    usageLimitPerUser: integer('usage_limit_per_user').notNull().default(1),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
    validUntil: timestamp('valid_until', { withTimezone: true }),
    applicableTo: jsonb('applicable_to').notNull().default({}),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    // Soft delete = admin disabling a coupon (doc 03 soft-delete convention).
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    // Case-insensitive uniqueness is enforced in app code (codes normalized upper).
    codeUnique: uniqueIndex('coupons_code_idx').on(table.code),
  }),
);

// One row per time a coupon is applied to a transaction (doc 03). Usage limits are
// counted from here. A row is written when a coupon is reserved at checkout and
// removed if that transaction fails, so counts reflect live + completed use.
export const couponRedemptions = pgTable(
  'coupon_redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    couponId: uuid('coupon_id')
      .notNull()
      .references(() => coupons.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byCoupon: index('coupon_redemptions_coupon_idx').on(table.couponId),
    byCouponUser: index('coupon_redemptions_coupon_user_idx').on(table.couponId, table.userId),
    // One coupon can be reserved at most once per transaction.
    perTransaction: uniqueIndex('coupon_redemptions_txn_idx').on(
      table.couponId,
      table.transactionId,
    ),
  }),
);

// Loyalty tiers, derived from LIFETIME points (doc 03, doc 05 §3). `perks` is
// JSONB so a new perk type is a data change, read by the pricing engine at checkout.
export const loyaltyTiers = pgTable(
  'loyalty_tiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: jsonb('name').notNull(), // { "ar": "ذهبي", "en": "Gold" }
    minPoints: integer('min_points').notNull(),
    perks: jsonb('perks').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byMinPoints: index('loyalty_tiers_min_points_idx').on(table.minPoints),
  }),
);
