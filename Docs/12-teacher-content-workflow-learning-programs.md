# Teacher Content Workflow — The "Learning Program" Model

## 1. Why this replaces the "Course" concept

Every earlier doc in this set (HLD, schema, payments, loyalty, refunds, roadmap) used the word **"course"** as the sellable unit, with a flat `courses → lessons` structure. That model quietly assumes every teacher records video lessons the same way. In practice, teachers on Madrasty teach very differently — one records everything, one only records hard topics and teaches easy ones live, one only uploads PDFs and does all teaching live, one mixes theory videos with live exam-solving sessions. Forcing them into "Recorded Course" vs. "Live Course" vs. "Hybrid Course" as separate product types would mean rebuilding the catalog every time a teacher's style doesn't fit a bucket.

**This doc formally replaces "Course" with "Learning Program" as the sellable unit across the whole platform.** Every other doc's references to `courses`/`course_id` should now be read as `learning_programs`/`program_id` — the schema changes are listed in §6 and have been applied back into `03-database-schema.md` directly so there's one consistent model, not two competing ones.

## 2. Core Concept

```
Learning Program  (the thing a parent/student actually buys)
│
├── Subject → Grade → Semester → Chapters   (organizational hierarchy)
│
└── Chapter
     ├── Lesson 1  (type: Recorded Video)
     ├── Lesson 2  (type: Live Session)
     ├── Lesson 3  (type: PDF Notes)
     ├── Lesson 4  (type: Quiz)
     ├── Lesson 5  (type: Homework)
     ├── Lesson 6  (type: Recorded Video)
     ├── Lesson 7  (type: Private Session)
     └── Final Exam (type: Exam)
```

