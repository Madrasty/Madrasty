# Returns & Refunds Policy and Workflow

Digital education products don't have physical "returns," so the policy needs to define what qualifies as a refundable event and over what window — this protects you from abuse while still being fair to parents (your actual payers, per plan.md).

> **Note:** since doc 12 replaced the flat "course" model with **Learning Programs** made of typed lessons (recorded/live/pdf/audio/quiz/homework/exam/private_session), refund eligibility is now judged per **program** but calculated from **lesson-level consumption**, not a single "% of course watched" number. A program that's mostly PDFs and live sessions doesn't have a meaningful "% video watched" metric — the rule below generalizes to "% of *published, paid* lessons the student has opened," across whatever mix of types that program contains.

## 1. Policy (draft — adjust % / days to your legal/business preference)

| Product type | Refund window | Condition |
|---|---|---|
| Learning Program (any lesson-type mix) | 7 days from purchase | Refundable only if less than 20% of the program's published paid lessons have been opened/started — counts Recorded, PDF, Audio, and Quiz lessons opened; Live/Private Session lessons already attended count as consumed regardless of the 20% threshold |
| Live lesson (scheduled, within a program) | Up to 24h before start | Full refund for that lesson's portion of the price (or program stays refundable under the 7-day rule if the live lesson hasn't happened yet); after 24h, no refund except teacher cancellation |
| Private session lesson (booking) | Up to 12h before slot | Full refund; late cancellation forfeits session or charges a fee (configurable %) |
| Home Tutoring booking (in-person, doc 13) | Before teacher accepts: full refund. After acceptance, >12h before visit: full refund. <12h before: partial refund/forfeiture (configurable) | Teacher-caused cancellation/no-show → automatic full refund to parent regardless of timing, since the teacher caused the failure, not the parent; see doc 13 §9 |
| Subscription (monthly) | Pro-rated | Refund unused days if cancelled early, or simply stop next renewal (no refund on already-used period) — choose one policy and state it clearly at checkout |
| Educational Center B2B plan | Per contract terms | Typically handled manually by Admin, not self-serve |
| Coupon/points-only "purchases" | N/A | No cash refund; reverse the points/coupon instead |

**Non-refundable by default:** a program where the student has opened most of its paid lessons regardless of type (fraud vector: "open everything, then request refund"), any Live or Private Session lesson already attended, expired booking slots with no-show, and Home Tutoring bookings already marked `completed` (dispute process only, per doc 13 §9).

**Why "lessons opened" instead of "% video watched":** doc 12's whole premise is that a program might contain zero recorded videos (e.g., Teacher C's all-live-plus-PDF style) — so the refund engine reads `lesson.status`/a per-student `lesson_completions`-style access log (opened_at timestamp per lesson per student) rather than a video-player watch-percentage, which some lesson types don't even have.

## 2. Workflow

```
Student/Parent requests refund (self-serve form or support ticket)
        │
        ▼
POST /api/refunds/request  { transaction_id, reason }
        │
        ▼
Backend creates `refunds` row, status='requested'
   - Auto-checks eligibility rules (window, consumption %, product type)
   - If auto-eligible → status='approved', triggers refund immediately
   - If borderline/ineligible → flagged for Admin review
        │
        ▼
[If Admin review needed] Admin dashboard shows request + auto-check result
   Admin approves or rejects with a note
        │
        ▼
On approval:
  1. Call PaymentProvider.refund(transactionRef, amount)   (doc 04)
  2. Update `transactions.status` = refunded / partially_refunded
  3. Revoke program access (or leave access + just flag, per your business call)
  4. Reverse any points earned from that transaction (negative points_ledger entry)
  5. Reverse coupon usage count if it should be "returned" to the user
  6. Send confirmation notification (email/WhatsApp/push) with expected timeline
        │
        ▼
Provider processes actual money movement (can take 3-14 business days depending on gateway/method — communicate this to the user, don't promise instant)
```

## 3. Special cases

- **Teacher cancels a live class/session**: auto-refund (or auto-credit as points/wallet credit — your choice) without needing the student to request it; this builds trust with parents.
- **Technical failure** (video didn't play, platform outage during a scheduled live class): treat as a platform-caused refund, not counted against the student's "abuse" pattern, and consider compensating with bonus points instead of cash to preserve revenue while keeping goodwill.
- **Partial refunds**: supported at the data level (`refunds.amount_egp` can be less than `transactions.amount_egp`) — useful for "watched 2 of 10 lessons" pro-rated refunds if you choose to offer that tier of policy.
- **Disputed/chargeback** (card): keep a `dispute_status` in `transactions.metadata`; this is handled mostly by the payment gateway/bank, but you should log it and potentially suspend the account pending resolution to prevent access-then-chargeback fraud loops.

## 4. What to show at checkout (UX/legal requirement)
Before payment confirmation, display a short, plain-language summary (in the user's chosen language — see doc 07):
- "Learning Programs can be refunded within 7 days if less than 20% of lessons have been opened."
- "Live sessions can be cancelled for a full refund up to 24 hours before start."
This single checkbox/acknowledgment reduces disputes dramatically and is standard practice for e-learning platforms.
