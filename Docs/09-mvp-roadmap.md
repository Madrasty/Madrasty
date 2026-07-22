# Phased Roadmap

## Phase 0 — Foundation (1–2 weeks)
- Repo setup per doc 02, DB schema per doc 03 (core tables only: users, learning_programs, chapters, lessons, transactions).
- **Parent-first registration** (doc 11): Flow A (parent registers → adds students) and Flow B (student self-registers → SMS approval link → parent onboards/approves) — both must exist before Phase 1, since every other feature assumes a student profile is either `pending_approval` or `active` under a verified guardian.
- Level 1 verification only (SMS OTP + email) — Levels 2-4 (National ID, school integration, teacher invitation) stay deferred to their later phases per doc 11 §10.
- Auth + role-based access.
- i18n scaffolding (ar/en) wired into every screen from the start.
- **Exit criteria**: a user can register as student or teacher, switch language, and see an empty dashboard.
  - Specifically for the parent/student case: a parent can complete Flow A end-to-end, *and* a student can trigger Flow B and see their profile flip from pending to active once a parent approves via the SMS link.

## Phase 1 — Core Marketplace MVP (3–5 weeks)
- Teacher: create a Learning Program, add chapters, add typed lessons (recorded video, live, pdf, quiz, etc.) (to object storage/streaming provider, not local disk), submit for admin approval.
- Admin: approve/reject learning programs, verify teachers.
- Student: browse catalog, preview, purchase (**one** payment provider — Paymob — end to end).
- Basic homework + quizzes (teacher-authored, not AI yet).
- Parent: read-only dashboard showing child's enrolled programs + progress %.
- **Exit criteria**: a real transaction can happen start to finish, and a parent can see their child made progress. This is your first "real" testable product.

## Phase 2 — Payments Depth + Loyalty (2–4 weeks)
- Add Fawry, Vodafone Cash, InstaPay providers behind the same interface (doc 04).
- Points ledger + earn rules (doc 05) tied to real purchases.
- Coupons (admin-created, redeemable at checkout).
- Refunds workflow (doc 06) — at least the manual/admin-reviewed path; automate the "auto-eligible" fast path once you trust the volume.
- **Exit criteria**: a parent can pay with a mobile wallet, use a coupon, earn points, and request a refund — all without a developer intervening.

## Phase 2.5 — Parent–Teacher–Student "Real School" Workflow (2–3 weeks)
- Exams & report cards: teachers create exams, record `exam_results`; parent/student see a report-card view aggregating exams + quiz averages + homework rate (doc 10).
- Attendance tracking tied to live/tutoring sessions.
- Parent–teacher messaging (`conversations`/`messages`), scoped per child, with admin audit visibility.
- Progress snapshots (nightly-computed) feeding the parent dashboard's "weak subject" flags.
- Notification hooks: new grade posted, teacher message received, weekly progress summary.
- **Exit criteria**: a parent can open the app and see their child's grades, attendance, and progress at a glance, and message the teacher directly — without WhatsApp. This is the feature that makes the platform feel like a school, not a program store, and it should land right after Phase 2 because it needs real enrollment/payment data to be meaningful.

## Phase 3 — Engagement Features (3–5 weeks)
- Live classes (Agora/100ms integration) + private tutoring booking/calendar.
- AI Q&A (basic — LLM API call with curriculum context, not fine-tuned).
- Notifications (email + WhatsApp/push) for homework reminders, payment receipts, parent alerts.
- Loyalty tiers UI + referral program.
- **Exit criteria**: the "three-sided marketplace" feel is real — teachers can run live sessions, students get reminders, parents get real visibility.

## Phase 3.5 — Home Tutoring Marketplace (2–4 weeks)
- Teacher service areas, availability, and duration/pricing tiers (doc 13 §4-5).
- Booking flow: search → request → teacher accept/decline → payment → status tracking through to completion.
- Escrow-style payout (doc 04 §6, doc 13 §6) — this is new payment logic, budget real testing time here, not just a copy of the digital-content payment flow.
- Ratings & reviews, safety features (identity verification tie-in from doc 11, OTP session-start confirmation).
- **Exit criteria**: a parent can book, pay for, and complete an in-person home tutoring session end-to-end, and the teacher only receives payout after the session is marked complete. Placed after Phase 3 deliberately — it reuses teacher verification, payments, and notifications infrastructure that should already be proven by this point, and the escrow payout is worth building once simpler payment flows are stable in production.

## Phase 4 — Scale & Polish (ongoing)
- AI-generated quizzes, automatic homework correction.
- Educational Center (B2B) module.
- Performance passes (video CDN tuning, DB indexing, caching hot queries like the learning program catalog).
- Deploy to Render/Railway/VPS and move Postgres/Redis to managed providers once ready for beta/production (doc 01 §6, doc 08 §8).
- Secondary/Thanaweya Amma curriculum expansion.

## Rough Cost Notes (order-of-magnitude, not quotes)
| Item | Notes |
|---|---|
| Local dev (Docker Desktop) | Free — Postgres/Redis run locally in containers during development (doc 14) |
| Managed Postgres (Neon/Supabase) | Free tier works for MVP; scales to ~$25–50/mo at moderate usage |
| Object storage + video streaming (Bunny/Mux) | Pay-as-you-go; video bandwidth is usually the biggest line item as you scale |
| Payment gateway fees | Typically 1.5–3% per transaction (varies by provider/contract) — factor into your commission margins from doc's revenue model |
| LLM API (AI Q&A/quiz gen) | Pay-per-token; budget a monthly cap per user tier to avoid runaway cost from heavy AI users |
| SMS OTP (doc 11) + optional maps/geocoding (doc 13 addresses) | Per-message SMS cost (Twilio or a local Egyptian SMS gateway); maps/geocoding only needed if you validate/autocomplete addresses rather than free-text entry |

## Team Notes
- Solo-buildable through Phase 1 with Claude Code if you're hands-on with backend logic (which fits your engineering background).
- Consider bringing in a frontend-focused contractor or using Claude Design/Claude Code for UI polish once functional flows exist — this is more efficient than perfecting UI before logic works.
- Payments and refunds code (doc 04, 06) should always get a manual human review pass — this is the one area not to fully delegate to AI-generated code without careful reading, since it's where real money and trust are at stake.
