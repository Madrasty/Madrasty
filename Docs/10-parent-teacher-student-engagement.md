# Parent–Teacher–Student Engagement ("Digital School Experience")

## 1. Why this is a core feature, not a "nice to have"

`plan.md` already states parents are the real paying customers, and the platform's whole pitch is to be a *Digital Operating System for Egyptian Private Education* — not just a Learning Program marketplace. A pure content marketplace just sells videos. A school gives parents visibility, gives teachers a channel to reach parents, and gives students a sense of being tracked and known. This feature is what turns "Udemy for Egypt" into something that actually feels like a school. It sits across three existing modules (Users, Learning Programs/Quizzes, Notifications) rather than being one isolated feature — that's why it gets its own doc: it's a *workflow*, not a screen.

## 2. The Workflow

```
                         ┌───────────────────────────┐
                         │        TEACHER             │
                         │  - Records exam/quiz grade │
                         │  - Leaves feedback note    │
                         │  - Sends message to parent │
                         └─────────────┬──────────────┘
                                       │ writes
                                       ▼
                         ┌───────────────────────────┐
                         │   Student Academic Record  │
                         │  (grades, attendance,      │
                         │   progress %, feedback)    │
                         └─────────────┬──────────────┘
                                       │ read (real-time)
                    ┌──────────────────┴───────────────────┐
                    ▼                                       ▼
          ┌───────────────────┐                  ┌───────────────────┐
          │      STUDENT       │                  │       PARENT       │
          │  sees own grades,  │                  │  sees child's      │
          │  progress, badges  │                  │  full record +     │
          │                    │                  │  can message       │
          └────────────────────┘                  │  teacher directly  │
                                                     └─────────┬──────────┘
                                                               │ message
                                                               ▼
                                                     back to TEACHER inbox
```

Three things make this feel like "a real school" rather than a dashboard bolted onto a program store:

1. **Grades/exams are a first-class object**, separate from "quiz score on lesson 4" — a report-card-style view, not just scattered quiz percentages.
2. **Parent → Teacher messaging is built into the platform**, not left to WhatsApp — this is what makes the platform indispensable rather than optional.
3. **Progress is computed and pushed**, not something a parent has to hunt for — weekly/automatic summaries, not just an on-demand dashboard.

## 3. Feature Breakdown

### 3.1 Exams & Report Cards
- Teachers create **Exams** (distinct from ongoing quizzes) — midterm/final-style, with a defined max score, weight, and subject.
- Each exam produces an `exam_result` per student: score, max_score, teacher_comment, graded_at.
- A **Report Card view** aggregates: exam scores + quiz averages + homework completion rate + attendance, per subject, per term — this is the "real school" artifact parents actually want to see and can even export as a PDF (reuse your `pdf` skill/tooling for this later).

### 3.2 Progress Tracking
- Per-program progress: % of lessons completed, last activity date, quiz average, homework on-time rate.
- Per-subject rollup: combines all programs/exams under that subject for the student's grade level.
- "Weak subject" flag: simple rule-based (e.g., average < 60% over last N assessments) — this powers the "AI recommendations" idea from `plan.md`'s parent dashboard without requiring real ML on day one.

### 3.3 Parent–Teacher Messaging
- **Conversations** are scoped to a `(parent, teacher, student)` triple — a parent messaging a teacher is always in the context of a specific child, never a generic DM. This avoids ambiguity when a parent has multiple children with different teachers.
- Teachers see a unified inbox across all their students' parents.
- Optional: **Admin-visible** (not necessarily moderated pre-send, but auditable) — schools/parents in Egypt often expect an authority figure to be able to review communication if there's ever a dispute; log everything, don't delete.
- Quick-reply templates for teachers (e.g., "Your child is doing well this week") to reduce response friction — teachers are busy; low-friction communication tools are what actually get used.

### 3.4 Attendance (ties into "real school" feel)
- For live classes/tutoring sessions: attendance auto-recorded from session join/leave events.
- Parents see attendance history per subject — absence patterns are one of the top things parents want visibility into per `plan.md`.

