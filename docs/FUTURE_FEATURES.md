# Future Features

A backlog of features for the SIS (PH higher-ed context, block-based cohorts,
PH grade scale, role-based access). Updated as features ship — each entry
is marked **✅ Shipped**, **🟡 Partial**, or left plain (= not yet built).

Shipped entries keep a one-line note pointing to where the code lives. Unbuilt
entries keep the full spec (problem, data model, backend, frontend, edge
cases, effort, dependencies, open questions) so anyone can pick them up cold.

**Effort tags:** `S` = ≤ 1 day · `M` = 1–3 days · `L` = 1+ weeks.

For the full list of what's *already* in the codebase, see
[`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md). This file is the **forward**
view.

---

## Table of contents

1. [Student-facing services](#1-student-facing-services)
2. [Faculty productivity](#2-faculty-productivity)
3. [Admin operations](#3-admin-operations)
4. [Academic workflows](#4-academic-workflows)
5. [Analytics & dashboards](#5-analytics--dashboards)
6. [Security & polish](#6-security--polish)
7. [Long-tail (skip unless asked)](#7-long-tail--skip-unless-asked)
8. [New ideas surfaced during build](#8-new-ideas-surfaced-during-build)
9. [Recommended next phase](#9-recommended-next-phase)

---

## 1. Student-facing services

### 1.1 ✅ Certificate of Registration (COR) PDF — `S` — SHIPPED

Built. Lives at `/student/cor` with PDF download. Renderer in
`apps/backend/src/lib/pdf/cor.ts`. The original spec called this "Certificate
of Enrollment" — we built it as **Certificate of Registration** at the
user's request, with landscape A4 layout including school header,
student info card, full subjects table, and registrar signature line.

### 1.2 Form 137 / 138 / TOR templates — `M`

**Problem.** Formal academic record exports (Form 137 = secondary
permanent record, Form 138 = report card, TOR = official transcript) are
the canonical PH school documents. We already compute every number; this
is mostly a templating exercise. CSV transcript export is in place but
the formal PDF templates aren't.

**Data model.** No new tables. A `transcript_serial_seq` sequence for TOR
copies. Optionally a `tor_release` table tracking who requested and when
(for the clearance feature, item 1.5).

**Backend.**
- `GET /api/students/me/transcript/tor.pdf` (auth: student or admin).
- `GET /api/students/:id/form137.pdf` (auth: admin).
- `GET /api/students/:id/form138.pdf` (auth: admin or faculty for own
  sections).
- One shared layout component, three flavors. The PDF generator should be
  factored as `lib/pdf/transcripts.ts` with helpers per form type. The
  existing `lib/pdf/cor.ts` lays the foundation — copy its structure.

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

**Dependencies.** COR (1.1, shipped) — the PDF infra is already there.

**Open questions.**
- Does the registrar require physical wet-signature on TOR? If yes,
  generate a *draft* watermark on student-pulled copies and a clean version
  on admin-pulled.
- Need school logo, registrar signature image, dry-seal scan.

### 1.3 ✅ Class schedule `.ics` export — `S` — SHIPPED

Built. "Add to calendar" button on `/student/schedule`. Renderer in
`apps/backend/src/lib/ics/schedule.ts`. One VEVENT per (section × meeting
day) with WEEKLY RRULE, anchored to `Asia/Manila`. Stable UIDs so
re-imports update events in place.

**Still deferred (optional):** subscription URL with short-lived
per-student JWT so calendars auto-refresh after schedule changes. Estimated
1 h. Useful when sections get reassigned mid-term.

### 1.4 ✅ Pre-registration / wish-list — `M` — SHIPPED

Built. Student page `/student/wishlist` lets students browse curriculum
courses and add them with priority 1-5. Admin sees per-course demand
counts via the **See wishlist demand** modal on each term card in
`/admin/terms`. Locks automatically once the registrar opens the target
term.

**Companion feature shipped:** **Self-enlistment / confirm enrollment**.
When admin opens a term, students get `status='pending'` enrollments
(not `'enrolled'`). They must explicitly confirm via the COR page banner
before sections appear in their schedule. This replaces the simpler
"auto-enroll" pattern.

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
- `GET /api/students/me/clearance?termId=…` — student view.
- `GET /api/admin/clearance/:departmentId` — staff view; needs a new role
  `clearance_officer` or department-scoped permission.
- `PATCH /api/admin/clearance/:recordId` — flip status.
- Auto-create pending records for every active student × active
  department when a term opens (extend `openTerm`).

**Frontend.**
- Student: `/student/clearance` page (or a card on Account).
- Admin: a department-scoped page listing students with their status.
- **Critical:** TOR / transcript download endpoints (item 1.2) check
  clearance status; block with a clear message if not cleared.

**Edge cases.**
- Departments can be added/disabled mid-term.
- Past-term clearance is read-only.
- Graduated students need a final clearance round.

**Effort breakdown.** 4 h schema + 6 h backend + 6 h frontend + 4 h
permissions/role glue = ~3 days.

**Dependencies.** New role or permission model (currently flat
`admin/faculty/student`).

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
- `GET /api/sections/:id/attendance` — sessions + records for the faculty
  owner.
- `POST /api/sections/:id/attendance/sessions` — create session for a date
  (default: today).
- `PUT /api/sections/:id/attendance/sessions/:sid/records` — bulk upsert
  (same pattern as `bulkSaveScores`).
- `GET /api/students/me/attendance` — student view.

**Frontend.**
- New tab on the gradebook page: "Attendance" sibling to "Scores".
- Roster-shaped grid: rows = students, columns = session dates with a
  toggle button (cycles P → L → A → blank).
- Quick action: "Mark all present" then adjust outliers.

**Edge cases.**
- Sessions on days the section doesn't meet (per `day_of_week`) should
  warn but not block.
- Editing past sessions allowed but flagged in audit log.
- "Fill missing sessions through today" button.

**Effort breakdown.** 4 h schema + 6 h backend + 8 h frontend + 3 h
student view + 3 h audit/edges = ~3 days.

**Dependencies.** Existing gradebook / roster patterns.

**Open questions.**
- Excused absence flow — student requests + faculty approves, or just a
  faculty flag?
- Should attendance auto-affect grades (e.g. 3 absences = 0.25 deduction)?

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
- Fan out via `notifications.service` (`kind: 'announcement'`) to all
  enrolled students.

**Frontend.**
- New tab on the gradebook page: "Announcements" with a compose box and a
  reverse-chronological list.
- Student dashboard gains a small "Latest announcements" card.
- `NotificationBell.tsx` already handles any new kind; add a visual treatment.

**Edge cases.**
- Author leaves the section (faculty reassignment) — keep the
  announcement, mark the author as historical.
- Long body: enforce a 4 KB cap or use a textarea + markdown.

**Effort breakdown.** 2 h schema + 3 h backend + 4 h frontend + 1 h
notification glue = ~1.5 days.

**Dependencies.** Notifications module (shipped).

**Open questions.**
- Markdown or plain text? Markdown is cheap with `marked` but expands
  XSS attack surface — `DOMPurify` mitigates.
- Allow attachments (PDFs)? Out of scope for v1.

### 2.3 Grade template copy — `S`

**Problem.** Each new term, faculty rebuild the same categories +
assessments per section. Copy-from-existing would save them an hour per
section.

**Backend.** `POST /api/sections/:id/copy-template` body
`{ sourceSectionId: UUID }`. Copies categories + assessments. Scores are
NOT copied. Restrict: source must be a section the faculty taught (or
admin override).

**Frontend.** On the gradebook page when no categories exist yet: a
"Copy from another section" link beside "Add category". Modal lists the
faculty's past sections grouped by term.

**Edge cases.**
- Target section already has categories → confirm overwrite or merge.
- Faculty mid-transfer (lost ownership of source) — admin override.

**Effort breakdown.** ~1 day.

**Dependencies.** Gradebook module.

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
- `GET /api/faculty/:id/office-hours?weekStart=…` — available slots.
- `POST /api/office-hour-bookings`
- `PATCH /api/office-hour-bookings/:id` (cancel / mark attended).
- Notification on booking + cancellation.

**Frontend.**
- Student: `/student/office-hours` page with weekly slot picker.
- Faculty: `/faculty/office-hours` showing upcoming bookings list.

**Edge cases.**
- Faculty changes availability mid-week — existing bookings stay.
- Student double-booking themselves — `UNIQUE (student_id, slot_date, start_time)`.
- Cancellation deadline (e.g. 2 hours before).

**Effort breakdown.** ~3 days.

**Dependencies.** Faculty availability (shipped).

**Open questions.**
- Can students book any faculty, or only their own teachers?
- Slot granularity (15 / 30 / 60 min)?

### 2.5 Bulk score import for a category — `S`

**Problem.** The current CSV importer handles one assessment at a time
(already shipped). Multi-column CSV (one per assessment in a category)
would be faster.

**Backend.** Extend `bulkSaveScores` callers — endpoint handles N
records; only frontend parsing changes.

**Frontend.** Update `ImportScoresModal` in `Gradebook.tsx` to accept a
CSV with header row `user_code, Quiz 1, Quiz 2, Quiz 3`. Auto-match
column names to assessments in the selected category.

**Edge cases.**
- Column-name typos → fuzzy-match suggestion.
- Per-cell validation (above max) → block per-cell.

**Effort breakdown.** ~1 day.

**Dependencies.** Gradebook CSV import (already shipped).

---

## 3. Admin operations

### 3.1 ✅ Bulk CSV user import — `M` — SHIPPED

Built. **Import CSV** button on `/admin/users`. Two-stage flow: client
parses CSV → posts to `/users/bulk-import/preview` → server validates
(Zod + DB dupe checks + program lookup) → admin reviews preview table
with ✓/✗ status → posts to `/users/bulk-import/apply`. Per-row failures
reported; partial success supported.

**Companion: CSV export shipped on every admin table** (Users, Courses,
Enrollments, Sections, Audit log) via shared `lib/csv.ts` helper.

### 3.2 Bulk enrollment via CSV — `S`

**Problem.** Same shape as 3.1 but for the irregular-student enrollment
flow. Useful for transferees and re-takers.

**Backend.** `POST /api/enrollments/bulk-import` — rows of
`user_code, section_code`. Returns the same preview/confirm shape as 3.1.

**Frontend.** New button on `/admin/enrollments` mirroring the user
import flow. Reuse `BulkUserImportModal` as a template.

**Edge cases.**
- Section full / closed.
- Student already enrolled.
- Section's term inactive.

**Effort breakdown.** 1 day (reusing parse/validate scaffolding from 3.1).

**Dependencies.** 3.1 (shipped).

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
```

**Migration plan.** Backfill: extract distinct `sections.room` strings,
INSERT as rooms, then UPDATE sections to point at them. Drop the text
column after a sanity check.

**Backend.**
- CRUD for rooms (`/api/rooms`).
- `updateSection` adds a room-conflict check.
- **Important:** Extend the auto-assigner (3.4, shipped) to track room
  schedules too — currently it only tracks faculty and block conflicts.

**Frontend.**
- Admin `/admin/rooms` — list / create / edit / archive.
- Section edit modal: dropdown of rooms with capacity hint.
- Optional: room-centric calendar view.

**Edge cases.**
- Free-text rooms can't be cleanly migrated when they're typos — present
  unique strings to the admin and let them merge.
- Capacity warnings when section capacity > room capacity.

**Effort breakdown.** ~2 days.

**Dependencies.** None blocking; auto-assigner will need a small extension.

### 3.4 ✅ Auto-assign faculty + schedule — `L` — SHIPPED

Built. **Auto-assign sections** button on `/admin/sections`. Greedy
solver in `apps/backend/src/modules/sections/auto-assign.service.ts`
with constraint-tightness ordering. Hard constraints: qualification,
availability, faculty conflict, **block conflict** (added later when we
found students were being scheduled into overlapping classes), load cap.
Soft constraints by strategy: balanced / prefer-grouped-days /
prefer-mornings.

**Companion shipped:** `/faculty/subjects` page lets faculty self-declare
which courses they can teach (preference 1-5) + their max teaching units
cap. Required infrastructure for the auto-assigner.

**Still TODO once 3.3 lands:** add `room_id` to the constraint set so
the assigner doesn't double-book rooms.

### 3.5 Audit-log actor timeline — `S`

**Problem.** Compliance question: "what has user X done this term?"
Today the audit log filters by action/entity/date but not by actor in a
focused timeline view.

**Backend.** `GET /api/audit-logs/users/:id?from=&to=&limit=` — flat list
filtered to one actor, newest first.

**Frontend.** On the admin Users table, add a "View activity" row action
that opens a side panel with a timeline. On the Audit Log page, an
actor's name in any row links to the timeline.

**Edge cases.**
- System actions (`user_id IS NULL`) — exclude from user-scoped view.
- High-volume actors — paginate.

**Effort breakdown.** ~1 day.

**Dependencies.** Audit log module (shipped).

### 3.6 Past-term archive — `M` ✅ SHIPPED

**Problem.** Two years from now, the `enrollments` table has hundreds of
thousands of rows of stale data weighing down every query.

**Data model.**
```sql
CREATE TABLE enrollments_archive ( LIKE enrollments INCLUDING ALL );
CREATE TABLE sections_archive    ( LIKE sections    INCLUDING ALL );
CREATE TABLE scores_archive      ( LIKE scores      INCLUDING ALL );
```

**Backend.**
- `POST /api/admin/archive-term/:termId` — move rows for one term into
  `*_archive` tables in a transaction. Updates a `terms.archived_at` ts.
- Transcript / TOR endpoints UNION live + archive (use a view).
- Default list endpoints filter `archived_at IS NULL`.

**Frontend.**
- Admin Terms page: "Archive" action on terms whose `end_date` is > 1
  year ago.
- Confirmation modal showing row counts that will move.

**Edge cases.**
- Active grade appeals on archived terms — keep appeal rows live.
- Restore action — possible but rare; ship as admin-only one-off SQL.

**Effort breakdown.** ~2 days.

**Dependencies.** None, but should land *before* the system has years of
accumulated data.

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
- New `POST /api/enrollments/:id/complete-inc` (faculty owner).
- Query-time check (or daily cron via `pg_cron`): any
  `inc_deadline < now()` and `inc_completed_at IS NULL` → flip to
  `letter_grade = '5.00'`.

**Frontend.**
- Gradebook finalize modal: per-student "Mark INC" toggle.
- Student grades page: INC rows show countdown.
- Faculty section view: "INC tracker" widget listing pending INCs.

**Edge cases.**
- Faculty changes section after issuing INC → completion ownership
  passes to new faculty.
- Multiple INCs per student across terms — independent timers.

**Effort breakdown.** ~2 days.

**Dependencies.** Notifications (shipped).

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
  outcome       TEXT,
  resolved_grade TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ
);
```

**Backend.** State machine `pending → faculty_review → dean_review →
resolved | withdrawn`. Routes per role to advance.

**Frontend.** Three role-scoped views with Kanban-ish status display.

**Edge cases.**
- Time-bounded: appeals only within 14 days of finalize.
- Grade change rewrites `enrollments.letter_grade` and GWA recomputes.
- Audit log every state change.

**Effort breakdown.** ~3 days.

**Dependencies.** Notifications.

**Open questions.**
- Need a `dean` role? Currently we only have `admin`.

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
  category    TEXT        NOT NULL,    -- 'presidents','deans','honors'
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, term_id)
);
```

