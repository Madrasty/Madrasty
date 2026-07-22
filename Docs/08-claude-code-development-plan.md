# Building This with Claude Code

> **Environment not set up yet?** Do [14-windows-dev-environment-setup.md](./14-windows-dev-environment-setup.md) first — it's the one-time install of WSL2, Docker Desktop, Claude Code, and GitHub. This doc assumes you can already run `claude` inside your project folder, and covers *how to actually develop the project with it* day to day.

## 1. How doc 08 and doc 14 divide up
- **Doc 14** = get your machine ready (install everything, scaffold the repo, first commit). You do it once.
- **Doc 08** (this doc) = the working method — how to prompt Claude Code, what order to build in, how to keep it from drifting off the architecture, how to test, and the git rhythm. You use it every session.

## 2. Give Claude Code the architecture up front

Claude Code reads your repo as context, so the single highest-leverage thing you can do is make this documentation set visible to it and pin the rules it should always follow.

1. Keep this whole `docs/` folder in the repo root (doc 14 already had you copy it in). Claude Code can read `docs/03-database-schema.md` etc. directly when you reference them.
2. Add a **`CLAUDE.md`** file at the repo root — Claude Code automatically loads it as standing context every session. Put the project's non-negotiable rules there so you don't have to repeat them in every prompt. A good starting `CLAUDE.md` for this project:

```markdown
# Madrasty — Project Rules for Claude Code

## Architecture source of truth
- Follow the docs in /docs. Before creating or changing a module, read the
  relevant doc (e.g. docs/04-payments-integration.md for payments).
- The DB schema is defined in docs/03-database-schema.md (+ docs 10-13 for
  feature-specific tables). Do NOT invent new tables or rename columns without
  updating that doc in the same change.

## Hard rules
- Monorepo: packages/shared, packages/server, packages/client (see docs/02).
- All shared types live in packages/shared and are imported by both sides —
  never duplicate a type definition.
- Payments: never trust a client-sent price/amount. Always recalculate
  server-side. Never grant access from a frontend redirect — only from a
  verified webhook (docs/04).
- Money & points are append-only ledgers, never in-place balance updates
  (docs/03, docs/05).
- Every user-facing string goes through i18n (ar/en). No hardcoded Arabic or
  English in components (docs/07).
- Minors never hold a self-sufficient account; content endpoints must check
  the student is active AND approved by a guardian (docs/11).

## Workflow
- Work one module at a time. Ask before scaffolding more than one module.
- After each module, add a short test and run it before moving on.
- Use TypeScript everywhere. Prefer editing existing files over regenerating them.
```

Update `CLAUDE.md` as the project grows — it's the cheapest way to stop repeating yourself and to keep a long series of sessions consistent.

## 3. How to prompt Claude Code effectively

**Do:**
- Reference the doc explicitly: *"Following docs/03-database-schema.md, create the Drizzle ORM schema for the `users`, `translations`, and `learning_programs` tables."* Claude Code will open and read that file.
- Work **module by module**, in the order of §5 below — don't ask it to "build the whole platform" in one prompt.
- Use **plan mode / ask-before-acting** for anything non-trivial: have Claude Code lay out *what* it intends to change across which files, read the plan, then let it execute. Cheaper to correct a plan than to unwind a bad multi-file change.
- Ask for one concrete unit at a time (e.g., `payments/providers/paymob.provider.ts` implementing the exact `PaymentProvider` interface from doc 04), not "add Paymob payments" vaguely.
- Let Claude Code **run things itself** — it can run `docker compose up -d`, run migrations, run the test suite, and read the errors back. This is the big advantage over a chat window: it closes the write→run→read-error→fix loop without you copy-pasting. Let it.
- Periodically ask it to *"review packages/server/src/modules/payments for consistency with docs/04-payments-integration.md"* — this catches drift before it compounds.
- Commit at every working checkpoint (see §6) so you always have a clean point to `git reset` back to if a session goes sideways.

