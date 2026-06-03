# Future Features

A detailed backlog of features that fit the SIS's current shape (PH
higher-ed context, block-based cohorts, PH grade scale, role-based access).
Each entry documents the **problem**, the **data-model changes**, the
**backend surface**, the **frontend surface**, **edge cases** to plan for, an
**effort breakdown**, the **dependencies** it relies on, and the
**open questions** that would need a decision before building.

This is a living discovery document, not a commitment. Items are not
strictly ranked, but a "recommended next phase" pairing appears at the bottom.

**Effort tags:** `S` = ≤ 1 day · `M` = 1–3 days · `L` = 1+ weeks.

---

## Table of contents

1. [Student-facing services](#1-student-facing-services)
2. [Faculty productivity](#2-faculty-productivity)
3. [Admin operations](#3-admin-operations)
4. [Academic workflows](#4-academic-workflows)
5. [Analytics & dashboards](#5-analytics--dashboards)
6. [Security & polish](#6-security--polish)
7. [Long-tail (skip unless asked)](#7-long-tail--skip-unless-asked)
8. [Recommended next phase](#8-recommended-next-phase)

---

## 1. Student-facing services

### 1.1 Certificate of Enrollment (COE) PDF — `S`

**Problem.** PH students are constantly asked for a current-term enrollment
certificate by employers, scholarship boards, and government offices. They
currently have to visit the registrar's window. Self-service would shave
hundreds of staff-hours per term.

**Data model.** No new tables. A `coe_serial_seq` sequence per academic year
gives each issued COE a unique number (`COE-2026-00001`) for traceability.

**Backend.**
- `GET /api/students/me/coe` (auth: student) — generates a PDF on demand.
- New service `students.coe.ts` pulls: student profile, program, block,
  active term, enrolled section list (course code, title, units, schedule).
- PDF rendering via `pdfkit` or `puppeteer` — `pdfkit` is lighter, no
  headless browser. Use a single layout template with school logo header,
  registrar signature block (image asset), and a QR code linking to a
  verification URL.
- Audit log: insert `ISSUE_COE` row so the registrar can prove who pulled
  what and when.

**Frontend.** A button on the Student Dashboard ("Download COE") and on
`/student/account`. Single-click download; toast on failure.

**Edge cases.**
- Student has no active enrollment → return 409 with a helpful message
  ("Wait until the registrar opens the term").
- Student is on leave / dropped — block issuance.
- Multiple terms active (rare but possible during overlap) — let the user
  pick which term.

**Effort breakdown.** 2 h schema/serial + 4 h PDF template + 2 h backend
service & route + 1 h frontend button + 1 h audit/edge cases = ~1 day.

**Dependencies.** None — uses existing enrollment data.

**Open questions.**
- Do we want a verification page (`/verify/coe/:serial`) that the QR code
  links to? Recommended for credibility but adds ~3 h of build.
- Who signs digitally? A scanned signature image kept in `public/` is the
  pragmatic start.

---

### 1.2 Form 137 / 138 / TOR templates — `M`

**Problem.** Formal academic record exports (Form 137 = secondary
permanent record, Form 138 = report card, TOR = official transcript) are
the canonical PH school documents. We already compute every number; this
is mostly a templating exercise.

**Data model.** No new tables. A `transcript_serial_seq` sequence for TOR
copies. Optionally a `tor_release` table tracking who requested and when
(for the clearance feature, item 1.5).

**Backend.**
- `GET /api/students/me/transcript/tor.pdf` (auth: student or admin).
- `GET /api/students/:id/form137.pdf` (auth: admin).
- `GET /api/students/:id/form138.pdf` (auth: admin or faculty for own
  sections).
- One shared layout component, three flavors. The PDF generator should be
  factored as `lib/pdf/transcripts.ts` with helpers per form type.

**Frontend.**
- Student `/student/account`: "Download TOR" button (subject to clearance,
  item 1.5).
- Admin Users → row action: "Generate Form 137 / 138".
- Faculty section roster: "Generate Form 138 for class".

**Edge cases.**
- Numeric grades that haven't been finalized yet should display as
  "In Progress" not blank.
- Dropped subjects: include with a strikethrough or "W" marker —
  registrar preference dictates.
- TOR for graduated students must include the `graduated_at` date.
- Letter-grade footnotes: PH scale documentation embedded at the bottom
  of every TOR.

**Effort breakdown.** 4 h shared PDF layout + 4 h per form template × 3 +
2 h auth/edge cases + 2 h frontend = ~2.5 days.

**Dependencies.** Item 1.1 (COE) lays the PDF foundation — strongly
recommend building COE first.

**Open questions.**
- Does the registrar require physical wet-signature on TOR? If yes,
  generate a *draft* watermark on student-pulled copies and a clean version
  on admin-pulled.
- Need school logo, registrar signature image, dry-seal scan.

---

### 1.3 Class schedule .ics export — `S`

**Problem.** Students want their class schedule in Google Calendar /
Outlook. We have the data; pushing it as an `.ics` file is trivial.

**Data model.** None.

**Backend.**
- `GET /api/students/me/schedule.ics` (auth: student).
- Builds an iCalendar file: one VEVENT per (section × day) with a
  WEEKLY recurrence rule bounded by the term's `end_date`.
- Library: `ics` npm package (~10 kB) or hand-roll — the format is plain
  text, the spec fits on one page.

**Frontend.** "Add to calendar" button on `/student/schedule` next to the
existing grid. Optional: also surface as a long-lived subscription URL
(`/api/students/me/schedule.ics?token=…`) so calendars auto-refresh after
schedule changes. The token is a separate short-lived JWT scoped only to
this endpoint.

**Edge cases.**
- Sections with no day/time set yet (TBA) → skip silently.
- Holidays — we don't have a holidays table, so events still appear on
  Christmas etc. Either accept it (most apps do) or maintain a
  `term_holidays` table later.
- Timezone — emit `TZID=Asia/Manila` explicitly.

**Effort breakdown.** 2 h backend + 1 h frontend + 1 h subscription
token + 1 h edge cases = ~5 h.

**Dependencies.** None.

**Open questions.**
- Subscription URL or just a one-shot download? Subscription is much
  better UX but requires a separate token system.

---

### 1.4 Pre-registration / wish-list — `M`

**Problem.** Before the registrar formally "opens" a term, students
should be able to mark which courses they intend to take. The admin can
then see demand per course and provision sections accordingly.

**Data model.**
```sql
CREATE TABLE wishlist_entries (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  term_id     UUID        NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  course_id   UUID        NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  priority    INT         NOT NULL DEFAULT 1,  -- 1 = must have, 5 = nice to have
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, term_id, course_id)
);
```

**Backend.**
- `GET /api/students/me/wishlist?termId=…`
- `POST /api/students/me/wishlist` — body: `{ termId, courseId, priority, notes }`
- `DELETE /api/students/me/wishlist/:id`
- Admin aggregate: `GET /api/admin/wishlist-demand?termId=…` → per-course
  counts grouped by program and year level.

**Frontend.**
- New student page `/student/wishlist` — course catalog filtered to their
  program with toggle "add / remove from wishlist". Sort by year level,
  prereqs satisfied first.
- Admin Curriculum builder gains a "Demand" tab showing the aggregate.

**Edge cases.**
- Locked window: wishlist is read-only once the registrar opens the term.
- Course already taken / passed → hide from picker.
- Course locked by unmet prereq → show but mark.
- Block-mandated courses don't need to be wishlisted — pre-fill them.

**Effort breakdown.** 3 h migration + schema + 4 h backend + 6 h
frontend + 2 h aggregate view = ~2 days.

**Dependencies.** Course visibility / program restriction (already
implemented).

**Open questions.**
- Hard cap per student (e.g. 10 entries)?
- Does the wishlist auto-convert to enrollments when the term opens?
  Recommended: no, registrar still confirms; it's an advisory signal only.

---

### 1.5 Clearance tracker — `M`

**Problem.** PH schools require students to be "cleared" by library,
accounting, dorm, etc. before they can withdraw transcripts. Today this is
paper-based.

**Data model.**
```sql
CREATE TABLE clearance_departments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL UNIQUE,    -- 'Library', 'Accounting', 'Dorm'
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE clearance_records (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id UUID        NOT NULL REFERENCES clearance_departments(id),
  term_id       UUID        NOT NULL REFERENCES terms(id),
  status        TEXT        NOT NULL CHECK (status IN ('pending','cleared','blocked')),
  reason        TEXT,
  cleared_by    UUID        REFERENCES users(id),
  cleared_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, department_id, term_id)
);
```

**Backend.**
- `GET /api/students/me/clearance?termId=…` — student view, full status.
- `GET /api/admin/clearance/:departmentId` — staff view filtered by their
  department; needs a new role `clearance_officer` or department-scoped
  permission.
- `PATCH /api/admin/clearance/:recordId` — flip status, append reason.
- Auto-create pending records for every active student × active
  department when a term opens (extend `openTerm`).

**Frontend.**
- Student: dedicated `/student/clearance` page or a card on Account.
- Admin: a department-scoped page listing students with their status.
- TOR / transcript download endpoints check clearance status; block with
  a clear message if not cleared.

**Edge cases.**
- Departments can be added/disabled mid-term.
- Past-term clearance is read-only.
- Graduated students need a final clearance round.

**Effort breakdown.** 4 h schema + 6 h backend + 6 h frontend + 4 h
permissions / role glue = ~3 days.

**Dependencies.** A new role or permission model — currently we have a
flat `admin/faculty/student` enum. Adding `clearance_officer` means
updating `users.role` enum and `authorize()` middleware everywhere.

**Open questions.**
- Department-scoped officers vs. one super-admin who handles all
  clearance? Affects role-model complexity.

---

## 2. Faculty productivity

### 2.1 Attendance module — `M`

**Problem.** The roster and the gradebook exist; the daily attendance
ledger between them does not. Faculty want to mark P / L / A per session
without leaving the section detail view.

**Data model.**
```sql
CREATE TABLE attendance_sessions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id  UUID        NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  session_date DATE       NOT NULL,
  created_by  UUID        REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (section_id, session_date)
);

CREATE TYPE attendance_status AS ENUM ('present','late','absent','excused');

CREATE TABLE attendance_records (
  id            UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID              NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  enrollment_id UUID              NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  status        attendance_status NOT NULL,
  note          TEXT,
  marked_by     UUID              REFERENCES users(id),
  marked_at     TIMESTAMPTZ       NOT NULL DEFAULT now(),
  UNIQUE (session_id, enrollment_id)
);
```

**Backend.**
- `GET /api/sections/:id/attendance` — returns sessions + records for the
  faculty owner.
- `POST /api/sections/:id/attendance/sessions` — create a session for a
  date (default: today).
- `PUT /api/sections/:id/attendance/sessions/:sid/records` — bulk upsert
  (same pattern as `bulkSaveScores`).
- `GET /api/students/me/attendance` — student view, summary + per-session.

**Frontend.**
- New tab on the gradebook page: "Attendance" sibling to "Scores".
- Roster-shaped grid: rows = students, columns = session dates with a
  toggle button (cycles P → L → A → blank).
- Quick action: "Mark all present" then adjust outliers.

**Edge cases.**
- Sessions on days the section doesn't meet (per `day_of_week`) should
  warn but not block.
- Editing past sessions allowed but flagged in audit log.
- Bulk-add session button: "fill out missing sessions through today".
- Faculty changes mid-term → session ownership stays with the section,
  not the faculty.

**Effort breakdown.** 4 h schema + 6 h backend + 8 h frontend grid + 3 h
student view + 3 h audit/edges = ~3 days.

**Dependencies.** Existing gradebook / roster patterns.

**Open questions.**
- Excused absence flow — does the student request and the faculty
  approve, or just a faculty-flipped flag?
- Should attendance affect grades automatically (e.g. 3+ absences = 0.25
  deduction)? Probably not in v1.

---

### 2.2 Section announcements — `S`

**Problem.** Faculty want to broadcast "no class Friday" or "quiz
rescheduled" to enrolled students. Today they use group chat off-platform.

**Data model.**
```sql
CREATE TABLE section_announcements (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID        NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  author_id  UUID        NOT NULL REFERENCES users(id),
  title      TEXT        NOT NULL,
  body       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_announcements_section ON section_announcements(section_id, created_at DESC);
```

**Backend.**
- `GET /api/sections/:id/announcements`
- `POST /api/sections/:id/announcements` (faculty only)
- `DELETE /api/sections/:id/announcements/:aid` (author only)
- After inserting an announcement, fanout via the existing
  `notifications.service` (`kind: 'announcement'`) to all enrolled
  students, link to `/student/sections/:id` (new page) or `/student/grades`.

**Frontend.**
- New tab on the gradebook page: "Announcements" with a compose box and a
  reverse-chronological list.
- Student dashboard gains a small "Latest announcements" card.
- Bell-icon dropdown already handles the notification kind; just add a
  visual treatment for `announcement` in `NotificationBell.tsx`.

**Edge cases.**
- Author leaves the section (faculty reassignment) — keep the
  announcement, mark the author as historical.
- Long body: enforce a 4 KB cap or use a textarea + markdown.

**Effort breakdown.** 2 h schema + 3 h backend + 4 h frontend + 1 h
notification glue = ~1.5 days.

**Dependencies.** Notifications module (Phase 7, already shipped).

**Open questions.**
- Markdown or plain text? Markdown is cheap with `marked` but expands
  XSS attack surface — `DOMPurify` mitigates.
- Allow attachments (PDFs)? Out of scope for v1.

---

### 2.3 Grade template copy — `S`

**Problem.** Each new term, faculty rebuild the same categories +
assessments per section. Copy-from-existing would save them an hour per
section.

**Data model.** None — reuses existing categories + assessments tables.

**Backend.**
- `POST /api/sections/:id/copy-template`
  body: `{ sourceSectionId: UUID }`
- Copies categories (name, weight, display_order), then assessments
  under each (name, max_score, display_order). Scores are NOT copied.
- Restrict: source must be a section the same faculty taught (or admin
  override).

**Frontend.**
- On the gradebook page when no categories exist yet: a
  "Copy from another section" link beside "Add category".
- Modal: list of the faculty's past sections, grouped by term;
  click to copy.

**Edge cases.**
- Target section already has categories → confirm overwrite or merge.
- Faculty mid-transfer (lost ownership of source section) — admin needs
  to copy on their behalf.

**Effort breakdown.** 3 h backend + 3 h frontend modal + 1 h overwrite
prompt = ~1 day.

**Dependencies.** Gradebook module.

**Open questions.**
- Copy scores too, to scaffold a "re-grade everyone on a curve" workflow?
  Probably not.

---

### 2.4 Office-hour booking — `M`

**Problem.** Students currently DM faculty to ask when they're free. The
`faculty_availability` table already knows.

**Data model.**
```sql
CREATE TABLE office_hour_bookings (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id   UUID        NOT NULL REFERENCES users(id),
  student_id   UUID        NOT NULL REFERENCES users(id),
  slot_date    DATE        NOT NULL,
  start_time   TIME        NOT NULL,
  end_time     TIME        NOT NULL,
  topic        TEXT,
  status       TEXT        NOT NULL DEFAULT 'booked'
               CHECK (status IN ('booked','attended','no_show','cancelled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);
CREATE INDEX idx_bookings_faculty_date ON office_hour_bookings(faculty_id, slot_date);
```

**Backend.**
- `GET /api/faculty/:id/office-hours?weekStart=…` — returns available
  slots (intersect `faculty_availability` of kind `office_hour` with
  existing bookings).
- `POST /api/office-hour-bookings`
- `PATCH /api/office-hour-bookings/:id` (faculty: mark attended/no_show;
  student: cancel).
- Fire a notification to faculty on booking, to student on
  cancellation/no_show.

**Frontend.**
- Student: new `/student/office-hours` page → pick a faculty (any who
  teaches them?) → see week grid → click a free slot → modal to add topic.
- Faculty: `/faculty/office-hours` showing upcoming bookings list.

**Edge cases.**
- Faculty changes availability mid-week — existing bookings should
  stay; just no new ones in the removed window.
- Student double-booking themselves (two faculty same slot) — prevent
  via index `UNIQUE (student_id, slot_date, start_time)`.
- Cancellation deadline (e.g. 2 hours before).

**Effort breakdown.** 4 h schema + 6 h backend + 8 h frontend slot picker
+ 3 h notifications = ~3 days.

**Dependencies.** Faculty availability table.

**Open questions.**
- Can students book any faculty, or only their own teachers? Affects
  load on senior faculty.
- Slot granularity (15 / 30 / 60 min)?

---

### 2.5 Bulk score import for a category — `S`

**Problem.** The current CSV importer handles one assessment at a time.
Multi-column CSV (one per assessment in a category) would be faster.

**Data model.** None.

**Backend.**
- Extend `bulkSaveScores` callers — the existing endpoint already
  handles N records; this is purely a frontend parsing change.

**Frontend.** Update `ImportScoresModal` in `Gradebook.tsx`:
- Accept a CSV with header row: `user_code, Quiz 1, Quiz 2, Quiz 3`.
- Auto-match column names to assessments in the selected category by
  case-insensitive comparison; surface unmatched columns to the user.
- Preview table now spans multiple score columns.

**Edge cases.**
- Column names with typos → fuzzy-match suggestion ("Did you mean Quiz 1?").
- Missing values per cell — leave score `null`.
- Per-cell validation (above max) → block per-cell.

**Effort breakdown.** 4 h parsing + UI rework + 2 h fuzzy matching +
2 h tests = ~1 day.

**Dependencies.** Gradebook CSV import (already shipped).

**Open questions.** None.

---

## 3. Admin operations

### 3.1 Bulk CSV user import — `M`

**Problem.** Onboarding 200 freshmen one-by-one is painful. We export
CSVs everywhere; symmetric import is the natural pair.

**Data model.** None — uses existing `users` flow.

**Backend.**
- `POST /api/users/bulk-import` — multipart/form-data, CSV file.
- Server parses with `csv-parse`, validates each row with Zod, returns:
  ```json
  {
    "valid":   [...],
    "invalid": [{ rowIndex, reason, raw }, ...],
    "summary": { total, willCreate }
  }
  ```
- Two-step UX: client uploads → server returns preview; client confirms →
  server actually creates. Allows the user to fix problems before
  committing.
- Wrap the create batch in a transaction so partial failures roll back.

**Frontend.**
- `/admin/users` gains an "Import CSV" button next to "New user".
- Modal flow: file picker → preview table with row-level
  ✓/✗ status → "Import N valid rows" button.

**Edge cases.**
- Duplicate emails in the file or vs. existing users.
- Required columns: `email, full_name, role`. Optional: `branch, program_code`.
- Block capacity: importing 60 freshmen when blocks only hold 50 needs
  multi-block fanout — reuse `pickRandomBlock`.
- Default password applied (per shipped feature).

**Effort breakdown.** 4 h parsing/validation + 6 h preview UI + 4 h
transaction + edge cases + 2 h tests = ~2 days.

**Dependencies.** Default-password feature (shipped).

**Open questions.**
- Should the import generate a downloadable "credentials" CSV (codes +
  default password) for offline distribution?

---

### 3.2 Bulk enrollment via CSV — `S`

**Problem.** Same shape as 3.1 but for the irregular-student enrollment
flow. Useful for transferees and re-takers.

**Data model.** None.

**Backend.** `POST /api/enrollments/bulk-import` — rows of
`user_code, section_code`. Returns the same preview/confirm shape as 3.1.

**Frontend.** New button on `/admin/enrollments` mirroring the user
import flow.

**Edge cases.**
- Section is full / closed.
- Student already enrolled.
- Section term inactive.

**Effort breakdown.** 1 day, reusing parse/validate scaffolding from 3.1.

**Dependencies.** 3.1 strongly preferred (shared component).

---

### 3.3 Room as entity — `M`

**Problem.** `sections.room` is free-text. Two faculty can book the same
room same time and nothing complains.

**Data model.**
```sql
CREATE TABLE rooms (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code       TEXT        NOT NULL UNIQUE,    -- 'R201', 'CL2'
  name       TEXT,                            -- 'Computer Lab 2'
  building   TEXT,
  capacity   INT,
  notes      TEXT,
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE sections ADD COLUMN room_id UUID REFERENCES rooms(id);
-- Keep `room` text for one term as a migration aid, then drop.
```

**Migration plan.** Backfill: extract distinct `sections.room` strings,
INSERT as rooms, then UPDATE sections to point at them. Drop the text
column after a sanity check.

**Backend.**
- CRUD for rooms (`/api/rooms`).
- `updateSection` adds a conflict check: another section in the same
  term with the same `room_id` and overlapping schedule → reject.

**Frontend.**
- New admin page `/admin/rooms` — list / create / edit / archive.
- Section edit modal: dropdown of rooms with capacity hint, replacing
  the free-text input.
- Optional: room-centric calendar view (item 3.4-ish — see "auto-assign").

**Edge cases.**
- Free-text rooms can't be cleanly migrated when they're typos ("rm 201"
  vs "Room 201"). Migration assistant: present unique strings to the
  admin and let them merge.
- Capacity warnings when section capacity > room capacity.

**Effort breakdown.** 3 h schema + migration + 4 h backend conflict
check + 6 h CRUD UI + 3 h section edit rework = ~2 days.

**Dependencies.** None.

---

### 3.4 Auto-assign faculty + schedule — `L`

**Problem.** After "Open Term", admin manually picks faculty + time for
each TBA section. With dozens of sections this is hours of work and
error-prone.

**Data model.** None.

**Algorithm.** Constraint satisfaction:
- Hard constraints: faculty `availability` of kind `teaching`, no
  schedule overlap, room availability (post-3.3).
- Soft constraints: faculty department/specialty match (would need a
  `faculty_specialties` table), faculty load balance (units per week),
  preference for grouped days (MWF over TThS).
- Approach: greedy heuristic that orders sections by constraint
  tightness (fewest possible faculty first), assigns, backtracks on
  conflict. CSP libraries exist (`csps` npm) but a hand-rolled greedy is
  usually enough for ~100 sections.

**Backend.**
- `POST /api/sections/auto-assign?termId=…&dryRun=true` — returns a
  proposed assignment without applying.
- `POST /api/sections/auto-assign?termId=…&dryRun=false&strategy=…` —
  applies.
- A `strategy` enum (`balanced`, `prefer-grouped-days`, `prefer-mornings`).

**Frontend.**
- Admin Sections page: new "Auto-assign" button at the term level.
- Modal: strategy selector → run dry-run → preview diff (rows: section,
  current state, proposed state) → "Apply" button.

**Edge cases.**
- Infeasible: not enough faculty hours for the section load. Report
  unfilled sections with reason.
- Existing assignments — option to lock them and only fill TBA.
- Audit logging — one row per section that changed.

**Effort breakdown.** 1 d algorithm prototype + 1 d backend service +
1 d preview UI + 1 d edge cases + 1 d audit/permissions = ~5 days.

**Dependencies.** Item 3.3 (rooms) strongly preferred.

**Open questions.**
- Faculty specialties data model — even a free-text `faculty.expertise`
  jsonb column buys a lot for v1.
- Lock recently-changed sections so the algorithm doesn't churn them.

---

### 3.5 Audit-log actor timeline — `S`

**Problem.** Compliance question: "what has user X done this term?"
Today the audit log filters by action/entity/date but not by actor in a
focused timeline view.

**Data model.** None — `audit_logs.user_id` already exists.

**Backend.**
- `GET /api/audit-logs/users/:id?from=…&to=…&limit=…` — flat list
  filtered to one actor, newest first.

**Frontend.**
- On the admin Users table, add a "View activity" row action that opens
  a side panel with a timeline.
- On the Audit Log page, an actor's name in any row links to the
  timeline.

**Edge cases.**
- System actions (`user_id IS NULL`) — exclude from any user-scoped view.
- High-volume actors (faculty entering scores) — paginate.

**Effort breakdown.** 2 h backend + 4 h frontend timeline component +
1 h linking = ~1 day.

**Dependencies.** Audit log module (already shipped).

---

### 3.6 Past-term archive — `M`

**Problem.** Two years from now, the `enrollments` table has hundreds of
thousands of rows of stale data weighing down every query.

**Data model.**
```sql
CREATE TABLE enrollments_archive ( LIKE enrollments INCLUDING ALL );
CREATE TABLE sections_archive    ( LIKE sections    INCLUDING ALL );
CREATE TABLE scores_archive      ( LIKE scores      INCLUDING ALL );
-- Plus indexes on (student_id, term_id) for transcript queries.
```

**Backend.**
- `POST /api/admin/archive-term/:termId` — move rows for one term into
  `*_archive` tables in a transaction. Updates a `terms.archived_at`
  timestamp.
- Transcript / TOR endpoints UNION the live + archive tables (use a
  view: `CREATE VIEW enrollments_all AS SELECT … FROM enrollments UNION
  ALL SELECT … FROM enrollments_archive`).
- Default list endpoints filter `archived_at IS NULL` on the terms join.

**Frontend.**
- Admin Terms page: "Archive" action on terms whose `end_date` < 1 year
  ago.
- A confirmation modal showing row counts that will move.

**Edge cases.**
- Active grade appeals on archived terms — leave appeal rows live but
  reference archived enrollment.
- Restore action — possible but rare; ship as admin-only one-off SQL.

**Effort breakdown.** 4 h schema + 6 h backend movement logic + 4 h
view-based reads + 3 h UI = ~2 days.

**Dependencies.** None, but should land *before* the system has years
of accumulated data.

**Open questions.**
- Archive students who haven't enrolled in 2+ years too? Or keep their
  records live? Probably keep — students may come back.

---

## 4. Academic workflows

### 4.1 Incomplete (INC) grades + completion deadline — `M`

**Problem.** PH rule: a student with INC has one year to complete or it
becomes 5.00. We currently can't even represent INC.

**Data model.**
```sql
ALTER TABLE enrollments ADD COLUMN inc_deadline DATE;
ALTER TABLE enrollments ADD COLUMN inc_completed_at TIMESTAMPTZ;
-- letter_grade already accommodates 'INC' as a string.
```

**Backend.**
- `finalizeGrades` accepts `letterGrade: 'INC'` for individual students.
  Sets `inc_deadline = finalized_at + interval '1 year'` and leaves
  `numeric_grade NULL`.
- New `POST /api/enrollments/:id/complete-inc` (faculty owner) →
  promotes to a real grade.
- Cron-style daily job (call from a scheduled HTTP endpoint, or simple
  SQL on read): any `inc_deadline < now()` and `inc_completed_at IS
  NULL` → flip `letter_grade = '5.00'`, fire a notification.

**Frontend.**
- Gradebook finalize modal: gain a per-student "Mark INC" toggle.
- Student grades page: INC rows show countdown.
- Faculty section view: "INC tracker" widget listing pending INCs.

**Edge cases.**
- Faculty changes section after issuing INC → ownership of the
  completion action passes to the new faculty.
- Multiple INCs per student across terms — independent timers.

**Effort breakdown.** 3 h schema + 6 h backend (incl. deadline job) +
6 h frontend = ~2 days.

**Dependencies.** Notifications.

**Open questions.**
- Daily job how — `pg_cron`, Render's cron, or a query-time check that
  flips on read? Query-time is the simplest, runs on every grades-read.

---

### 4.2 Grade appeals — `M`

**Problem.** Students should be able to formally appeal a final grade.
Today this is paper / email.

**Data model.**
```sql
CREATE TABLE grade_appeals (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID        NOT NULL REFERENCES enrollments(id),
  student_id    UUID        NOT NULL REFERENCES users(id),
  reason        TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','faculty_review','dean_review','resolved','withdrawn')),
  faculty_note  TEXT,
  dean_note     TEXT,
  outcome       TEXT,                       -- 'grade_changed','denied','withdrawn'
  resolved_grade TEXT,                      -- new letter grade if changed
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ
);
```

**Backend.** Routes per role to advance the workflow + notification
fanout at each state change. State machine:
`pending → faculty_review → dean_review → resolved | withdrawn`.

**Frontend.** Three role-scoped views with a Kanban-ish status display.

**Edge cases.**
- Time-bounded: appeals only allowed within 14 days of finalize.
- Grade change rewrites `enrollments.letter_grade` and the GWA recompute
  cascades.
- Audit log every state change with the actor.

**Effort breakdown.** 4 h schema + 8 h backend state machine + 12 h
3-role UI + 4 h notifications/audit = ~3 days.

**Dependencies.** Notifications.

**Open questions.**
- Need a `dean` role? Currently we only have `admin`. Could either add a
  role or have admins act as dean.

---

### 4.3 Honor roll / Dean's List auto-compute — `S`

**Problem.** Students with GWA ≤ 1.50 (or 1.75) for a term should
automatically appear on a list.

**Data model.**
```sql
CREATE TABLE term_honors (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID        NOT NULL REFERENCES users(id),
  term_id     UUID        NOT NULL REFERENCES terms(id),
  gwa         NUMERIC(4,2) NOT NULL,
  category    TEXT        NOT NULL,         -- 'presidents','deans','honors'
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, term_id)
);
```

**Backend.**
- `POST /api/admin/term/:id/compute-honors` — runs the aggregation:
  for every student with all term enrollments finalized and a min unit
  load (e.g. 15), compute GWA → bucket → insert.
- Make `finalizeGrades` opportunistically re-run this for that student
  to keep the table fresh.

**Frontend.**
- Admin: term page → "Compute honors" button + a table per category.
- Student dashboard: "President's List" / "Dean's List" badge near GWA.
- Public page (optional): `/honors/:termId` for celebration.

**Edge cases.**
- Failing one subject disqualifies regardless of GWA.
- Underloaded (< 15 units) → not eligible.
- INC → not yet eligible (skip until completed).

**Effort breakdown.** 2 h schema + 3 h backend aggregation + 3 h
frontend = ~1 day.

**Dependencies.** Finalize-grades flow.

---

### 4.4 Add/drop window enforcement — `S`

**Problem.** Enrollments are mutable forever. We need a window after
which a section change requires a formal "withdraw" entry.

**Data model.**
```sql
ALTER TABLE terms
  ADD COLUMN add_drop_deadline DATE,
  ADD COLUMN withdraw_deadline DATE;
```

**Backend.** Update `createEnrollment` / `updateEnrollment`:
- Before `add_drop_deadline`: any change allowed.
- Between add/drop and withdraw: only `dropped` → record as `withdraw`
  status (new enrollment_status?) or annotate.
- After withdraw deadline: reject changes (admin override possible).

**Frontend.** Admin Term form: two new date pickers. Enrollments page:
status pills show "Withdrawn" vs "Dropped".

**Edge cases.**
- Force-enroll by admin always allowed but audit-logged with `force=true`.

**Effort breakdown.** 1 h schema + 4 h backend logic + 2 h UI = ~1 day.

**Dependencies.** None.

**Open questions.**
- Add a new `withdrawn` value to `enroll_status` enum, or piggyback on
  `dropped`? Cleaner to add it.

---

### 4.5 Prerequisite enforcement at enrollment — `S`

**Problem.** `course_prerequisites` exists in schema but the enrollment
endpoint doesn't check it.

**Backend.** Inside `createEnrollment`:
- Resolve the section → course → prereq course IDs.
- Check the student has a passing (`letter_grade <= 3.00`) prior
  enrollment for each prereq course.
- Reject with 409 + actionable message ("Missing CS101").

**Frontend.** Admin Enrollments modal surfaces the error. Curriculum
visualization (item under student curriculum) already shows the locked
state, so this is mostly enforcement parity.

**Edge cases.**
- Admin override (current term equivalent, transfer credit) — flag as
  `prerequisite_override` in audit log.
- Multiple equivalent prereqs (`CS101a OR CS101b`) — current schema
  only models AND; future-proof by treating empty prereq list = unlocked
  and a `prereq_group` column for OR semantics.

**Effort breakdown.** 4 h backend + 2 h tests + 1 h UI surfacing = ~1 day.

**Dependencies.** Existing prereq table.

---

## 5. Analytics & dashboards

### 5.1 Cohort retention chart — `M`

**Problem.** "Of 60 freshmen in BSCS 2022, how many are still active?"
is the question that funds school decisions.

**Backend.** `GET /api/admin/analytics/retention?programId=…&startYear=…`
returns rows per cohort year with counts for `active`, `graduated`,
`dropped`, `transferred`.

**Frontend.** Admin dashboard adds a "Retention" tab with stacked-area
chart (recharts or @visx). Filters per program / start year.

**Edge cases.**
- Students who transferred in (no original cohort year) — separate bucket.
- Year-leveled-up students count under their original cohort.

**Effort breakdown.** 6 h queries + 8 h chart UI + 2 h filters = ~2 days.

---

### 5.2 Faculty teaching-load report — `S`

**Problem.** Easy way to spot overloaded faculty per term.

**Backend.** `GET /api/admin/faculty-load?termId=…` returns rows per
faculty: total units, hours/week, number of sections, with a flag if >
threshold (e.g. 24 units).

**Frontend.** New tab on admin Dashboard, table with sortable columns.

**Effort breakdown.** 3 h query + 4 h UI = ~1 day.

---

### 5.3 Section fill rates — `S`

**Problem.** Spot under-enrolled offerings to consolidate or open more
to spread demand.

**Backend.** `GET /api/admin/section-fill?termId=…` returns
`section_code, enrolled, capacity, pct` rows.

**Frontend.** Admin Sections page gains a "Fill rates" chip filter or
sortable column. Optional histogram on the dashboard.

**Effort breakdown.** ~5 h.

---

### 5.4 Average GWA per program / cohort — `S`

**Problem.** Trend signal for program quality / cohort strength.

**Backend.** `GET /api/admin/gwa-stats?programId=…&groupBy=cohort|term`.

**Frontend.** Dashboard widget — small multiples per program.

**Effort breakdown.** ~5 h.

---

## 6. Security & polish

### 6.1 Force password change on first login — `S`

**Problem.** Default password `1.PolytechnicU` is fine *if* users
change it. They rarely will unless forced.

**Data model.**
```sql
ALTER TABLE users ADD COLUMN password_must_change BOOLEAN NOT NULL DEFAULT false;
```

Set `true` on user creation and reset to `false` after a successful
password change.

**Backend.**
- `createUser` sets `password_must_change = true`.
- `changePassword` clears it.
- `GET /api/auth/me` exposes the flag.

**Frontend.**
- A guard: if `me.password_must_change`, redirect to `/account` (or a
  dedicated `/account/change-password`) and disable other routes via a
  banner overlay.
- Banner copy: "Welcome — please change your default password to
  continue."

**Edge cases.**
- Admin resetting another user's password should also set
  `password_must_change = true`.

**Effort breakdown.** 1 h schema + 2 h backend + 3 h guard/UI = ~1 day.

**Dependencies.** Default password (shipped).

---

### 6.2 Login history / device list — `M`

**Problem.** "Was that login at 3 AM really me?" — currently
unanswerable.

**Data model.**
```sql
CREATE TABLE login_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip          INET,
  user_agent  TEXT,
  success     BOOLEAN     NOT NULL,
  failure_reason TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_events_user_time ON login_events(user_id, created_at DESC);
```

**Backend.** `auth.login` inserts on every attempt (success + fail).
`GET /api/auth/me/logins?limit=50` returns recent events for the caller.

**Frontend.** Account page gains a "Recent logins" table with IP,
location guess (geoip-lite or skip), device hint (parse UA briefly).

**Edge cases.**
- Brute-force detection — after 5 failures from same IP in 10 min,
  rate-limit. Out of scope for v1, but the data unlocks it.
- IP behind proxy — store `X-Forwarded-For` first IP.

**Effort breakdown.** 2 h schema + 3 h backend + 4 h frontend + 2 h
rate-limit hook = ~1.5 days.

---

### 6.3 2FA (TOTP) — `M`

**Problem.** Admin accounts especially benefit from authenticator-app
2FA. Standard practice for school admin systems.

**Data model.**
```sql
ALTER TABLE users
  ADD COLUMN totp_secret TEXT,         -- base32-encoded
  ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE totp_recovery_codes (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT        NOT NULL,
  used_at   TIMESTAMPTZ
);
```

**Backend.** `speakeasy` npm lib for TOTP. Flow:
- `POST /api/auth/2fa/setup` → generates a secret + 8 recovery codes,
  returns provisioning URI for QR.
- `POST /api/auth/2fa/verify` body `{ code }` → marks `totp_enabled =
  true`, returns recovery codes (last time they're shown).
- Login: if `totp_enabled`, after password OK, return a short-lived
  pre-auth token; client posts `{ preAuthToken, code }` to
  `/api/auth/2fa/login` for the real JWT.
- `POST /api/auth/2fa/disable` (requires current TOTP).

**Frontend.** Account page → security section with enrollment flow,
QR code (qrcode.js), recovery codes display. Login screen gains a
second step.

**Edge cases.**
- Lost device → admin can disable on someone else's account, audited.
- Time drift — `speakeasy` allows ±1 step (30 s window).

**Effort breakdown.** 6 h backend + 8 h UI (setup + login + recovery) +
3 h audit/edge cases = ~2.5 days.

**Dependencies.** None.

**Open questions.**
- Mandatory for admins, optional for everyone else?

---

### 6.4 Global command palette (Cmd+K) — `M`

**Problem.** Admins navigate the app many times a day; a typeahead jump
is a big productivity win.

**Data model.** None.

**Backend.** `GET /api/search?q=…&types=users,sections,courses` —
unified search across the three entities, returns 10 best matches.

**Frontend.**
- New `CommandPalette.tsx` component triggered on Cmd/Ctrl+K, ⌘
  shortcut.
- Two modes: navigation (start with `>`) showing app routes, and search
  (no prefix) hitting the API.
- Debounce queries 200 ms.

**Edge cases.**
- Permissions — students should only search their own data; the API
  filters by role.
- Empty state should show recent actions.

**Effort breakdown.** 1 day search API + 1 day UI = ~2 days.

---

### 6.5 Dark mode — `S`

**Problem.** Eye-strain at night, preference accessibility.

**Backend.** None.

**Frontend.**
- Tailwind `darkMode: 'class'` in config.
- Add dark variants to every color used. The beige/olive palette
  inverts cleanly to slate/olive-bright.
- A toggle in the topbar that writes to `localStorage` and applies
  `class="dark"` on `<html>`.

**Edge cases.**
- Print stylesheet should force light.
- Charts (item 5) need explicit dark palette.

**Effort breakdown.** ~6 h.

---

### 6.6 Code-split the bundle — `S`

**Problem.** Vite warns at ~520 kB initial bundle. First-paint suffers
on mobile data.

**Backend.** None.

**Frontend.**
- `React.lazy(() => import(…))` on every top-level route in `App.tsx`.
- Suspense boundary around `<Outlet />` with a skeleton.
- Move `react-query` devtools (if added later) to dev-only build.

**Effort breakdown.** 2 h lazy + 1 h Suspense polish + 1 h test = ~4 h.

**Dependencies.** None.

---

## 7. Long-tail — skip unless asked

These either don't fit the SIS domain or carry a large hidden cost.

- **Tuition / fees module** — separate accounting domain. Real-money
  flows demand audit hardness (double-entry, reconciliation, refunds)
  far beyond the rest of the app.
- **Direct messaging between users** — moderation burden, low SIS
  value. Use chat tools already in the school's stack.
- **Mobile app (RN / native)** — the responsive web already covers
  mobile. Native only matters for push notifications + offline, neither
  of which is critical here.
- **Real-time presence ("who's online")** — fun, low value. Use sparingly.
- **AI-graded essays** — interesting but a separate product surface
  with its own ethical considerations.

---

## 8. Recommended next phase

A coherent **"Phase 9: post-grade flow"** pairing three small features
that strengthen all three role surfaces:

1. **Force password change on first login** (6.1) — closes the loop on
   the default-password feature already shipped.
2. **Section announcements** (2.2) — gives faculty a one-to-many
   channel, reuses notifications module.
3. **Certificate of Enrollment PDF** (1.1) — student self-service for
   the most-requested document and lays the PDF foundation for Form
   137 / 138 / TOR later.

**Combined effort:** ~3 days. Each piece is independently shippable, so
slice as preferred.

**Why this set together:**
- They cover all three roles (admin sets up forced password reset,
  faculty posts announcements, students download COE).
- They share zero risky changes — no schema migrations beyond two
  optional new tables, no breaking auth changes.
- They open future doors: PDF infra unlocks Form 137 / 138 / TOR;
  announcements pattern unlocks broader broadcast features.