**Backend.** `POST /api/admin/term/:id/compute-honors` runs the
aggregation; opportunistically re-run inside `finalizeGrades` to keep
fresh.

**Frontend.**
- Admin: term page → "Compute honors" button + table per category.
- Student dashboard: badge near GWA.
- Public `/honors/:termId` page (optional).

**Edge cases.**
- Failing one subject disqualifies regardless of GWA.
- Underloaded (< 15 units) → not eligible.
- INC → not yet eligible.

**Effort breakdown.** ~1 day.

**Dependencies.** Finalize-grades flow.

### 4.4 Add/drop window enforcement — `S`

**Problem.** Enrollments are mutable forever. We need a window after
which a section change requires a formal "withdraw".

**Data model.**
```sql
ALTER TABLE terms
  ADD COLUMN add_drop_deadline DATE,
  ADD COLUMN withdraw_deadline DATE;
```

**Backend.** Update `createEnrollment` / `updateEnrollment`:
- Before `add_drop_deadline`: any change allowed.
- Between add/drop and withdraw: only `dropped`, marked as withdrawn.
- After withdraw deadline: reject changes (admin override possible).

**Frontend.** Admin Term form: two new date pickers. Enrollments page:
status pills distinguish "Withdrawn" vs "Dropped".

**Effort breakdown.** ~1 day.

