# Points, Coupons & Loyalty Program Design

## 1. Points System

### Earning rules (data-driven, not hardcoded)
Store earn-rules as rows, not `if` statements, so marketing can run campaigns without a code deploy:

```sql
earn_rules (
  id UUID PK,
  trigger TEXT,            -- 'purchase' | 'referral_signup' | 'program_completion' | 'quiz_streak'
  points_formula JSONB,    -- e.g. { "type": "per_currency", "rate": 0.1 }  → 1 pt per 10 EGP
  active_from TIMESTAMPTZ,
  active_until TIMESTAMPTZ NULL,   -- null = always on
  conditions JSONB,        -- { "min_amount": 50, "subjects": [...] }
  priority INT
)
```

Examples of formulas the same engine can express without new code:
- Standard: 1 point per 10 EGP spent.
- Campaign: "Double points on Math programs this week" → add a second `earn_rules` row with `rate: 0.2`, `active_until` set, `conditions.subjects = [math_subject_id]`.
- Referral: flat 100 points on `referral_signup` trigger, once the referred student makes their first purchase.
- Streak: bonus points for 7-day homework completion streak.

### Redeeming points
- Points convert to discount at checkout: e.g. 100 points = 10 EGP off (configurable ratio in a `points_config` table, not hardcoded).
- Redemption creates a negative `points_ledger` entry linked to the `transaction_id`, and reduces the checkout total server-side.
- Minimum redemption threshold (e.g., can't redeem below 200 points) to keep redemptions administratively cheap.

### Expiry (optional, phase 2)
- A scheduled job can insert negative ledger entries with `reason='expiry'` for points older than N months — this is why the ledger design matters: expiry is just another event, not a special balance-mutation code path.

## 2. Coupons

Already modeled in doc 03 (`coupons`, `coupon_redemptions`). Key behaviors:

| Coupon type | `discount_type` | Example |
|---|---|---|
| Percentage off | `percentage` | `RAMADAN20` → 20% off |
| Fixed amount off | `fixed_amount` | `WELCOME50` → 50 EGP off |
| Bonus points | `free_points` | `LAUNCH100` → +100 points, no price change |

**Validation logic at redemption time (server-side, always):**
1. Coupon exists, `valid_from <= now <= valid_until`.
2. `usage_limit` not exceeded (count from `coupon_redemptions`).
3. `usage_limit_per_user` not exceeded for this user.
4. `applicable_to` conditions match the cart (subject/program/min_amount).
5. Not combinable with certain other coupons unless explicitly flagged (`stackable: true/false` in `metadata`).

## 3. Loyalty Tiers

Tiers (`loyalty_tiers` table, doc 03) are derived from **lifetime points earned** (not current balance, so spending points doesn't demote you):

| Tier (example) | Min lifetime points | Perks (example) |
|---|---|---|
| Bronze | 0 | Standard access |
| Silver | 1,000 | 5% off all programs |
| Gold | 5,000 | 10% off + priority support + early access to new programs |
| Platinum | 15,000 | 15% off + free monthly private-session credit |

Tier perks are stored as JSONB (`perks`) and read at checkout time by the pricing engine — so adding a new perk type doesn't require new tier logic, just a new key your checkout/UI knows to look for.

## 4. Where this shows up in the product
- **Checkout**: coupon code field + "use my points" toggle, both applied server-side, both shown transparently in the order summary (original price → coupon discount → points discount → final price).
- **Parent/Student dashboard**: points balance, current tier, progress bar to next tier, "available rewards" list.
- **Admin panel**: create/manage coupons, view redemption stats, manually adjust points (with mandatory `reason` + audit log — this hits the same `points_ledger` with `reason='admin_adjustment'`).
- **Referral flow**: shareable referral code/link per user; new signup + first purchase triggers points to both referrer and referee (configurable).

## 5. Anti-abuse guardrails
- Refunded transactions must reverse any points earned/coupon usage tied to them (a refund event triggers a compensating negative `points_ledger` entry — see doc 06).
- Rate-limit coupon-code attempts per user/IP to prevent brute-forcing codes.
- Points/coupon redemption endpoints require authentication and are never trusted from client-computed totals.