### 3.5 Notifications that make this feel alive
- New exam grade posted → notify parent (and student) same day.
- Teacher sends a message → push/WhatsApp/email notification to parent, not just an in-app badge (parents may not open the app daily; meet them where they check messages).
- Weekly automatic summary to parent: "This week: 3 lessons completed, 1 quiz (85%), attendance 2/2 live classes, 1 message from teacher."

## 4. Data Model Additions

These extend doc 03 — add to `03-database-schema.md`, don't create a competing schema:

```sql
exams (
  id UUID PK,
  program_id UUID REFERENCES learning_programs NULL,
  subject_id UUID REFERENCES subjects,
  teacher_id UUID REFERENCES users,
  title JSONB,               -- { "ar": "...", "en": "..." }
  max_score NUMERIC,
  weight NUMERIC DEFAULT 1.0,   -- for weighted report-card averages
  term TEXT,                    -- e.g. 'term1_2025'
  metadata JSONB,
  created_at TIMESTAMPTZ
)

exam_results (
  id UUID PK,
  exam_id UUID REFERENCES exams,
  student_id UUID REFERENCES users,
  score NUMERIC,
  teacher_comment TEXT,
  graded_by UUID REFERENCES users,
  graded_at TIMESTAMPTZ,
  metadata JSONB
)

attendance_records (
  id UUID PK,
  student_id UUID REFERENCES users,
  session_type TEXT,          -- 'live_class' | 'tutoring'
  session_id UUID,            -- references live session or booking
  status TEXT,                -- present|absent|late
  recorded_at TIMESTAMPTZ
)

conversations (
  id UUID PK,
  parent_id UUID REFERENCES users,
  teacher_id UUID REFERENCES users,
  student_id UUID REFERENCES users,   -- the child this conversation is about
  status TEXT DEFAULT 'open',         -- open|archived
  created_at TIMESTAMPTZ,
  UNIQUE (parent_id, teacher_id, student_id)
)

messages (
  id UUID PK,
  conversation_id UUID REFERENCES conversations,
  sender_id UUID REFERENCES users,
  body TEXT,
  read_at TIMESTAMPTZ NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ
)

progress_snapshots (
  id UUID PK,
  student_id UUID REFERENCES users,
  subject_id UUID REFERENCES subjects,
  completion_pct NUMERIC,
  quiz_avg NUMERIC,
  homework_ontime_rate NUMERIC,
  attendance_rate NUMERIC,
  computed_at TIMESTAMPTZ           -- recalculated periodically (nightly job), not live-computed every page load
)
```

*Design note:* `progress_snapshots` is a materialized/pre-computed table refreshed by a scheduled job, not a live query across every program/quiz/homework table on every dashboard load — this keeps the parent dashboard fast as data grows, and mirrors the same "don't compute expensive aggregates on the read path" principle already used for points balances in doc 05.

## 5. Module & Repo Placement

Add to `packages/server/src/modules/`:
```
modules/
├── academic-records/      # exams, exam_results, progress_snapshots
├── attendance/
└── messaging/             # conversations, messages, notification triggers
```
And on the client:
```
features/
├── parent-dashboard/
│   ├── report-card/
│   ├── progress-overview/
│   └── teacher-messages/
├── teacher-dashboard/
│   ├── gradebook/
│   └── parent-inbox/
```

## 6. Permissions Model
- Parent can only read records for students in `parent_children` (already in doc 03) — never another child's data.
- Teacher can only message/grade students enrolled in their own programs/sessions.
- Admin can view all conversations (read-only, audit purpose) but shouldn't post as a participant.

## 7. Where this lands in the roadmap
This is substantial enough to be its own roadmap phase rather than squeezed into an existing one — see the update to `09-mvp-roadmap.md` (new **Phase 2.5**), placed right after core payments/loyalty land, because report cards and messaging matter most once there are real enrolled students with real activity to report on.