**Open questions.**
- Add a new `withdrawn` value to `enroll_status` enum, or piggyback on
  `dropped`? Cleaner to add it.

### 4.5 Prerequisite enforcement at enrollment — `S`

**Problem.** `course_prerequisites` exists in schema but
`createEnrollment` doesn't check it.

**Backend.** Inside `createEnrollment`:
- Resolve the section → course → prereq course IDs.
- Check the student has a passing prior enrollment for each prereq.
- Reject with 409 + actionable message.

**Frontend.** Admin Enrollments modal surfaces the error. Curriculum
visualization already shows lock state.

**Edge cases.**
- Admin override (transfer credit) — flag as `prerequisite_override`.
- Multiple equivalent prereqs (`CS101a OR CS101b`) — current schema only
  models AND.

**Effort breakdown.** ~1 day.

**Dependencies.** Existing prereq table.

---

## 5. Analytics & dashboards

### 5.1 ✅ Cohort retention chart — `M` — SHIPPED

Built. `/admin/analytics` → **Cohort retention** tab. Custom SVG stacked
bar chart, optional program filter, sortable detail table. Bucketed by
the first 4 chars of `user_code`. Per cohort: active / graduated /
inactive / retention %.

### 5.2 ✅ Faculty teaching-load report — `S` — SHIPPED

