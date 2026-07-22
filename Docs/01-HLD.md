# High-Level Design (HLD)

## 1. Goals & Non-Goals

**Goals**
- Single web platform serving Students, Parents, Teachers, Admin (Educational Centers later).
- Bilingual (Arabic/English) from day one, RTL/LTR aware.
- Multiple local + international payment methods.
- Points / coupons / loyalty system that can evolve without schema rewrites.
- Buildable incrementally with Claude Code on a local machine (see doc 08/14), deployable to a real production host without a rewrite.

**Non-Goals (for MVP)**
- Native mobile apps (web-responsive first; PWA later).
- Full AI-tutor with fine-tuned models (start with prompt-based AI over Claude/OpenAI API + your curriculum content as context).
- Multi-country expansion (single-country, Egypt-only, at MVP).

## 2. Architecture Style

**Modular monolith**, not microservices. Reasoning: a solo/small team benefits from one deployable unit, one database, simple debugging — but the *internal* code is organized into clearly separated modules (auth, learning-programs, payments, loyalty, live-classes, etc.) so it can be split into services later if you scale past a few hundred thousand users.

```
                        ┌─────────────────────────┐
                        │        Client            │
                        │  React SPA (Vite)        │
                        │  i18n: ar / en, RTL/LTR   │
                        └────────────┬─────────────┘
                                     │ HTTPS / REST (+WS for live/chat)
                        ┌────────────▼─────────────┐
                        │     API Gateway Layer     │
                        │  Express.js + middleware  │
                        │  (auth, rate-limit, i18n) │
                        └────────────┬─────────────┘
        ┌──────────────┬────────────┼───────────────┬──────────────┬──────────────┐
        ▼              ▼            ▼               ▼              ▼              ▼
 ┌───────────┐  ┌────────────┐ ┌───────────┐ ┌─────────────┐ ┌───────────┐ ┌────────────┐
 │  Users &  │  │  Catalog & │ │ Payments  │ │  Loyalty /  │ │  Live &   │ │   Home     │
 │  Auth     │  │  Learning  │ │  Module   │ │  Points /   │ │  Sessions │ │  Tutoring  │
 │  Module   │  │  Programs  │ │           │ │  Coupons    │ │  Module   │ │  Module    │
 └─────┬─────┘  └─────┬──────┘ └─────┬─────┘ └──────┬──────┘ └─────┬─────┘ └─────┬──────┘
       │              │              │              │              │             │
       └──────────────┴──────────────┴──────────────┴──────────────┴─────────────┘
                                     │
                        ┌────────────▼─────────────┐
                        │   PostgreSQL (primary)    │
                        │   + Redis (cache/queue)   │
                        └────────────┬─────────────┘
                                     │
                ┌────────────────────┼────────────────────┐
                ▼                    ▼                    ▼
        ┌───────────────┐   ┌───────────────┐    ┌────────────────┐
        │  Object Store  │   │  Payment      │    │  AI Provider    │
        │  (video/files) │   │  Gateways     │    │  (Claude/OpenAI)│
        │  S3-compatible │   │  Paymob/Fawry │    │  API            │
        └───────────────┘   │  Vodafone Cash│    └────────────────┘
                             │  InstaPay     │
                             └───────────────┘
```

## 3. Core Modules

| Module | Responsibility |
|---|---|
| **Users & Auth** | Parent-first registration (parent is the root/billing account, students are managed sub-profiles), OTP verification, guardian-approval flow for student-initiated signups, tiered identity verification, teacher verification workflow — see doc 11 |
| **Catalog & Learning Programs** | Subjects, grades (curriculum tree), learning programs, chapters, typed lessons (recorded/live/pdf/audio/quiz/homework/exam/private-session), video metadata — see doc 12 |
| **Live & Sessions** | Live class scheduling, virtual private tutoring booking, calendar, attendance |
| **Home Tutoring** | In-person tutoring marketplace: teacher discovery/service areas, home-visit booking, escrow-style payout, ratings — see doc 13 |
| **Payments** | Gateway abstraction layer, transactions, invoices, subscriptions, refunds |
| **Loyalty/Points/Coupons** | Points ledger, coupon engine, tier calculation, redemption rules |
| **Notifications** | Email/SMS/push/WhatsApp for homework reminders, payment receipts, parent alerts |
| **Academic Records & Engagement** | Exams/report cards, attendance, progress snapshots, parent–teacher messaging — see doc 10 |
| **Admin/Ops** | Teacher verification, learning program approval, revenue dashboards, fraud flags, refund approvals |
| **AI Services** | AI Q&A, AI quiz generation, homework auto-correction (via LLM API calls, not self-hosted models) |

