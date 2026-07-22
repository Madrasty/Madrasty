# Repository Hierarchy

A monorepo keeps frontend/backend/shared types in sync easily — and it works well with Claude Code, which reads related client/server/shared code as one workspace when generating changes.

```
edtech-saas/
├── README.md
├── CLAUDE.md                        # standing rules Claude Code loads every session (see doc 08)
├── package.json                     # root workspace config (npm/pnpm workspaces)
├── .env.example
├── .gitignore                       # must include .env
├── docker-compose.yml               # local dev: postgres + redis (see doc 14)
│
├── docs/                            # this documentation set lives here
│   ├── 01-HLD.md
│   ├── 02-repo-structure.md
│   ├── 03-database-schema.md
│   ├── 04-payments-integration.md
│   ├── 05-loyalty-points-coupons.md
│   ├── 06-refunds-returns.md
│   ├── 07-i18n-ui-ux.md
│   ├── 08-claude-code-development-plan.md
│   ├── 09-mvp-roadmap.md
│   ├── ... (10-14)
│   └── README.md
│
├── packages/
│   ├── shared/                      # code shared by client & server
│   │   ├── types/                   # TypeScript interfaces (User, LearningProgram, Payment, ...)
│   │   ├── constants/                # roles, currencies, locales, error codes
│   │   └── validation/               # zod/yup schemas shared client+server
│   │
│   ├── server/
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   │   ├── auth.routes.ts
│   │   │   │   │   ├── auth.controller.ts
│   │   │   │   │   ├── auth.service.ts
│   │   │   │   │   ├── auth.repository.ts
│   │   │   │   │   ├── otp/                   # doc 11 — SMS/email OTP verification
│   │   │   │   │   ├── guardian-approval/      # doc 11 — student-first signup approval flow
│   │   │   │   │   └── identity-verification/ # doc 11 — Level 2, phase 2
│   │   │   │   ├── users/
│   │   │   │   ├── learning-programs/          # replaces old "courses" module — see doc 12
│   │   │   │   │   ├── programs.service.ts
│   │   │   │   │   ├── chapters.service.ts
│   │   │   │   │   ├── lessons.service.ts
│   │   │   │   │   └── lesson-types/
│   │   │   │   │       ├── recorded.handler.ts
│   │   │   │   │       ├── live.handler.ts
│   │   │   │   │       ├── pdf.handler.ts
│   │   │   │   │       ├── audio.handler.ts
│   │   │   │   │       ├── quiz.handler.ts
│   │   │   │   │       ├── homework.handler.ts
│   │   │   │   │       ├── exam.handler.ts
│   │   │   │   │       └── private-session.handler.ts
│   │   │   │   ├── quizzes/
│   │   │   │   ├── homework/
│   │   │   │   ├── live-sessions/
│   │   │   │   ├── tutoring-booking/
│   │   │   │   ├── home-tutoring/                # doc 13 — in-person tutoring marketplace
│   │   │   │   │   ├── teacher-availability.service.ts
│   │   │   │   │   ├── booking.service.ts
│   │   │   │   │   ├── payout.service.ts          # escrow hold/release
│   │   │   │   │   └── ratings.service.ts
│   │   │   │   ├── payments/
│   │   │   │   │   ├── providers/
│   │   │   │   │   │   ├── paymob.provider.ts
│   │   │   │   │   │   ├── fawry.provider.ts
│   │   │   │   │   │   ├── vodafone-cash.provider.ts
│   │   │   │   │   │   ├── instapay.provider.ts
│   │   │   │   │   │   └── stripe.provider.ts
│   │   │   │   │   ├── payment.interface.ts   # common PaymentProvider contract
│   │   │   │   │   ├── payment.service.ts
│   │   │   │   │   ├── refunds/
│   │   │   │   │   └── webhooks/
│   │   │   │   ├── loyalty/
│   │   │   │   │   ├── points.service.ts
│   │   │   │   │   ├── coupons.service.ts
│   │   │   │   │   ├── tiers.service.ts
│   │   │   │   │   └── rules-engine/          # pluggable earn/redeem rules
│   │   │   │   ├── academic-records/          # exams, exam_results, progress_snapshots (doc 10)
│   │   │   │   ├── attendance/                 # doc 10
│   │   │   │   ├── messaging/                  # parent-teacher conversations (doc 10)
│   │   │   │   ├── notifications/
│   │   │   │   ├── ai-services/
│   │   │   │   │   ├── ai-tutor.service.ts
│   │   │   │   │   ├── ai-quiz-generator.service.ts
│   │   │   │   │   └── ai-homework-grader.service.ts
│   │   │   │   └── admin/
│   │   │   ├── middleware/
│   │   │   │   ├── auth.middleware.ts
│   │   │   │   ├── i18n.middleware.ts
│   │   │   │   ├── rate-limit.middleware.ts
│   │   │   │   └── error-handler.middleware.ts
│   │   │   ├── db/
│   │   │   │   ├── migrations/               # e.g. via Drizzle/Prisma/Knex
│   │   │   │   ├── seeds/
│   │   │   │   └── client.ts
│   │   │   ├── jobs/                          # background jobs (BullMQ)
│   │   │   ├── config/
│   │   │   └── app.ts / server.ts
│   │   ├── tests/
│   │   └── package.json
│   │
│   └── client/
│       ├── src/
│       │   ├── app/                          # routing, providers
│       │   ├── locales/
│       │   │   ├── ar/
│       │   │   └── en/
│       │   ├── features/
│       │   │   ├── auth/
│       │   │   │   ├── parent-register/           # doc 11 — Flow A
│       │   │   │   ├── add-student/                # doc 11
│       │   │   │   ├── student-self-register/       # doc 11 — Flow B
│       │   │   │   └── guardian-approval-landing/   # doc 11 — the SMS link destination
│       │   │   ├── student-dashboard/
│       │   │   ├── parent-dashboard/
│       │   │   ├── teacher-dashboard/
│       │   │   ├── admin-dashboard/
│       │   │   ├── checkout/                 # payment method selection UI
│       │   │   ├── loyalty/                  # points/coupons/tier UI
│       │   │   ├── live-classes/
│       │   │   ├── home-tutoring/            # doc 13
│       │   │   │   ├── teacher-search/
│       │   │   │   ├── booking-flow/
│       │   │   │   ├── session-tracker/
│       │   │   │   └── ratings/
│       │   │   ├── report-card/              # doc 10 — parent/student exam & progress view
│       │   │   └── teacher-inbox/            # doc 10 — parent-teacher messaging
│       │   ├── components/                   # shared UI (buttons, cards, RTL-safe layout)
│       │   ├── hooks/
│       │   ├── lib/                           # api client, i18n setup
│       │   └── styles/
│       ├── public/
│       └── package.json
│
└── scripts/
    ├── seed-curriculum.ts
    └── generate-openapi.ts
```

## Notes on this structure
- **`packages/shared`** is what prevents "the API returns `points_balance` but the frontend expects `pointsBalance`" bugs — one source of truth for types.
- **`payments/providers/`** is the single place you touch when adding a new gateway; nothing else in the codebase should import a gateway SDK directly.
- **`loyalty/rules-engine/`** is deliberately separated from `points.service.ts` so that *how* points are earned (e.g., "1 point per 10 EGP spent" vs "2x points during Ramadan campaign") is configuration/data-driven, not hardcoded conditionals — this is what lets you evolve the loyalty program without redeploying.
- Keep **`docs/`** inside the repo (not just local files) — Claude Code reads your own architecture docs as context, so having them in-repo (plus a `CLAUDE.md`, doc 08) keeps its generated code aligned with your design instead of inventing its own.