Built. **Faculty load** tab. Term selector, status filter chips
(Overloaded / Normal / Light / Idle), sortable utility bar, click-row
expand to see each faculty's section list.

### 5.3 ✅ Section fill rates — `S` — SHIPPED

Built. **Section fill** tab. Distribution histogram (6 bins) + per-section
sortable table with status badges (over / full / normal / under / empty).

### 5.4 ✅ Average GWA per program / cohort — `S` — SHIPPED

Built. **Average GWA** tab. Inverted-Y line chart (so "up" reads as
"better" despite 1.00 being best). Group-by toggle (Cohort / Term).
Distribution column with President's / Dean's / Good / Warning / Failing
buckets.

---

## 6. Security & polish

### 6.1 ✅ Force password change on first login — `S` — SHIPPED

Built. `users.password_must_change` column + `PasswordChangeGate` in
`AppLayout.tsx`. Pins routing to `/<role>/account` and shows an amber
banner until the user changes their default password.

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
`GET /api/auth/me/logins?limit=50` returns recent events.

**Frontend.** Account page gains a "Recent logins" table.

**Effort breakdown.** ~1.5 days.

### 6.3 2FA (TOTP) — `M`

**Problem.** Admin accounts especially benefit from authenticator-app
2FA. Standard practice for school admin systems.