**Avoid:**
- Dumping `plan.md` + all docs in one giant prompt and asking for a full app — this produces shallow, inconsistent scaffolding.
- Letting it invent its own DB schema mid-project — always point back to doc 03 so tables stay consistent as new features get added.
- Accepting payment/refund/auth code without reading it yourself — these are the areas where a plausible-looking hallucination (trusting a client amount, skipping a webhook signature check) is a real financial or security risk, not just a bug. Claude Code makes it easy to move fast here; slow down on these three modules specifically.
- Letting one session run for hours across many modules — context gets muddy. Prefer focused sessions per module/feature, each ending in a commit.

## 4. Local run loop

Because you're developing locally (doc 14), your inner loop is:
```
docker compose up -d          # Postgres + Redis running locally
claude                        # start a session
# ... prompt Claude Code to build/modify a module ...
# Claude Code runs migrations + tests itself and reports results
# you review the diff, then commit
```
Claude Code can start the dev servers (`npm run dev` in server/client), hit the API, and read logs — so "does this actually work" is answered inside the session, not after it.

## 5. Suggested build order (maps to doc 09 roadmap)

1. **Shared types + DB schema** (`packages/shared`, `packages/server/db`) — get this right first; everything depends on it.
2. **Auth + parent-first registration** (docs 11) + basic React shell with **i18n wired up from day one** (retrofitting i18n later is painful). Both registration flows (parent-first, student-first-with-approval) before anything else, since every later feature assumes a student is `pending_approval` or `active` under a guardian.
3. **Learning Program catalog** (docs 12: programs → chapters → typed lessons) — no payments yet, just free-preview mode.
4. **Payments** — start with **one** provider (Paymob) fully working end-to-end (checkout → webhook → access granted) before adding Fawry/Vodafone Cash/InstaPay behind the same interface (doc 04).
5. **Loyalty / points / coupons** — layer on top of a working payment flow, not before (doc 05).
6. **Parent–teacher–student engagement** (doc 10: exams/report cards, messaging, attendance, progress snapshots).
7. **Homework/quizzes + AI Q&A** (calling the Claude API — see doc 03's stack note).
8. **Live classes / virtual tutoring booking** (external video SDK — budget extra time).
9. **Home Tutoring** (doc 13: booking + escrow-style payout — new payment logic, test carefully).
10. **Admin dashboard + refunds workflow** (doc 06).
11. **Polish**: notifications, parent-dashboard depth, performance, remaining payment providers.

## 6. Git workflow with Claude Code

A feature branch per module keeps Claude Code's changes reviewable:
```bash
git checkout -b feature/payments-paymob
claude          # build the module with Claude Code
# review the diff (VS Code's Claude Code extension shows inline diffs, or `git diff`)
git add . && git commit -m "Add Paymob provider end-to-end (doc 04)"
git push -u origin feature/payments-paymob
# open a PR on GitHub, review, merge to main
```
Commit at each working checkpoint *within* a feature too — if a follow-up prompt makes things worse, `git reset --hard HEAD` gets you back to the last good state instantly. Treat commits as save points, not just history.

## 7. Testing
- **Both locales, every UI feature**: manually check `ar` (RTL) and `en` (LTR) each time you finish a screen — make it a habit, not an afterthought (doc 07).
- **Payment providers**: use each gateway's **sandbox/test credentials** (Paymob, Fawry, etc. all provide sandbox modes) — never test with real money during development.
- **CI**: add a GitHub Actions workflow that runs the test suite on every push/PR early, even before coverage is high — the habit matters more than the coverage at this stage, and Claude Code can write the workflow file for you.
- Let Claude Code write and run tests as part of each module (it's in the `CLAUDE.md` rules above) — the point is that it can actually execute them and fix failures in the same session.

## 8. Deployment (no rewrite needed)
The codebase is a standard Node/Express/React/Postgres app with no tool-specific APIs, so going to production is a config change, not a port: point `DATABASE_URL` at a managed Postgres (Neon/Supabase), set your secrets on the host, and deploy the same repo to Render, Railway, or a VPS. See doc 01 §6 for the deployment model and doc 09 for when in the roadmap to do it.
