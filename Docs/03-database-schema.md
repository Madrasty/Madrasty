# Database Schema — Flexible, Upgrade-Friendly Design

## Design Principles

1. **JSONB "metadata" columns** on core tables (users, learning_programs, transactions) absorb new attributes without a migration — use this for optional/evolving fields, not for anything you'll need to query/filter heavily (those get real columns + indexes).
2. **Ledger pattern for anything financial or point-based** — never mutate a balance in place; insert an event row and compute balance as a sum/view. This gives you a full audit trail for free and makes refunds/disputes traceable.
3. **Locale-aware content via a companion translations table**, not `name_ar`/`name_en` columns — this scales to adding a 3rd language later without touching schema again.
4. **Soft deletes** (`deleted_at`) on user-facing entities instead of hard deletes, so refunds/disputes/audits remain possible.
5. **UUID primary keys** (not auto-increment ints) — safer for public IDs in URLs, easier to merge data later if you ever split services.

---

## Core Tables (abbreviated — types simplified for readability)

### users
```sql
users (
  id UUID PK,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  password_hash TEXT,
  role TEXT CHECK (role IN ('student','parent','teacher','admin','center_admin')),
  locale_preference TEXT DEFAULT 'ar',   -- 'ar' | 'en'
  status TEXT DEFAULT 'active',          -- active | suspended | pending_verification
  verification_level INT DEFAULT 1,      -- 1|2|3|4 — see doc 11
  phone_verified_at TIMESTAMPTZ NULL,
  email_verified_at TIMESTAMPTZ NULL,
  metadata JSONB DEFAULT '{}',           -- flexible extra attributes
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ NULL
)
```

### student_profiles / teacher_profiles / parent_children
```sql
student_profiles (
  user_id UUID PK REFERENCES users,
  grade_level TEXT,             -- e.g. 'primary_4', 'prep_2'
  school_name TEXT,
  status TEXT DEFAULT 'pending_approval',  -- pending_approval | active | suspended — see doc 11
  metadata JSONB
)

teacher_profiles (
  user_id UUID PK REFERENCES users,
  bio JSONB,                    -- { "ar": "...", "en": "..." }
  verification_status TEXT DEFAULT 'pending',  -- pending|verified|rejected
  verification_docs JSONB,
  payout_details JSONB,         -- bank/wallet info for earnings payout
  commission_rate NUMERIC DEFAULT 0.20,
  metadata JSONB
)

parent_children (
  parent_id UUID REFERENCES users,
  student_id UUID REFERENCES users,
  relationship TEXT DEFAULT 'guardian',   -- father | mother | guardian | other — see doc 11
  is_primary BOOLEAN DEFAULT true,        -- for two-guardian cases, see doc 11 §7
  approved_at TIMESTAMPTZ NULL,           -- null until guardian approval completes
  PRIMARY KEY (parent_id, student_id)
)
```

> **Registration/consent tables** (`otp_verifications`, `guardian_approval_requests`, `identity_verifications`, `school_verifications`) are defined in full in [11-parent-first-registration.md](./11-parent-first-registration.md) rather than here, since they're a self-contained onboarding feature — treat doc 11 as the source of truth for those tables and for the `users`/`parent_children` columns marked above.

### curriculum / learning programs (translatable content pattern)

> **Superseded model:** this used to be a flat `courses`/`lessons` pair. It's now the **Learning Program** model — a program is the sellable unit, made of chapters, made of typed lessons (recorded/live/pdf/audio/quiz/homework/exam/private_session). Full rationale, lesson-type table and teacher/student workflows are in [12-teacher-content-workflow-learning-programs.md](./12-teacher-content-workflow-learning-programs.md) — this section is kept in sync with that doc as the schema's source of truth for the tables themselves.

