# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state of the repo

This repo is **documentation-first and not yet scaffolded**. As of now it contains:
- `Docs/` — the full technical design set (14 numbered docs + README). This is the source of truth.
- `FrontEnd Design/` — design assets (gitignored).
- `docker-compose.yml`, `.env.example`, `.gitignore` — local dev infra.

The application code (`packages/server`, `packages/client`, `packages/shared`) described in the docs **does not exist yet**. When asked to build a feature, you are scaffolding it for the first time following the docs — not modifying existing modules. Build order matters (see below).

## Architecture source of truth

**Always read the relevant doc before creating or changing a module.** The `Docs/` folder is the design authority, not a suggestion:
- `Docs/01-HLD.md` — architecture, tech stack, deployment model, security baseline.
- `Docs/02-repo-structure.md` — the monorepo layout to scaffold into.
- `Docs/03-database-schema.md` — DB schema and its design principles. **Do not invent tables or rename columns without updating this doc in the same change.** Feature-specific tables live in docs 10–13 (they are the source of truth for their own tables; doc 03 links out to them rather than duplicating).
- `Docs/04-payments-integration.md` — payment abstraction, checkout flow, webhook rules.
- `Docs/05` loyalty/points/coupons · `Docs/06` refunds · `Docs/07` i18n · `Docs/10` engagement · `Docs/11` registration/consent · `Docs/12` learning programs · `Docs/13` home tutoring.
- `Docs/08-claude-code-development-plan.md` — the working method; `Docs/09-mvp-roadmap.md` — phased roadmap; `Docs/14` — Windows/WSL2 local setup.

## System architecture (the big picture)

**Modular monolith**, not microservices — one deployable Node/Express app, one Postgres DB, organized internally into clearly separated modules (`packages/server/src/modules/*`) that could be split into services later. A React (Vite) + TypeScript SPA talks to it over REST (+WebSockets for live/chat).

**Monorepo with a shared type contract.** `packages/shared` holds TypeScript types, constants, and validation schemas imported by **both** client and server. This is what prevents "API returns `points_balance` but frontend expects `pointsBalance`" bugs — never duplicate a type definition across the two sides.

**Payments go through an abstraction, never a gateway directly.** Every provider (`paymob`, `fawry`, `vodafone-cash`, `instapay`, `stripe`) implements the same `PaymentProvider` interface in `payments/providers/`. `payment.service.ts` selects a provider by name and contains no gateway-specific code. Adding a gateway is a new provider class + a new value in `transactions.payment_provider` — zero schema change, nothing else in the codebase imports a gateway SDK.

**Loyalty rules are data-driven, not hardcoded.** `loyalty/rules-engine/` is deliberately separated from `points.service.ts` so *how* points are earned (e.g. "1 pt / 10 EGP" vs "2x during Ramadan") is config, not `if` branches — the loyalty program evolves without redeploys.

### Schema design principles (from doc 03 — these shape everything)

- **Ledger pattern for anything financial or point-based.** `transactions`, `refunds`, `points_ledger`, `coupon_redemptions` are **append-only**. Never mutate a balance in place — insert an event row and compute balance as `SUM(delta)`. Full audit trail for free, refunds/disputes stay traceable.
- **Locale-aware content via a `translations` table** (`entity_type, entity_id, locale, field, value`), *not* `name_ar`/`name_en` columns. Adding a language = inserting rows, zero schema change.
- **`metadata JSONB`** on core tables absorbs optional/evolving fields without a migration. Use real columns + indexes only for anything queried/filtered heavily.
- **UUID primary keys**, **soft deletes** (`deleted_at`), and per-lesson-type detail tables (a new lesson type = one new table, never a rewrite of `lessons`).

### Content model

The sellable unit is a **Learning Program** → **Chapters** → typed **Lessons** (`recorded`/`live`/`pdf`/`audio`/`quiz`/`homework`/`exam`/`private_session`). This replaced an older flat "courses" model — doc 12 is the source of truth. `quiz`/`homework`/`exam`/`private_session` lesson types reuse the `quizzes`/`homework_submissions`/`exams`/`tutoring_slots`+`bookings` tables, joined via `lesson_id`.

## Non-negotiable rules

These are correctness/security/legal invariants, not style preferences:

- **Never trust a client-sent price or amount.** Always recalculate server-side at checkout (doc 04 §3).
- **Never grant program/session access from a frontend redirect.** Access is granted only from a signature/HMAC-verified webhook or a server-side status check (doc 04 §3, §7). This is the #1 fraud vector in DIY payment integrations.
- **Webhook handlers must be idempotent** — safe to receive the same event twice (check `provider_reference` uniqueness before applying effects). No card data ever touches the server (hosted iframe/redirect only).
- **Minors never hold a self-sufficient account.** Every student profile resolves to a verified guardian. Content-access checks must confirm the student is `active` **AND** `parent_children.approved_at IS NOT NULL` — not merely that a session token is valid (doc 01 §7, doc 11).
- **Every user-facing string goes through i18n (ar/en), RTL/LTR aware.** No hardcoded Arabic or English in components (doc 07). Wire i18n in from day one — retrofitting is painful.
- **Home Tutoring uses escrow payout.** Payment is captured but held (`payout_status = 'held'`) until the in-person session is marked `completed`, then released minus commission. This is a distinct field from `transactions.status` — do not infer "pay the teacher yet?" from payment status alone (doc 04 §6, doc 13).
- **RBAC is enforced at the API layer**, not just the UI. Rate-limit auth and payment/checkout endpoints.
- **Never hardcode environment-specific values** — URLs, ports, hostnames, secrets, API keys, or the like. Read them from environment variables via a typed config module, so moving to production is a config change, not a code change. `localhost`, `:5432`, real domains, and provider keys must never appear as literals in the source.

Read payment, refund, and auth code yourself before accepting it — these are where a plausible-looking hallucination (trusting a client amount, skipping a webhook signature check) is a financial/security risk, not just a bug.

## Build order (do not build the whole platform at once)

Work **one module at a time**, in roadmap order (doc 09 / doc 08 §5). Ask before scaffolding more than one module. Sequence:
1. Shared types + DB schema (`packages/shared`, `packages/server/db`) — everything depends on this, get it right first.
2. Auth + parent-first registration (**both** Flow A parent-first and Flow B student-self-register-with-guardian-approval) + React shell with i18n wired in.
3. Learning Program catalog (free-preview, no payments yet).
4. Payments — get **one** provider (Paymob) working end-to-end (checkout → webhook → access) before adding others behind the interface.
5. Loyalty/points/coupons → 6. Engagement (report cards/messaging/attendance) → 7. Homework/quizzes + AI Q&A → 8. Live classes → 9. Home Tutoring (escrow) → 10. Admin + refunds → 11. Polish.

## Commands

Infra (Postgres 16 + Redis 7 for local dev):

```bash
docker compose up -d      # start postgres + redis
docker compose ps         # check status
docker compose down       # stop (keeps the pgdata volume)
docker compose down -v    # stop and wipe the database
```

Env: copy `.env.example` → `.env` and fill in values as each integration is built. `POSTGRES_*` in `.env` feed both docker-compose and `DATABASE_URL` — keep them in sync. Client-side code only sees `VITE_`-prefixed vars (Vite convention) — keep `VITE_API_BASE_URL`/`VITE_DEFAULT_LOCALE`/`VITE_SUPPORTED_LOCALES` in sync with their non-prefixed server-side counterparts.

App-level commands (npm workspaces, root `package.json`):

```bash
npm install               # install all workspaces (root, shared, server, client)
npm run dev:server        # server on API_BASE_URL's port (tsx watch)
npm run dev:client        # client on http://localhost:5173 (Vite)
npm run build             # build every workspace that has a build script
npm run test              # run every workspace's test suite (vitest)
npm run typecheck         # typecheck every workspace (tsc -b --noEmit)
```

Per-workspace, run from that package's directory or via `--workspace @madrasty/<name>`. `@madrasty/server` also has `db:generate` / `db:migrate` / `db:push` / `db:studio` (Drizzle). Both `server` and `client` support `npm run test:watch` and running a single test file via `vitest run <path>` / `vitest <path>`.

Stack in place: Node + Express + TypeScript (server, Drizzle migrations), React + Vite + TypeScript + Tailwind v4 + react-i18next (client). BullMQ for background jobs is planned but not wired in yet.

## Conventions

- **TypeScript everywhere.** Prefer editing existing files over regenerating them.
- **Feature branch per module** (`feature/payments-paymob`), commit at each working checkpoint as a save point. Add a short test per module and run it before moving on.
- **Test both locales** (`ar` RTL and `en` LTR) for every UI feature. Use each gateway's **sandbox credentials** for payments — never real money in dev.
- **Deployment is a config change, not a rewrite** — the app is standard Node/Express/React/Postgres with no host-specific APIs. Production = point `DATABASE_URL`/`REDIS_URL` at managed providers and set secrets (doc 01 §6).