**Data model.**
```sql
ALTER TABLE users
  ADD COLUMN totp_secret TEXT,
  ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE totp_recovery_codes (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT        NOT NULL,
  used_at   TIMESTAMPTZ
);
```

**Backend.** `speakeasy` npm. Flow: setup → verify → recovery codes →
login becomes two-step.

**Frontend.** Account page security section + login flow extension.

**Effort breakdown.** ~2.5 days.

**Open questions.** Mandatory for admins, optional for everyone else?

### 6.4 Global command palette (Cmd+K) — `M`

**Problem.** Admins navigate the app many times a day; a typeahead jump
is a big productivity win.

**Backend.** `GET /api/search?q=…&types=users,sections,courses` —
unified search.

**Frontend.** `CommandPalette.tsx` component triggered on Cmd/Ctrl+K.
Navigation mode (start with `>`) and search mode.

**Effort breakdown.** ~2 days.

### 6.5 Dark mode — `S` ✅ SHIPPED

**Problem.** Eye-strain at night, accessibility.

**Frontend.** Tailwind `darkMode: 'class'`, add dark variants, topbar
toggle writes to `localStorage`. The beige/olive palette inverts cleanly
to slate/olive-bright.

**Effort breakdown.** ~6 h.

### 6.6 Code-split the bundle — `S`

