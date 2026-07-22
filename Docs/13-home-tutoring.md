# Home Tutoring — In-Person Private Sessions

## 1. What this is, and how it differs from the existing "Private Session" lesson type

Doc 12 already has a `private_session` lesson type — that's a **virtual** 1-on-1 session booked through `tutoring_slots`/`bookings` (doc 03), scoped inside a Learning Program, with a simple status (`open/booked/cancelled/completed`).

**Home Tutoring is a different product**: a teacher physically visits the student's home. It needs things the virtual model never had to worry about — a home address, a travel fee, a "teacher is on the way" status, GPS/safety considerations, and a payout that's held until the visit is actually completed (harder to dispute a video session than a home visit that may or may not have happened). Rather than overload `tutoring_slots`/`bookings` with location fields that make no sense for a virtual session, **Home Tutoring gets its own tables** (below) and its own module, sitting alongside — not replacing — the virtual private-session lesson type. A teacher/program can offer either, both, or neither.

## 2. Objectives
Parents can: find nearby teachers, book a home visit, choose subject/topic/duration, pay securely, track the booking end-to-end, and rate the teacher afterward.

## 3. Booking Workflow

```
Parent searches teachers (by subject, grade, city, service area)
        │
        ▼
Views Teacher Profile (bio, qualifications, rating, hourly pricing, service areas, weekly availability)
        │
        ▼
Chooses Subject → Topic → Session Duration → Date & Time → Home Address
        │
        ▼
Submits booking request
        │
        ▼
Teacher Accepts (or declines) the request
        │
        ▼
Parent completes payment (held by platform, not released yet — see §6)
        │
        ▼
Session day: status moves Confirmed → Teacher On The Way → In Progress → Completed
        │
        ▼
Payment released to teacher (minus commission)
        │
        ▼
Parent rates the teacher (Teaching Quality, Punctuality, Communication, Professionalism, Overall)
```

If the teacher declines, or doesn't respond within a configurable window, the request auto-expires and the parent is notified to pick another teacher/time — never left in limbo.

## 4. Session Duration & Pricing

Teachers define their own duration tiers and per-tier price (this is data, not a hardcoded ladder):

| Duration | Example Price |
|---|---|
| 30 min | 150 EGP |
| 60 min | 300 EGP |
| 90 min | 420 EGP |
| 120 min | 550 EGP |

**Total cost formula** (computed server-side at checkout, same "never trust a client-sent price" rule as doc 04):
```
Total = Teacher Fee (duration tier) + Travel Fee (if applicable, distance/teacher-defined) + Platform Service Fee
```
Example: 300 EGP (teacher) + 40 EGP (travel) + 20 EGP (platform) = 360 EGP.

## 5. Teacher Availability & Service Areas

Teachers configure: working days, available hours, subjects, grades, cities/service areas, maximum travel distance, and an optional flat or distance-based travel fee. Unavailable slots simply aren't offered — this reuses the same "generate bookable slots from configured availability" pattern as the virtual `tutoring_slots` model, just with a geography filter layered on top.

## 6. Payments — Escrow-Style Hold

This is the one payment behavior that's new relative to doc 04's model: for Home Tutoring, the parent's payment is captured but **held by the platform** (not released to the teacher) until the session is marked `completed`. This protects parents from paying for a visit that doesn't happen, and protects the platform from disputes about whether a home visit occurred.

- `transactions.status = 'paid'` at checkout (money captured).
- A new `payout_status` on the booking (`held → released → refunded`) tracks the teacher-facing side separately from the parent-facing `transactions.status`.
- On `session status = completed`: trigger payout release (minus platform commission) to the teacher's `payout_details` (already in `teacher_profiles`, doc 03).
- On `cancelled`/`no_show` before the visit: refund path follows doc 06's rules, adapted below (§9).

This is a deliberate divergence from "release funds as soon as payment succeeds" — Home Tutoring is the one product on the platform where the thing being paid for is a real-world event the platform can't directly verify happened, so holding funds until completion is the right default, not an optional nice-to-have.

## 7. Session Status
`requested → waiting_for_teacher_acceptance → confirmed → teacher_on_the_way → in_progress → completed`, with `cancelled` and `no_show` as terminal alternates at any point before `completed`.

## 8. Notifications
- **Parent**: booking confirmation, teacher acceptance, payment confirmation, "teacher is on the way" reminder, session completion prompt to rate.
- **Teacher**: new booking request, payment confirmation, upcoming session reminder, cancellation notice.

Reuses the existing Notifications module (doc 01) — no new notification infrastructure needed, just new trigger points tied to the status transitions above.

## 9. Refunds & Cancellations (extends doc 06)

