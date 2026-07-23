import {
  pgTable,
  uuid,
  numeric,
  text,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { paymentProvider, purchasableType, transactionStatus } from './enums';

// Append-only payments ledger (doc 03 "ledger pattern", doc 04). A transaction is
// created `pending` at checkout, then a signature-verified webhook flips it to
// `paid`/`failed` — access is NEVER granted from a browser redirect (doc 04 §3).
//
// Idempotency (doc 04 §7): the webhook handler keys on (payment_provider,
// provider_reference). The partial unique index below makes a second delivery of
// the same gateway event a no-op at the DB level, not just in application code.
export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    // The beneficiary of the purchase. For a parent paying for a child this is the
    // student (not the payer); for a student self-purchase it equals user_id.
    // Nullable to keep the column stable for non-enrollment purchasables later.
    beneficiaryId: uuid('beneficiary_id').references(() => users.id),
    purchasableType: purchasableType('purchasable_type').notNull(),
    purchasableId: uuid('purchasable_id').notNull(),
    // Server-recalculated amount (doc 04 §3) — never the client-sent price.
    amountEgp: numeric('amount_egp').notNull(),
    currency: text('currency').notNull().default('EGP'),
    paymentProvider: paymentProvider('payment_provider').notNull(),
    // The gateway's own transaction id, filled once the provider accepts the order.
    providerReference: text('provider_reference'),
    status: transactionStatus('status').notNull().default('pending'),
    // Full audit trail: the checkout order snapshot + raw webhook payloads live
    // here (doc 04 §7) so disputes stay traceable without a separate events table.
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byUser: index('transactions_user_idx').on(table.userId),
    byPurchasable: index('transactions_purchasable_idx').on(
      table.purchasableType,
      table.purchasableId,
    ),
    // Idempotency guard: one row per (provider, gateway reference).
    providerRef: uniqueIndex('transactions_provider_reference_idx').on(
      table.paymentProvider,
      table.providerReference,
    ),
  }),
);