**Problem.** Vite warns at ~620 KB initial bundle. First-paint suffers
on mobile data.

**Frontend.** `React.lazy(() => import(…))` per top-level route in
`App.tsx`. Suspense boundary around `<Outlet />` with a skeleton.

**Effort breakdown.** ~4 h.

---

## 7. Long-tail — skip unless asked

- **Tuition / fees module** — separate accounting domain. Real-money
  flows demand audit hardness far beyond the rest of the app.
- **Direct messaging between users** — moderation burden, low SIS value.
  Use school's existing chat tools.
- **Mobile app (RN / native)** — responsive web already covers mobile.
- **Real-time presence ("who's online")** — fun, low value.
- **AI-graded essays** — separate product surface with ethical concerns.

---

## 8. New ideas surfaced during build

Items the team identified mid-development that weren't in the original
backlog. Mix of small UX polish and bigger workflow features.

### 8.1 ✅ Self-enlistment / confirm enrollment — `M` — SHIPPED

Built as a richer version of the wishlist concept. `enroll_status`
gained a `pending` value; Open Term creates pending rows; students
confirm via the COR page banner. Filters across the app already required
`status = 'enrolled'`, so unconfirmed rows are invisible by design.

### 8.2 ✅ TBA auto-pass at term close — `S` — SHIPPED