A **Program** is sold as a whole (or per-chapter/lesson, depending on the teacher's pricing choice — see §5 Visibility). Every **Lesson** inside it has its own **type**, independent of what type the lesson before or after it is. This is what lets Teacher A (all-recorded), Teacher B (recorded-hard-topics-only), Teacher C (all-live + PDFs), and Teacher D (theory recorded, live for exam-solving) all use the exact same product structure without the platform caring which style they use.

## 3. Program Structure (hierarchy)

```
Program
 → Subject        (e.g. Mathematics)
 → Grade           (e.g. Grade 6)
 → Semester         (e.g. Semester 1)
 → Chapters          (e.g. "Fractions")
 → Lessons             (Introduction, Addition, Subtraction, Practice, Final Quiz)
```

This hierarchy is what the curriculum browsing UI (student/parent side) and the authoring UI (teacher side) both walk — it's also what the `subjects`/`translations` tables from doc 03 already anticipated (grade-level organization existed before; this doc adds the Program/Chapter layer on top).

## 4. Lesson Types

| Type | Contains | Student experience |
|---|---|---|
| **Recorded** | Video, notes, attachments | Watch, replay, download resources |
| **Live** | Date, time, meeting link, attendance, optional recording | Joins at scheduled time; once finished, teacher's uploaded recording auto-becomes a replay lesson |
| **PDF** | PDF/images/notes, no video | Good for revision sheets, formula sheets, summaries |
| **Audio** | Audio file, notes | Language learning, memorization drills |
| **Quiz** | Questions, timer, passing score | Can gate/unlock the next lesson (see §5) |
| **Homework** | Assignment brief; student uploads PDF/images | Teacher reviews and grades (feeds `homework_submissions`, doc 03) |
| **Exam** | Randomized question pool, time limit, auto-grading | Feeds the `exams`/`exam_results` tables from doc 10 — an Exam-type lesson is how a formal graded exam gets attached to a program |
| **Private Session** | 1-on-1 booking toggle | Student picks date/time from teacher's open slots; teacher approves — reuses `tutoring_slots`/`bookings` from doc 03, just exposed as a lesson type inside a program rather than a separate product |

**Future lesson types** (architecture supports adding these without touching the overall workflow — just a new value in `lesson_type` plus a new type-specific detail table if needed): AI Tutor Session, Virtual Lab, Coding Playground, Interactive Simulation, Flashcards, Discussion Forum, Group Project, Peer Review, Reading Assignment, Educational Game, Poll & Survey, AI-generated Practice Test.

## 5. Lesson Status & Visibility

**Status** (authoring lifecycle): `draft → scheduled → published → archived`

**Visibility** (access control, independent of status):
| Visibility | Meaning |
|---|---|
| Free | Anyone enrolled (or even browsing, per teacher's choice) can access |
| Paid | Requires program purchase |
| Locked | Hidden until a prerequisite condition is met (e.g., "Locked until Quiz Passed") |
| Prerequisite | Explicitly tied to completion of a named earlier lesson |
| Invite Only | Restricted to specific enrolled students (e.g., a private cohort) |

Example inside one program: Lesson 1 = Free, Lesson 2 = Paid, Lesson 3 = Locked until Quiz Passed, Lesson 4 = Invite Only (private students). The teacher sets this per lesson, not per program — this per-lesson granularity is the whole point of moving away from "Course" as a monolithic product.

## 6. Data Model Changes (supersedes the `courses`/`lessons` tables in doc 03)

```sql
-- Replaces the old `courses` table:
learning_programs (
  id UUID PK,
  teacher_id UUID REFERENCES users,
  subject_id UUID REFERENCES subjects,
  grade_level TEXT,
  semester TEXT,
  price_egp NUMERIC,             -- whole-program price; individual lessons can still be priced via visibility+metadata
  status TEXT DEFAULT 'draft',    -- draft|pending_review|published|archived
  metadata JSONB,
  created_at TIMESTAMPTZ
)

chapters (
  id UUID PK,
  program_id UUID REFERENCES learning_programs,
  order_index INT,
  title JSONB,                    -- { "ar": "...", "en": "..." } via translations pattern, doc 03
  metadata JSONB
)

-- Replaces the old flat `lessons` table:
lessons (
  id UUID PK,
  chapter_id UUID REFERENCES chapters,
  order_index INT,
  lesson_type TEXT CHECK (lesson_type IN
     ('recorded','live','pdf','audio','quiz','homework','exam','private_session')),
  status TEXT DEFAULT 'draft',           -- draft|scheduled|published|archived
  visibility TEXT DEFAULT 'paid',        -- free|paid|locked|prerequisite|invite_only
  prerequisite_lesson_id UUID REFERENCES lessons NULL,   -- used when visibility='prerequisite' or 'locked'
  metadata JSONB,                        -- type-agnostic extras
  created_at TIMESTAMPTZ
)

-- Type-specific detail tables (one row per lesson, only for types that need extra structured fields):
recorded_lesson_details (
  lesson_id UUID PK REFERENCES lessons,
  video_url TEXT,
  duration_seconds INT,
  attachments JSONB
)

live_lesson_details (
  lesson_id UUID PK REFERENCES lessons,
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  meeting_url TEXT,
  recording_url TEXT NULL,        -- populated after the session; once set, lesson behaves like a Recorded lesson for replay
  attendance_taken BOOLEAN DEFAULT false
)

pdf_lesson_details (
  lesson_id UUID PK REFERENCES lessons,
  file_url TEXT,
  page_count INT NULL
)

audio_lesson_details (
  lesson_id UUID PK REFERENCES lessons,
  audio_url TEXT,
  duration_seconds INT
)

-- 'quiz' type reuses the existing `quizzes` table (doc 03), now referencing lesson_id instead of a bare lesson/course split
-- 'homework' type reuses the existing `homework_submissions` table (doc 03), tied via lesson_id/assignment_id
-- 'exam' type reuses the existing `exams`/`exam_results` tables (doc 10) — an exam-type lesson's `lesson.id` becomes the `exams.course_id`-equivalent link (rename that FK to `program_id` — see §7 migration notes)
-- 'private_session' type reuses `tutoring_slots`/`bookings` (doc 03), scoped to lesson_id + program_id
```

### Access tables (enrollment + progress + invites)

These back the §5 visibility rules and the §8 "My Programs"/completion flow. They are the source of truth for program access until the payments module (doc 04) starts writing `enrollments` rows with `source='purchase'`.

```sql
enrollments (
  id UUID PK,
  student_id UUID REFERENCES users,
  program_id UUID REFERENCES learning_programs,
  source TEXT CHECK (source IN ('purchase','admin_grant','free')),
  status TEXT DEFAULT 'active',           -- active|expired|cancelled
  granted_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NULL,             -- NULL = never expires
  metadata JSONB
  -- "is enrolled" = an `active` row whose expires_at is NULL or in the future.
  -- Append-only in spirit: re-grants add rows rather than mutating in place.
)

lesson_progress (
  student_id UUID REFERENCES users,
  lesson_id UUID REFERENCES lessons,
  opened_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,           -- NOT NULL is what unlocks prerequisite/locked lessons
  metadata JSONB,
  PRIMARY KEY (student_id, lesson_id)
)

lesson_invites (                           -- explicit allow-list for visibility='invite_only'
  lesson_id UUID REFERENCES lessons,
  student_id UUID REFERENCES users,
  invited_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (lesson_id, student_id)
)
```

**Access resolution** (per lesson, for a non-owner/non-admin viewer): `free` → open; `paid` → active enrollment; `locked`/`prerequisite` → active enrollment **and** `prerequisite_lesson_id` has a `completed_at` row in `lesson_progress` for that student; `invite_only` → a `lesson_invites` row for that student. A `locked`/`prerequisite` lesson with no `prerequisite_lesson_id` stays locked (a misconfiguration the authoring UI should prevent).

### Migration note for doc 03 and doc 10
- `03-database-schema.md`: the old flat `courses`/`lessons` tables are replaced by `learning_programs` / `chapters` / `lessons` (with `lesson_type`) as shown above. `quizzes.course_id` and `quizzes.lesson_id` both still work conceptually, just now pointed at the new `lessons.id`.
- `10-parent-teacher-student-engagement.md`: `exams.course_id` should be read as `exams.program_id REFERENCES learning_programs`, since exams now attach at the program level (or via an `exam`-type lesson when the exam needs to sit at a specific point in the learning path).
- `04-payments-integration.md` / `05-loyalty-points-coupons.md`: any `purchasable_type = 'course'` or `applicable_to.courses` should be read as `'learning_program'` / `applicable_to.programs` going forward.

## 7. Learning Path (ordering)

The teacher fully controls lesson order within a chapter — e.g., `Recorded → Quiz → Homework → Live Session → Recorded Replay → Exam`. This is just the natural effect of `order_index` on `lessons` combined with the `prerequisite_lesson_id`/`visibility='locked'` mechanism — no separate "path" table needed; the path is simply the ordered, gated lesson list.

## 8. Workflows

**Teacher workflow:**
`Create Program → Create Chapters → Create Lessons (choose type per lesson: recorded/live/pdf/quiz/homework/exam/private session) → Set status + visibility per lesson → Publish`

**Student workflow:**
`Purchase Program → Program appears in "My Programs" → Open Chapter → Complete Lesson → Finish Quiz → Attend Live Session → Submit Homework → Continue → Certificate`

**Parent workflow** (ties directly into doc 10's report card/progress feature — no new mechanism needed, just new inputs to the same aggregation): progress, attendance (from `live_lesson_details`/`bookings`), homework completion, quiz scores, upcoming live sessions, teacher feedback — all now sourced per-lesson-type from the tables above and rolled up into the existing `progress_snapshots` table.

## 9. Teacher Dashboard additions
Enrolled students count, lesson completion rate (now trackable per lesson *type*, e.g., "80% completion on Recorded lessons vs. 45% attendance on Live lessons" — a much more actionable analytic than a single "course completion %"), video watch percentage, homework submissions pending review, quiz statistics, revenue, upcoming live sessions, private bookings.

## 10. Repo Placement
Rename the `courses` module (doc 02) to `learning-programs`, and split lesson-type-specific logic into sub-folders so the module doesn't become a giant if/else on `lesson_type`:

```
modules/
└── learning-programs/
    ├── programs.service.ts
    ├── chapters.service.ts
    ├── lessons.service.ts               # shared lesson CRUD (order, status, visibility)
    └── lesson-types/
        ├── recorded.handler.ts
        ├── live.handler.ts
        ├── pdf.handler.ts
        ├── audio.handler.ts
        ├── quiz.handler.ts              # delegates into existing quizzes module
        ├── homework.handler.ts          # delegates into existing homework module
        ├── exam.handler.ts              # delegates into academic-records module (doc 10)
        └── private-session.handler.ts   # delegates into tutoring-booking module
```

Each `lesson-types/*.handler.ts` implements a shared `LessonTypeHandler` interface (`onPublish`, `onStudentAccess`, `onComplete`) — same "one interface, many implementations" pattern already used for payment providers (doc 04), so adding a future lesson type (AI Tutor Session, Virtual Lab, etc. — §4) means writing one new handler, not touching the core `lessons.service.ts`.

## 11. Why this design is better
Supports every teaching style without forcing a "recorded vs. live vs. hybrid" product choice; teachers never need to redesign a program to change their style mid-way; new lesson types are additive; analytics become per-lesson-type instead of one blended "course progress" number; student experience stays consistent (buy a Program, move through Chapters and Lessons) no matter how the teacher behind it actually teaches.