```sql
subjects (
  id UUID PK,
  grade_level TEXT,
  slug TEXT UNIQUE,
  metadata JSONB
)

translations (
  entity_type TEXT,      -- 'subject' | 'learning_program' | 'chapter' | 'lesson' | 'coupon' ...
  entity_id UUID,
  locale TEXT,           -- 'ar' | 'en'
  field TEXT,            -- 'title' | 'description' ...
  value TEXT,
  PRIMARY KEY (entity_type, entity_id, locale, field)
)

learning_programs (
  id UUID PK,
  teacher_id UUID REFERENCES users,
  subject_id UUID REFERENCES subjects,
  grade_level TEXT,
  semester TEXT,
  price_egp NUMERIC,
  status TEXT DEFAULT 'draft',   -- draft|pending_review|published|archived
  metadata JSONB,                -- e.g. { "difficulty": "medium", "tags": [...] }
  created_at TIMESTAMPTZ
)

chapters (
  id UUID PK,
  program_id UUID REFERENCES learning_programs,
  order_index INT,
  metadata JSONB
)

lessons (
  id UUID PK,
  chapter_id UUID REFERENCES chapters,
  order_index INT,
  lesson_type TEXT CHECK (lesson_type IN
     ('recorded','live','pdf','audio','quiz','homework','exam','private_session')),
  status TEXT DEFAULT 'draft',        -- draft|scheduled|published|archived
  visibility TEXT DEFAULT 'paid',     -- free|paid|locked|prerequisite|invite_only
  prerequisite_lesson_id UUID REFERENCES lessons NULL,
  metadata JSONB
)

-- One detail table per lesson type that needs structured fields beyond metadata JSONB
-- (recorded_lesson_details, live_lesson_details, pdf_lesson_details, audio_lesson_details)
-- — full definitions in doc 12 §6. quiz/homework/exam/private_session types reuse
-- the quizzes / homework_submissions / exams / tutoring_slots+bookings tables already
-- in this schema, joined via lesson_id.
```
*(`translations` table means "add French next year" costs zero schema changes. `lesson_type` + per-type detail tables means "add a new lesson type" costs one new table, never a rewrite of `lessons`.)*

### quizzes / homework
```sql
quizzes (
  id UUID PK,
  lesson_id UUID REFERENCES lessons NULL,
  program_id UUID REFERENCES learning_programs NULL,
  generated_by TEXT DEFAULT 'teacher',  -- teacher|ai
  metadata JSONB          -- question set can live here OR in a normalized quiz_questions table
)

homework_submissions (
  id UUID PK,
  student_id UUID REFERENCES users,
  assignment_id UUID,
  status TEXT,             -- submitted|graded|late
  grade NUMERIC NULL,
  graded_by TEXT,          -- 'teacher' | 'ai'
  metadata JSONB
)
```

### live sessions / private tutoring booking
```sql
tutoring_slots (
  id UUID PK,
  teacher_id UUID REFERENCES users,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  price_egp NUMERIC,
  status TEXT DEFAULT 'open'   -- open|booked|cancelled|completed
)

bookings (
  id UUID PK,
  slot_id UUID REFERENCES tutoring_slots,
  student_id UUID REFERENCES users,
  transaction_id UUID REFERENCES transactions,
  status TEXT DEFAULT 'confirmed'  -- confirmed|cancelled|refunded|no_show
)
```

> **Home Tutoring (in-person visits)** is a related but distinct product from the virtual booking above — it has its own tables (`saved_addresses`, `teacher_service_areas`, `home_tutoring_bookings`, `session_ratings`) with location, travel-fee, and escrow-payout fields that don't belong on the virtual `tutoring_slots`/`bookings` pair. Full definitions in [13-home-tutoring.md](./13-home-tutoring.md).

---

## Payments — see doc 04 for full detail, core tables here:

```sql
transactions (
  id UUID PK,
  user_id UUID REFERENCES users,
  purchasable_type TEXT,     -- 'learning_program' | 'subscription' | 'booking' | 'center_plan'
  purchasable_id UUID,
  amount_egp NUMERIC,
  currency TEXT DEFAULT 'EGP',
  payment_provider TEXT,     -- 'paymob' | 'fawry' | 'vodafone_cash' | 'instapay' | 'stripe'
  provider_reference TEXT,   -- gateway's transaction id
  status TEXT,               -- pending|paid|failed|refunded|partially_refunded
  metadata JSONB,
  created_at TIMESTAMPTZ
)

refunds (
  id UUID PK,
  transaction_id UUID REFERENCES transactions,
  amount_egp NUMERIC,
  reason TEXT,
  status TEXT,               -- requested|approved|rejected|completed
  requested_by UUID REFERENCES users,
  approved_by UUID REFERENCES users NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ
)
```