Policy enforcement: when a section had no faculty assigned at term close
(registrar's failure), every still-enrolled student gets `1.00`
automatically. Per-enrollment `AUTO_PASS_TBA` audit row + student
notification. Triggered from the Terms page on each inactive term card.

### 8.3 ✅ Eye-icon password reveal toggle — `S` — SHIPPED

Reveal/hide button inside every password field (Login + Account →
change password + forced password change). Built into the shared
`InputField` component so any future password field gets it for free.

### 8.4 ✅ Block-conflict-aware auto-assign — `S` — SHIPPED

Enhancement of 3.4. Original algorithm only tracked faculty schedules,
which caused two sections in the same block to be scheduled at the same
time (different faculty, no faculty conflict). Now tracks
`Map<block_id, OccupiedSlot[]>` alongside the faculty map. Also fixed
the candidate generator to enumerate every valid start time (not just
the first), giving the algorithm fallbacks when 07:00 is locked.

### 8.5 Forgot-password flow — `S`

**Problem.** Currently a user who forgets their password has to ask an
admin to reset it via `/admin/users` (the admin enters a new password →
`password_must_change=true`). For a school with hundreds of accounts
that's manageable; for a real rollout it's a registrar bottleneck.

**Backend.** `POST /api/auth/forgot-password` with `{ userCode }`.
Without email integration (deferred), the admin gets an in-app
notification listing pending reset requests. They click "approve" →
password gets reset to the default + flagged for change.

**Frontend.** "Forgot password?" link on the login page → modal with
user-code field → confirmation toast.

**Effort breakdown.** ~1 day if admin-mediated. ~3 days if email-based
(needs item 8.6 first).

### 8.6 Email integration (Resend / SMTP) — `M`

**Problem.** Several features depend on outbound email: forgot password,
auto-share credentials on user creation, notification digests.
Implementation was started and abandoned earlier; bring it back when
ready.

**Backend.** `apps/backend/src/lib/mailer.ts` was the old location.
Pattern: fail-soft (no API key → log + skip), Resend SDK,
`sendEmail({ to, subject, html, text })`. Tied to the user-creation
flow first; later expanded to forgot-password and grade-finalize digest.

**Effort breakdown.** ~1 day for the mailer + welcome-email; ~1 day more
to wire into forgot-password.

**Open questions.**
- Provider choice (Resend / SendGrid / Brevo)?
- From-domain — verify a school domain or use the test sender?

### 8.7 Notification preferences — `S`

**Problem.** A noisy bell with no controls trains users to ignore it.
Per-kind opt-out lets users keep the signal high.

**Data model.**
```sql
CREATE TABLE notification_preferences (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind    TEXT NOT NULL,
  muted   BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, kind)
);
```

**Backend.** `GET/PUT /api/notifications/preferences`. `createMany` in
`notifications.service.ts` filters out muted kinds at fan-out time.

**Frontend.** Account page → "Notifications" section with per-kind
toggles.

**Effort breakdown.** ~6 h.

### 8.8 Student / faculty photo upload — `S`

**Problem.** The `Avatar` component falls back to colored initials. A
real photo on the COR / roster / dashboard makes the app feel less
sterile.

**Data model.** New `users.photo_url` column. Storage in Supabase
Storage bucket.

**Backend.** `POST /api/auth/me/photo` (multipart). Validate image (size,
format), upload to Supabase Storage, save URL.

**Frontend.** Account page → "Upload photo" with preview. `Avatar`
component renders `<img>` if URL present, fallback initials otherwise.

**Effort breakdown.** ~1 day.

### 8.9 Subscription URL for schedule .ics — `S`

**Problem.** The shipped 1.3 is a one-shot download. Calendars don't
auto-refresh when the schedule changes. A subscription URL with a
long-lived per-student JWT scoped only to the ICS endpoint would let
Google/Apple Calendar poll for updates.

**Backend.** `POST /api/students/me/schedule-token` returns a JWT with a
new claim (`scope: 'ics-export'`) and a long TTL. New unauthenticated
endpoint `GET /schedule/:token.ics` validates the token and emits the
same payload as the existing one-shot route.

**Frontend.** Schedule page → "Get subscription URL" → modal with the
generated URL + step-by-step "Add to Google Calendar" / "Add to Apple
Calendar" instructions.

**Effort breakdown.** ~1 h backend + 2 h UI + 1 h instructions = ~4 h.

### 8.10 CHED reporting templates — `M`

**Problem.** PH schools must submit periodic reports to CHED (the
Commission on Higher Education). Common: faculty workload report,
enrollment statistics, graduation profile. We have all the data; this
is a Word / PDF / Excel templating exercise.

**Backend.** New `apps/backend/src/lib/reports/` with one renderer per
CHED form. Likely XLSX (using `xlsx` npm) since CHED traditionally
accepts spreadsheets.

**Frontend.** Admin → new "Compliance" sidebar entry → list of available
reports.

**Effort breakdown.** ~3 days per form. Start with the most-requested.

**Open questions.**
- Which exact CHED forms? (CHED has dozens; the registrar would specify.)
- How often are they submitted?

### 8.11 Course substitution / equivalence mapping — `M`

**Problem.** Transferees take courses with different codes at other
schools; the registrar needs a way to map "this UM course is equivalent
to that other-school course" so the student gets credit.

**Data model.**
```sql
CREATE TABLE course_equivalences (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_code   TEXT        NOT NULL,        -- our course code (e.g. 'COMP002')
  external_code   TEXT        NOT NULL,        -- e.g. 'IT 101 (PLM)'
  external_school TEXT,
  notes           TEXT,
  approved_by     UUID        REFERENCES users(id),
  approved_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Backend.** CRUD endpoints. Used by curriculum-progress to mark a
course "completed" via equivalence when checking prereqs.

**Frontend.** Admin → Curriculum page → per-course "Manage equivalences"
modal.

**Effort breakdown.** ~2 days.

### 8.12 Multi-program institution — `M`

**Problem.** Currently the seed has only BSCS. A real institution has
BSCS + BSIT + BSCpE + business + nursing programs. The schema already
supports it; the practical work is making the UI not assume "BSCS"
everywhere (the Curriculum page has a program selector, but other pages
don't show multi-program filters).

**Backend.** Mostly no change — queries already accept program filters.

**Frontend.**
- Admin Dashboard widgets gain a program-filter row.
- Sections drill-down already supports program selection.
- Analytics tabs already have program filters.
- Mostly polish: make sure no hardcoded "BSCS" references exist.

**Effort breakdown.** ~2 days, mostly testing.

**Dependencies.** Probably want to seed a second program (`BSIT`?) to
exercise the multi-program flow.

### 8.13 Faculty announcements at the institution level — `S`

**Problem.** "All classes suspended Friday" needs to go to every
student + faculty. Section announcements (2.2) only fan out to enrolled
students.

**Data model.** Like section announcements but with `audience` enum
(`all_students`, `all_faculty`, `everyone`, `program:<id>`).

**Backend.** New `institution_announcements` table + fanout into
notifications.

**Frontend.** Admin Dashboard → "Post announcement" action. Sticky
banner on relevant pages.

**Effort breakdown.** ~1 day.

**Dependencies.** Section announcements (2.2) lays the pattern.

### 8.14 Refresh-the-test-DB button — `S` (admin tool)

**Problem.** When testing, you often want to wipe enrollments / scores
but keep users + programs + curriculum. Doing it via SQL is fine for
devs; bake it into the UI for QA testers.

**Backend.** `POST /api/admin/test-utils/reset-term-data` (only
available when `NODE_ENV !== 'production'`). Deletes scores, then
enrollments, then sections for a chosen term.

**Frontend.** Hidden under a feature flag — admin "Maintenance" tab.

**Effort breakdown.** ~4 h.

**Open questions.**
- Should this be permanently disabled in production builds?

---

## 9. Recommended next phase

Items 5.1–5.4 (analytics), 6.1 (forced password change), 1.1 (COR), 1.3
(.ics), 1.4 (wishlist), 3.1 (CSV import), 3.4 (auto-assign) are
**all shipped**. The most impactful remaining bundles:

### Phase A — Academic compliance polish (~3 days)

Three small features that close common compliance gaps:

1. **4.5 Prerequisite enforcement at enrollment** — schema is ready;
   `createEnrollment` just needs to check it.
2. **4.4 Add/drop window enforcement** — two date columns + reject
   updates after deadline.
3. **3.6 Past-term archive** — important to ship before two academic
   years of data accumulate.

Together: PH-aligned, no schema rewrites, all `S/M` effort.

### Phase B — Faculty productivity (~5 days)

Three features that make the gradebook + section a happier place to
work:

1. **2.2 Section announcements** — fan-out via existing notifications.
2. **2.3 Grade template copy** — one new endpoint, one button on the
   gradebook empty state.
3. **2.1 Attendance module** — bigger commitment but the missing piece
   between roster and gradebook.

### Phase C — Admin operations (~4 days)

1. **3.3 Room as entity** — promotes `sections.room` from text to FK,
   plus the auto-assigner gains a room-conflict check.
2. **3.2 Bulk enrollment via CSV** — reuses the 3.1 scaffolding.
3. **3.5 Audit-log actor timeline** — one new endpoint, side-panel UI.

### Phase D — Security & polish (~3 days)

1. **6.6 Code-split the bundle** — quick win, helps mobile loads.
2. **6.5 Dark mode** — appreciated by everyone.
3. **8.7 Notification preferences** — keeps the bell signal high.

If you can only pick one phase: **Phase A** has the highest "this is
required for an actual school to use the system" weight. Phase B has the
highest "faculty will love you" weight.

---

*Last updated to reflect the current state of shipped features as of
the project overview at `PROJECT_OVERVIEW.md`. When items here ship,
mark them ✅ and add a one-line "where it lives" note rather than
deleting the entry — keeps a trail of what got built when.*
