# Parent-First Registration & Onboarding Workflow

## 1. Why this supersedes a generic "sign up" flow

Every other doc in this set (HLD, schema, loyalty, refunds) assumed a standard `users` table with a `role` column and moved on. That's fine for adults, but this platform serves **minors** (Primary/Preparatory students), so registration itself is a core feature, not a generic auth screen. The account model decided here — **parent as the root account, student as a managed sub-profile** — is a hard constraint that ripples into payments (doc 04, parent always pays), loyalty (doc 05, points can accrue to the parent account), and the messaging feature (doc 10, conversations are already scoped by `parent_id`, which this doc formalizes as the correct default).

## 2. Account Model

```
Parent Account (root, verified adult)
│
├── Student Profile 1  ─┐
├── Student Profile 2   ├─ each linked via parent_children (already in doc 03)
├── Student Profile 3  ─┘
└── Billing & Approvals
    ├── Payments (doc 04)
    ├── Private session approvals
    ├── Report cards (doc 10)
    └── Notifications
```

Students never own a standalone, self-sufficient account. A student profile always resolves back to exactly one (or more, see §7) verified parent/guardian account.

## 3. Registration Flows

### Flow A — Parent registers first (primary path)

```
1. Parent enters: full name, mobile, email, password
2. Platform sends SMS OTP → parent verifies
3. Platform sends email verification link → parent verifies
4. Parent Dashboard unlocks (status: "Basic Verified / ✅ Verified Guardian")
5. Parent adds student(s): full name, DOB, grade, school, city
   → platform generates a unique student_id
6. Student receives login credentials (username+password, or QR code for young children)
7. Student can now access content assigned by the parent — but cannot pay, book, or self-manage the account
```

### Flow B — Student discovers platform first (fallback path)

```
1. Student enters: name, grade, parent mobile number
2. Platform creates a PENDING student profile (no access yet) + sends SMS to parent:
   "Your child {name} wants to join Knouz Learning. Tap to approve: {link}"
3. Parent taps the link:
   a. If parent has no account → runs Flow A (register + verify mobile + verify email)
   b. If parent already has an account → logs in and reviews the pending request
4. Parent approves → student profile flips from PENDING to ACTIVE and links to parent
5. Only after approval does the student get real access (videos, quizzes, etc.)
```

**Key rule carried through both flows:** a student profile in `PENDING` status is functionally inert — it can exist in the database (so the student's initial input isn't lost) but grants zero content access until a verified guardian approves it. This is enforced at the API layer (every content/course endpoint checks `student.status = 'active'` AND `parent_children.approved_at IS NOT NULL`), not just hidden in the UI.

## 4. Verification Levels

| Level | Method | Trust | When |
|---|---|---|---|
| **1 — Phone/Email (MVP)** | SMS OTP + email verification | Medium | Default for launch |
| **2 — Identity** | Egyptian National ID (+ optional selfie) via a 3rd-party ID verification provider | High | Phase 2, optional upgrade — e.g., required before enabling higher-value private tutoring spend |
| **3 — School-verified** | Parent enters school name + student code, validated against a partnered school's records | Very High | Enterprise/B2B track (ties into the Educational Center module from doc 01) |
| **4 — Teacher invitation** | Teacher creates a classroom, invites students, parent approves | High | Optional, useful when a teacher already has an offline following |

Each level maps to a **badge** shown on the parent's profile, not a binary "verified/unverified" flag:
- ✅ **Verified Guardian** (Level 1)
- 🪪 **Identity Verified** (Level 2)
- 🏫 **School Verified** (Level 3)

Badges are additive/displayable, but only Level 1 is a hard gate for basic platform access — Levels 2-4 unlock specific higher-trust capabilities (see §6), they don't block the MVP.

## 5. Why "Guardian," not "Father"

The `relationship` field on the parent-student link must be an open set: `father | mother | guardian | other` — never hardcoded to a single family structure. This is already reflected in the schema update below.

## 6. Permissions Matrix

| Action | Parent/Guardian | Student |
|---|---|---|
| Create/own the billing account | ✅ | ❌ |
| Make payments (doc 04) | ✅ | ❌ |
| Book private tutoring / approve bookings | ✅ | ❌ (can request; parent must approve) |
| Upgrade subscription | ✅ | ❌ |
| Message teacher directly (doc 10) | ✅ | Only if parent enables it for older/Preparatory students (configurable per student profile) |
| Modify guardian/account ownership | ✅ | ❌ |
| Watch videos, submit homework, take quizzes | View-only via parent's grant | ✅ |
| View own grades/progress | ✅ (full) | ✅ (own record only) |

This matrix is the authoritative source for RBAC checks in the `auth.middleware.ts` — every write-type endpoint touching money, bookings, or account structure must check "is this actor the parent," not just "is this actor logged in."

