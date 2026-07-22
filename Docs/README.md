# Madrasty — Egyptian EdTech SaaS Platform — Project Documentation

This documentation set turns the original vision (`plan.md`) into a buildable technical plan for **Madrasty**, sized for a **solo/small-team build using Claude Code** (developing locally on Windows 11 + Docker Desktop + GitHub), with a clean path to production hosting.

## Document Index

| # | Document | Purpose |
|---|----------|---------|
| 1 | [01-HLD.md](./01-HLD.md) | High-Level Design — architecture, components, data flow |
| 2 | [02-repo-structure.md](./02-repo-structure.md) | Repository hierarchy (monorepo) |
| 3 | [03-database-schema.md](./03-database-schema.md) | Flexible/extensible PostgreSQL schema |
| 4 | [04-payments-integration.md](./04-payments-integration.md) | Multi-gateway payments (Paymob, Fawry, Vodafone Cash, InstaPay, cards) |
| 5 | [05-loyalty-points-coupons.md](./05-loyalty-points-coupons.md) | Points, coupons, loyalty tiers engine |
| 6 | [06-refunds-returns.md](./06-refunds-returns.md) | Refund/return policy + workflow for digital learning programs & sessions |
| 7 | [07-i18n-ui-ux.md](./07-i18n-ui-ux.md) | Arabic/English bilingual support + UI/UX principles |
| 8 | [08-claude-code-development-plan.md](./08-claude-code-development-plan.md) | How to build this with Claude Code: prompting, build order, CLAUDE.md rules, git workflow |
| 9 | [09-mvp-roadmap.md](./09-mvp-roadmap.md) | Phased roadmap, milestones, team, cost notes |
| 10 | [10-parent-teacher-student-engagement.md](./10-parent-teacher-student-engagement.md) | "Real school" workflow: exams/report cards, attendance, parent-teacher messaging, progress tracking |
| 11 | [11-parent-first-registration.md](./11-parent-first-registration.md) | Parent-first signup model, guardian verification levels, student-first approval flow |
| 12 | [12-teacher-content-workflow-learning-programs.md](./12-teacher-content-workflow-learning-programs.md) | Teacher content model: Learning Programs, Chapters, typed Lessons — replaces the flat "Course" concept |
| 13 | [13-home-tutoring.md](./13-home-tutoring.md) | In-person home tutoring marketplace: booking, escrow-style payout, ratings, safety |
| 14 | [14-windows-dev-environment-setup.md](./14-windows-dev-environment-setup.md) | One-time local dev setup on Windows 11: WSL2, Docker Desktop, Claude Code, GitHub |

## How to use this set

1. Read **01-HLD** first — it's the map everything else plugs into.
2. Read **11-parent-first-registration** right after — it defines the account model (parent-first, guardian verification) that every other module assumes, and it's literally the first thing a real user does.
3. Read **12-teacher-content-workflow-learning-programs** next — it defines the *product* itself (Learning Program → Chapters → typed Lessons), which doc 03's schema, doc 04's checkout, doc 05's coupons, and doc 06's refund rules all build on.
4. Use **02-repo-structure** the moment you scaffold the project — create the folders before writing code, so Claude Code generates code into the right place instead of one giant `index.js`.
5. **03-database-schema** is written to be "grow-without-migration-pain" — read the design notes before your first `CREATE TABLE`.
6. **04, 05, 06** are the three modules you specifically flagged (payments, loyalty, refunds) — each has its own schema additions, API contracts, and edge cases.
7. **07** applies to every screen you build — treat it as a checklist during code review, not a one-time setup step.
8. **08** is your day-to-day working method with Claude Code — prompting, build order, `CLAUDE.md` rules, and git workflow. Do **14** (one-time Windows/WSL2/Docker/Claude Code/GitHub setup) first to get your machine ready, then use **08** every session.
9. **09** tells you what to build first (MVP) vs. later (v2/v3), and roughly what it costs to run.
10. **10** layers the parent-teacher-student "real school" workflow (report cards, messaging, attendance) on top of the account model from doc 11 and the content model from doc 12.
11. **13** adds a distinct in-person product (Home Tutoring) alongside the virtual Learning Program/private-session model — read it once docs 03, 04, and 12 make sense, since it deliberately reuses some of their patterns (escrow payout, identity verification) while introducing its own tables.
12. **14** is the one-time environment setup (Windows 11 + WSL2 + Docker Desktop + Claude Code + GitHub). Do it before doc 08's workflow — 14 gets your machine ready, 08 is how you work once it is.

## Assumptions carried over from `plan.md`
- Platform name: **Madrasty**.
- Market: Egyptian K-9 (Primary + Preparatory), with Secondary/Thanaweya Amma as future expansion.
- Four user types: Student, Parent, Teacher, Admin (Educational Center added later as a B2B layer).
- Core loops: Learning Programs (recorded/live/pdf/quiz/homework/exam/private-session lessons — see doc 12), teacher marketplace, in-person Home Tutoring (doc 13), private tutoring, parent monitoring, AI tutor.