---

## Admin governance — audit trail for admin/ops actions:

```sql
admin_audit_log (
  id UUID PK,
  actor_id UUID REFERENCES users,   -- the admin who acted
  action TEXT,                       -- 'teacher.verify' | 'teacher.reject' | 'program.approve' | 'program.reject' (free-text slug, stable in code)
  target_type TEXT,                  -- 'teacher' | 'program'
  target_id UUID,
  metadata JSONB,                    -- { reason, before, after }
  created_at TIMESTAMPTZ
)
-- Append-only (ledger pattern). Governance is least-privilege + fully audited:
-- an admin acts on accounts via logged actions, never silent in-place edits
-- (doc 01 §7). Teacher verification uses teacher_profiles.verification_status;
-- program approval moves learning_programs.status pending_review → published.
```

---

## Loyalty / Points / Coupons — see doc 05 for full detail, core tables here:

```sql
points_ledger (
  id UUID PK,
  user_id UUID REFERENCES users,
  delta INT,                 -- positive = earn, negative = redeem/expire
  reason TEXT,                -- 'purchase' | 'referral' | 'redeem_reward' | 'expiry' | 'admin_adjustment'
  related_transaction_id UUID NULL REFERENCES transactions,
  metadata JSONB,
  created_at TIMESTAMPTZ
)
-- current balance = SUM(delta) WHERE user_id = X  (materialized view refreshed periodically, or just summed on read)

coupons (
  id UUID PK,
  code TEXT UNIQUE,
  discount_type TEXT,        -- 'percentage' | 'fixed_amount' | 'free_points'
  discount_value NUMERIC,
  usage_limit INT NULL,
  usage_limit_per_user INT DEFAULT 1,
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  applicable_to JSONB,       -- { "programs": [...], "subjects": [...], "min_amount": 100 }
  metadata JSONB
)

coupon_redemptions (
  id UUID PK,
  coupon_id UUID REFERENCES coupons,
  user_id UUID REFERENCES users,
  transaction_id UUID REFERENCES transactions,
  created_at TIMESTAMPTZ
)

loyalty_tiers (
  id UUID PK,
  name JSONB,                 -- { "ar": "ذهبي", "en": "Gold" }
  min_points INT,
  perks JSONB,                -- { "discount_pct": 5, "priority_support": true }
)
```

## Why this survives "feature creep"

| Future feature request | Schema impact with this design |
|---|---|
| Add French language | 0 — insert rows into `translations` |
| Add "flashcards" content type | 1 new table, no changes to existing ones |
| Add a new payment gateway | 0 schema change — new value in `payment_provider`, new provider class in code |
| Launch a referral program | Reuses `points_ledger` with `reason='referral'` |
| Add seasonal 2x points campaign | Data/config change in rules engine (doc 05), not schema |
| Educational Center B2B tier | New `centers` + `center_memberships` tables, existing tables untouched |
| Parent-teacher messaging, exams, report cards, attendance | New tables only (`exams`, `exam_results`, `conversations`, `messages`, `attendance_records`, `progress_snapshots`) — see doc 10, none of the tables above change |
| Add National ID / school-based verification tiers | New tables only (`identity_verifications`, `school_verifications`) plus a `verification_level` column already reserved on `users` — see doc 11 |
| Add in-person home tutoring marketplace | New tables only (`saved_addresses`, `teacher_service_areas`, `home_tutoring_bookings`, `session_ratings`) — see doc 13, `transactions`/`teacher_profiles` reused as-is |

> **Note:** doc [10-parent-teacher-student-engagement.md](./10-parent-teacher-student-engagement.md) adds the full table definitions for exams, attendance, messaging, and progress tracking. They're kept in that doc (not duplicated here) since they're a self-contained feature — refer to doc 10 as the source of truth for those tables.