## 4. Key Cross-Cutting Concerns

- **i18n**: every user-facing string routed through a translation layer (see doc 07); every DB text field that's user-authored (not curriculum-fixed) needs a `locale` column or JSON-per-locale field — detailed in doc 03.
- **Payments abstraction**: no business logic should call "Paymob" directly — it calls a `PaymentProvider` interface, so adding/removing a gateway doesn't touch checkout logic (doc 04).
- **Extensibility**: the `metadata JSONB` pattern is used throughout the DB precisely so you can add new lesson types, new reward rules, or new payment methods without an ALTER TABLE (doc 03, doc 12).
- **Auditability**: every points/coupon/payment/refund event is append-only (ledger pattern), never UPDATE-in-place, so financial and loyalty history is always reconstructable.

## 5. Suggested Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React (Vite) + TypeScript, TailwindCSS, react-i18next | Matches your existing Madrasty stack; fast local dev with Vite |
| Backend | Node.js + Express + TypeScript | Same language across stack; you already know it |
| DB | PostgreSQL — local via Docker for dev (doc 14), managed (Neon or Supabase) for production | Relational integrity for payments/loyalty; JSONB gives NoSQL-style flexibility where needed |
| Cache/Queue | Redis — local via Docker for dev; Upstash or managed Redis for production | Session cache, rate limiting, background job queue (e.g., BullMQ) |
| Object storage | Cloudflare R2 or AWS S3 | Video/file storage (local disk / Docker volumes are not for durable video at scale) |
| Video | Bunny.net Stream or Mux (pay-as-you-go) | Actual video hosting/streaming/DRM — don't self-host video encoding |
| Payments | Paymob, Fawry, Vodafone Cash, InstaPay + Stripe (future international) | Local coverage + future-proofing |
| Auth | JWT + refresh tokens, bcrypt/argon2 password hashing | Standard, framework-agnostic |
| Realtime (live classes) | Agora.io or 100ms (video SDK), Socket.io (chat/notifications) | Don't build WebRTC from scratch |
| Hosting (production) | Render, Railway, or a VPS + managed Postgres | Deploy the same repo built locally; no code changes needed to go live |

## 6. Deployment Model

- **Phase 1 (Local development)**: Everything runs on your machine — app via Node/Vite, Postgres + Redis via Docker Desktop (doc 14). Built with Claude Code (doc 08).
- **Phase 2 (Beta/Soft launch)**: Move Postgres/Redis to managed providers (Neon/Supabase, Upstash) and deploy the app to Render/Railway (or a VPS) with a real domain. This is a config/secrets change, not a code change.
- **Phase 3 (Production/Scale)**: Same host or migrate to a VPS/managed platform as traffic and video bandwidth grow. Because the codebase is a standard Node/React app with no tool-specific APIs, scaling up is infrastructure work, not a rewrite.

## 7. Security Baseline
- HTTPS everywhere, HSTS.
- Role-based access control (RBAC) checked at API layer, not just UI.
- Payment webhooks verified via signature/HMAC before trusting any "payment succeeded" event.
- PII (parent/student data) encrypted at rest where the DB provider supports it; minimal PII collected from children (COPPA-style caution even though Egypt-specific law differs).
- **Minors never hold a self-sufficient account** — every student profile resolves to a verified parent/guardian, and every content-access check must confirm `parent_children.approved_at IS NOT NULL`, not just that a session token is valid. See doc 11 for the full registration/consent model.
- Rate limiting on auth and payment endpoints.
