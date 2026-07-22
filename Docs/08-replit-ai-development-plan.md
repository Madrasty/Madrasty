# Building This on Replit with Replit AI

> **Prefer building locally on Windows instead?** See [14-windows-dev-environment-setup.md](./14-windows-dev-environment-setup.md) for the WSL2 + Docker Desktop + Claude Code + GitHub path — same project, same docs, different build environment.

## 1. Project setup on Replit

1. Create a Replit **Node.js** repl (or import this repo structure from GitHub into Replit — recommended, since it gives you real git history that Replit AI can also read).
2. Set up **workspaces** matching doc 02 (`packages/server`, `packages/client`, `packages/shared`) — Replit AI/Agent works fine with monorepos as long as you tell it which package you're working in.
3. Configure `.replit` and secrets:
   - Use Replit's **Secrets** panel for `DATABASE_URL`, `PAYMOB_API_KEY`, `JWT_SECRET`, etc. — never commit these to files.
   - Provision Postgres via **Neon** or **Supabase** (free tiers) rather than trying to run Postgres inside the repl itself — Replit's ephemeral filesystem is not reliable for a real database.
4. Add `docs/` (this folder) to the repo root before you start prompting — Replit AI/Agent reads repo context, and having the HLD/schema/payments docs there means its generated code aligns with your architecture instead of inventing its own.

## 2. How to prompt Replit AI effectively for this project

**Do:**
- Reference the doc explicitly: *"Following docs/03-database-schema.md, create the Drizzle ORM schema for the `users`, `translations`, and `learning_programs` tables."*
- Work module by module, in the order of doc 09's roadmap — don't ask it to "build the whole platform" in one prompt.
- Ask it to generate one module (e.g., `payments/providers/paymob.provider.ts`) implementing the exact `PaymentProvider` interface from doc 04, rather than "add Paymob payments" vaguely.
- After each module, ask Replit AI to write a short test file, and run it before moving to the next module.
- Periodically ask it to "review packages/server/src/modules/payments for consistency with docs/04-payments-integration.md" — this catches drift.

**Avoid:**
- Giving it the entire `plan.md` + all 9 docs in one giant prompt and asking for a full app — this produces shallow, inconsistent scaffolding across modules.
- Letting it invent its own DB schema mid-project — always point back to doc 03 so tables stay consistent as new modules get added.
- Accepting payment-related code without manually reading it — this is the one area where a hallucinated detail (e.g., trusting a client-sent amount) is a real financial risk, not just a bug.

## 3. Suggested build order (maps to doc 09 roadmap)

1. Shared types + DB schema (`packages/shared`, `packages/server/db`) — get this right first, everything else depends on it.
2. Auth module (register/login/roles) + basic React shell with i18n wired up from day one (retrofitting i18n later is painful).
3. Learning Program catalog (CRUD + browsing) — no payments yet, just "free preview" mode.
4. Payments module — start with **one** provider (Paymob) fully working end-to-end (checkout → webhook → access granted) before adding more providers.
5. Loyalty/points/coupons — layer on top of a working payment flow, not before.
6. Homework/quizzes + AI Q&A (calling Claude/OpenAI API).
7. Live classes/tutoring booking (this is the most "external SDK heavy" module — budget extra time).
8. Admin dashboard + refunds workflow.
9. Polish: notifications, parent dashboard depth, performance, additional payment providers.

## 4. Testing on Replit
- Use Replit's built-in webview for manual testing of both `ar` and `en` locales every time you finish a UI feature — set this as a personal checklist habit, not an afterthought.
- For payment providers, use their **sandbox/test credentials** (Paymob, Fawry, etc. all provide sandbox modes) — never test with real money flows during development.
- Consider a lightweight CI step (GitHub Actions, since Replit can be linked to GitHub) that runs your test suite on every push, even before you have a large test suite — habit matters more than coverage at this stage.

## 5. Moving off Replit later
Because the codebase avoids Replit-specific APIs (plain Node/Express/React/Postgres), moving to Render/Railway/a VPS later is a config change: point `DATABASE_URL` at your production Postgres, set environment secrets on the new host, deploy the same repo. No architecture rewrite required — this is why doc 01 recommends Replit only as the *build* environment, with a clear exit path once you need guaranteed uptime/bandwidth for video streaming at scale.
