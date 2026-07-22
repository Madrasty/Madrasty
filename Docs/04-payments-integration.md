# Multi-Gateway Payments Integration

## 1. Why an abstraction layer

Egypt's payment landscape means you need several providers to cover the market: card payments, mobile wallets, and cash-voucher/reference-based payments. Rather than hardcoding "if paymob then... else if fawry then...", define one interface and one class per provider.

```ts
// payment.interface.ts
interface PaymentProvider {
  name: string;
  createPayment(order: OrderInput): Promise<PaymentInitResult>;
  verifyWebhook(payload: unknown, signature: string): boolean;
  refund(transactionRef: string, amount: number): Promise<RefundResult>;
  checkStatus(transactionRef: string): Promise<PaymentStatus>;
}
```

Each of `paymob.provider.ts`, `fawry.provider.ts`, `vodafone-cash.provider.ts`, `instapay.provider.ts`, `stripe.provider.ts` implements this same interface. `payment.service.ts` picks the right provider by name and never contains gateway-specific code.

## 2. Recommended gateways for Egypt

| Method | Provider | Covers | Notes |
|---|---|---|---|
| Credit/Debit cards | **Paymob** | Visa/Mastagerd/Meeza | Also offers Fawry, Vodafone Cash, ValU under one integration — good primary choice |
| Cash voucher | **Fawry** (direct or via Paymob) | Pay at kiosk with reference code | Important for users without cards |
| Mobile wallet | **Vodafone Cash** (direct or via Paymob) | Wallet-to-merchant | High usage among parents in Egypt |
| Bank transfer / instant | **InstaPay** | Direct bank-linked instant transfer | Newer, growing fast, zero/low fees |
| Installments | **ValU / Paymob's installment options** | Program bundles, higher-ticket items | Optional, phase 2 |
| International cards (future) | **Stripe** | For expansion beyond Egypt | Add later behind same interface |

**Practical integration order:** Paymob first (it proxies several of the above through one API), then add direct Fawry/Vodafone Cash integrations if Paymob's coverage or fees aren't good enough, then InstaPay, then Stripe when you expand.

## 3. Checkout Flow

```
Student/Parent clicks "Buy Program"
        │
        ▼
Frontend calls POST /api/checkout
   { purchasable_type, purchasable_id, coupon_code?, payment_method }
        │
        ▼
Backend: 
  1. Recalculate price server-side (never trust client price)
  2. Apply coupon (doc 05) + points redemption if selected
  3. Create `transactions` row, status='pending'
  4. Call PaymentProvider.createPayment()
  5. Return provider's redirect URL / iframe token / wallet prompt to frontend
        │
        ▼
User completes payment on provider's page/app
        │
        ▼
Provider sends webhook → POST /api/webhooks/:provider
  1. Verify signature/HMAC (verifyWebhook)
  2. Update `transactions.status` = paid/failed
  3. On success: grant program access, emit points_ledger entry, send receipt notification
        │
        ▼
Frontend polls or listens (WebSocket/short-poll) for transaction status → shows success screen
```

**Critical rule:** never grant access to a program/session purely from the frontend's "redirect back" URL — always confirm via the server-verified webhook or a server-side status check. This is the #1 fraud vector in DIY payment integrations.

## 4. Subscriptions (student/teacher plans, center plans)

- Store subscription state in a `subscriptions` table: `user_id, plan_id, status (active/past_due/cancelled), current_period_end, provider_subscription_ref`.
- For providers without native recurring billing (common with wallets/Fawry), implement your own renewal: a scheduled job checks `current_period_end` and creates a new `transactions` row + sends a "renew now" payment link/notification before/at expiry — this is normal practice in the Egyptian market since not all local methods support auto-recurring charges.

## 5. Currency & Pricing
- Store prices in EGP as the source of truth (`amount_egp` — matches your DB doc).
- If you expand internationally later, add `currency` + `fx_rate_snapshot` to `transactions` rather than redesigning pricing.

## 6. Escrow-Style Held Payouts (Home Tutoring)

Most of this platform's payments release to the recipient (teacher) immediately on `transactions.status = 'paid'` — that's fine for digital content that's delivered instantly. **Home Tutoring (doc 13) is the exception**: since the "product" is a real-world home visit the platform can't directly verify, payment is captured but held (`payout_status = 'held'` on the booking) until the session is marked `completed`, then released to the teacher minus commission. Build this as a distinct, explicit `payout_status` field rather than inferring "should I pay the teacher yet?" from `transactions.status` alone — the two lifecycles (customer paid vs. provider gets paid) are related but not identical, and Home Tutoring is where that gap actually matters.

## 7. Security Checklist
- [ ] All webhook endpoints verify signature/HMAC before processing.
- [ ] Idempotency: webhook handler must be safe to receive the same event twice (check `provider_reference` uniqueness before applying effects).
- [ ] No card data ever touches your server — always redirect/iframe to the provider's hosted payment page (PCI-DSS scope stays with them).
- [ ] Log every payment state transition (use the `metadata` JSONB + a `payment_events` table if you want full webhook payload history for disputes).
- [ ] Rate-limit checkout endpoint per user/IP to slow down card-testing fraud attempts.

## 8. Refunds
See doc 06 for policy; technically, `refund()` on the provider interface issues the reversal, and a `refunds` row (doc 03) tracks approval state independent of the provider's own processing delay (refunds to wallets/cards can take days — your `status` field should reflect "approved, processing" vs "completed").