## 7. Notes on Edge Cases (design now, even if not built until later)
- **Two guardians for one child** (e.g., both parents want access): supported by making `parent_children` a many-to-many (already true in doc 03's schema — `PRIMARY KEY (parent_id, student_id)` allows multiple parent rows per student). Both guardians get equal read access by default; write/payment actions can be restricted to a designated "primary" guardian via a `is_primary` flag (added below) to avoid double-charging or conflicting approvals.
- **Student ages into adulthood** (18+): out of scope for MVP (Primary/Preparatory only), but the schema should not make it structurally impossible later — a future "self-managed" flag on the student profile is a config change, not a redesign, given the existing `users.role` and `parent_children` structure.

## 8. Data Model Additions

Extends `03-database-schema.md` — add these, don't duplicate/replace the existing `users`/`parent_children` tables:

```sql
-- Extend existing `users` table (add columns, don't recreate):
ALTER TABLE users ADD COLUMN verification_level INT DEFAULT 1;   -- 1|2|3|4, see §4
ALTER TABLE users ADD COLUMN phone_verified_at TIMESTAMPTZ NULL;
ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ NULL;

-- Extend existing `student_profiles` table:
ALTER TABLE student_profiles ADD COLUMN status TEXT DEFAULT 'pending_approval';
  -- pending_approval | active | suspended

-- Extend existing `parent_children` table:
ALTER TABLE parent_children ADD COLUMN relationship TEXT DEFAULT 'guardian';
  -- father | mother | guardian | other
ALTER TABLE parent_children ADD COLUMN is_primary BOOLEAN DEFAULT true;
ALTER TABLE parent_children ADD COLUMN approved_at TIMESTAMPTZ NULL;

-- New tables:
otp_verifications (
  id UUID PK,
  user_id UUID REFERENCES users,
  channel TEXT,              -- 'sms' | 'email'
  code_hash TEXT,             -- never store the raw OTP
  expires_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ NULL,
  attempt_count INT DEFAULT 0,
  created_at TIMESTAMPTZ
)

guardian_approval_requests (
  id UUID PK,
  pending_student_name TEXT,        -- captured before a parent account may even exist
  pending_student_grade TEXT,
  parent_mobile TEXT,               -- the number the student typed in, pre-verification
  matched_parent_id UUID REFERENCES users NULL,   -- filled in once the mobile matches/creates a parent
  student_profile_id UUID REFERENCES student_profiles NULL,
  status TEXT DEFAULT 'awaiting_parent',  -- awaiting_parent | approved | rejected | expired
  approval_token TEXT UNIQUE,        -- the token embedded in the SMS link
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ NULL
)

identity_verifications (          -- Level 2, phase 2
  id UUID PK,
  user_id UUID REFERENCES users,
  provider TEXT,                   -- 3rd-party ID verification vendor
  national_id_hash TEXT,           -- never store raw national ID in plaintext
  selfie_check_passed BOOLEAN NULL,
  status TEXT DEFAULT 'pending',   -- pending|verified|rejected
  metadata JSONB,
  created_at TIMESTAMPTZ
)

school_verifications (            -- Level 3, enterprise track
  id UUID PK,
  student_profile_id UUID REFERENCES student_profiles,
  school_id UUID,                  -- references a future `schools`/`centers` table (doc 01 B2B module)
  student_code TEXT,
  status TEXT DEFAULT 'pending',
  verified_at TIMESTAMPTZ NULL
)
```

*Design note, consistent with the rest of this doc set:* OTP codes and national IDs are stored **hashed**, never raw — same "don't store what you don't need in recoverable form" instinct as password hashing. `guardian_approval_requests` deliberately does **not** require `matched_parent_id` to exist at creation time, because Flow B's whole point is that the parent might not have an account yet when the student submits their info.

## 9. API Surface (new endpoints, added to the `auth` module from doc 02)

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/parent/register` | Flow A step 1 |
| `POST /api/auth/otp/verify` | Verify SMS/email OTP (used by both flows) |
| `POST /api/auth/parent/students` | Parent adds a student profile |
| `POST /api/auth/student/self-register` | Flow B step 1 — creates `guardian_approval_requests` + pending student profile |
| `GET /api/auth/guardian-approval/:token` | Parent opens the SMS link — returns request details |
| `POST /api/auth/guardian-approval/:token/approve` | Parent approves → flips student to active, creates `parent_children` row |
| `POST /api/auth/guardian-approval/:token/reject` | Parent rejects → request marked rejected, student stays inert |
| `POST /api/auth/identity-verification` | Level 2 upload (phase 2) |

## 10. Repo & Roadmap Placement
- Backend: extend the existing `modules/auth/` (doc 02) with `otp/`, `guardian-approval/`, and (phase 2) `identity-verification/` sub-folders — this is registration logic, not a separate module, so it stays inside `auth`.
- Frontend: `features/auth/` gets `parent-register/`, `add-student/`, `student-self-register/`, `guardian-approval-landing/` screens.
- Roadmap: this is **Phase 0** work (see updated `09-mvp-roadmap.md`) — registration is the literal first thing a user does, so Level 1 verification (SMS+email) and both registration flows must exist before Phase 1's marketplace features are testable at all. Level 2/3/4 verification stay in their originally planned later phases.