| Scenario | Policy |
|---|---|
| Parent cancels before teacher accepts | Full refund, no fee |
| Parent cancels after acceptance, well before session time (e.g., >12h) | Full refund |
| Parent cancels late (e.g., <12h before) | Partial refund or forfeiture, configurable — mirrors doc 06's private-session-lesson rule, applied here to the physical booking instead |
| Teacher cancels/declines/no-shows | Full refund to parent automatically — the teacher, not the parent, caused the failure |
| Session marked completed | No refund path (dispute process only, handled by Admin) |

This row should be added directly into doc 06's refund policy table — see the update applied there.

## 10. Safety Features
- Verified teacher identity + verified parent account (both reuse the identity verification levels from doc 11 — Home Tutoring is a strong candidate for *requiring* at least Level 2 "Identity Verified" for teachers, given they're entering a family's home).
- Booking history and a session audit log (status transition timestamps, same append-only-event instinct used throughout this doc set).
- Emergency contact info on file for the student's home address.
- Optional OTP verification at session start (teacher and/or parent confirms via OTP that the visit is genuinely starting) — reuses the `otp_verifications` table from doc 11 rather than inventing a new OTP mechanism.

## 11. Data Model Additions

```sql
saved_addresses (
  id UUID PK,
  parent_id UUID REFERENCES users,
  label TEXT,                 -- 'Home', "Grandparents' House", etc.
  governorate TEXT,
  city TEXT,
  district TEXT,
  street TEXT,
  building_number TEXT,
  apartment_number TEXT,
  gps_location JSONB NULL,    -- { "lat": ..., "lng": ... }, optional
  metadata JSONB
)

teacher_service_areas (
  id UUID PK,
  teacher_id UUID REFERENCES users,
  city TEXT,
  max_travel_distance_km NUMERIC NULL,
  travel_fee_egp NUMERIC DEFAULT 0,
  metadata JSONB
)

home_tutoring_duration_options (
  id UUID PK,
  teacher_id UUID REFERENCES users,
  duration_minutes INT,
  price_egp NUMERIC
)

home_tutoring_bookings (
  id UUID PK,
  parent_id UUID REFERENCES users,
  student_id UUID REFERENCES users,
  teacher_id UUID REFERENCES users,
  subject_id UUID REFERENCES subjects,
  topic TEXT,
  duration_minutes INT,
  scheduled_start TIMESTAMPTZ,
  address_id UUID REFERENCES saved_addresses,
  transaction_id UUID REFERENCES transactions,
  status TEXT DEFAULT 'requested',
    -- requested|waiting_for_teacher_acceptance|confirmed|teacher_on_the_way|in_progress|completed|cancelled|no_show
  payout_status TEXT DEFAULT 'held',   -- held|released|refunded — see §6
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

session_ratings (
  id UUID PK,
  booking_id UUID REFERENCES home_tutoring_bookings,
  parent_id UUID REFERENCES users,
  teacher_id UUID REFERENCES users,
  teaching_quality INT,       -- 1-5
  punctuality INT,
  communication INT,
  professionalism INT,
  overall INT,
  comment TEXT NULL,
  created_at TIMESTAMPTZ
  -- teachers cannot modify/delete ratings — enforced at API layer, not just UI
)
```

*Note:* `home_tutoring_bookings` deliberately does **not** reuse the generic `bookings` table from doc 03 (which is scoped to `tutoring_slots`) — the status enum, address, and payout fields are different enough that forcing them into one table would mean a lot of nullable columns that only make sense for one product or the other. Same principle as doc 12's per-lesson-type detail tables: shared concept, separate tables when the shape genuinely diverges.

## 12. Repo Placement

```
modules/
└── home-tutoring/
    ├── teacher-availability.service.ts
    ├── booking.service.ts
    ├── payout.service.ts        # escrow hold/release logic, §6
    └── ratings.service.ts
```
Client: `features/home-tutoring/` with `teacher-search/`, `booking-flow/`, `session-tracker/` (status timeline UI), `ratings/`.

## 13. Business Model
Revenue: commission per completed session (5–15%, configurable per teacher tier), premium/featured teacher profiles, promotional placements, and (future) monthly tutoring packages. This is an additive revenue stream alongside the existing marketplace commission (doc's original plan.md revenue model) — same commission-on-transaction pattern, just a second product line it applies to.

## 14. Roadmap Placement
This is substantial enough to be its own phase — see the update to `09-mvp-roadmap.md` (new **Phase 3.5**), placed after Live Classes/virtual tutoring (Phase 3) since Home Tutoring reuses teacher verification, payments, and notification infrastructure that should already be solid by then, and because the escrow-style payout (§6) is new payment logic worth building once the simpler payment flows are proven in production.

## 15. Future Enhancements (not MVP)
Live GPS tracking while the teacher travels, QR/OTP-based check-in/check-out, AI teacher recommendations, monthly tutoring packages, automatic invoices, loyalty rewards tied to home tutoring spend (extends doc 05's points engine with a new `earn_rules` trigger — no schema change needed there, just a new rule row).
