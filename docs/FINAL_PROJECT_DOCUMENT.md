# POLYTECHNIC UNIVERSITY OF THE PHILIPPINES

# CURSUS — A WEB-BASED STUDENT INFORMATION SYSTEM

A Web Application
Presented to the Faculty of the College of Computer and Information Sciences
Polytechnic University of the Philippines

In Partial Fulfillment of the Requirements for the Course
**COMP 018 – Web Development**

by

**Janke Vin Gerona**
*Student's Name*
*Student's Name*
*Student's Name*

June 2026

---

## I. Project Title

**Cursus — A Web-Based Student Information System**

A full-stack web application that manages the day-to-day operations of a higher-education registrar's office — students, faculty, academic terms, course sections, schedules, grades, evaluations, and transcripts — from a single browser.

---

## II. Project Description

Cursus is a Student Information System (SIS) built for college-level institutions. It replaces the spreadsheet-and-paper workflow most registrars still rely on with a unified web application that supports three distinct user roles — **administrator**, **faculty**, and **student** — each with their own dashboard and permissions.

The application handles the complete academic lifecycle of a cohort: admitting students into a program and block, opening a term, generating sections from the program's curriculum, auto-assigning qualified faculty (respecting their availability, qualifications, and load cap), letting students confirm their enrollment, allowing faculty to record scores in a spreadsheet-style gradebook, processing grade appeals, archiving past terms, and finally graduating the cohort into an alumni portal where their transcripts and Certificate of Graduation remain downloadable.

Beyond the core registrar workflow, Cursus models the realities of Philippine academia — the **1.00–5.00 grade scale**, **multi-meeting per week class schedules** (Mon+Thu / Tue+Fri / Wed+Sat standard pairs, plus Sunday-only NSTP-style subjects), **block-based cohorts** (BSCS 1-1, 1-2, etc.), **irregular students** (transferees, shifters, and students currently retaking a failed subject), and **anonymous end-of-term faculty evaluations** with K-anonymity protection so individual responses can never be traced back to a student.

The system is built as a TypeScript monorepo: a React + Vite single-page application on Vercel talks to a Node.js + Express API on Render, which reads and writes to a PostgreSQL database hosted on Supabase. Authentication uses a custom JWT flow with bcrypt password hashing.

---

## III. Objectives

The application aims to achieve the following specific, measurable goals:

1. **Replace paper-based enrollment** by letting admins open a term and generate all course sections + speculative pending enrollments for every block in one click, then having each student confirm attendance from their own Certificate of Registration (COR) page.

2. **Eliminate manual class scheduling** by implementing an auto-assigner that pairs qualified faculty to TBA sections based on declared availability, course qualifications, preference, and per-faculty load cap (default 24 units), while enforcing block-level and faculty-level schedule conflict checks.

3. **Replicate the Philippine multi-meeting class format** by supporting 1-or-2 meetings per section per week with optional asymmetric durations (e.g., Tue 3 h + Fri 2 h) and a "same-day, back-to-back" constraint enforced at the database trigger level.

4. **Make grading transparent and auditable** by giving faculty a spreadsheet-style gradebook with weighted assessment categories, providing students a real-time view of their numeric and letter grades on the 1.00–5.00 PH scale, and recording every score update + grade finalization in an immutable audit log.

5. **Protect student anonymity in faculty evaluations** by storing evaluation responses without ever joining them back to the submitting student in any faculty-facing query, applying a K-anonymity threshold (n ≥ 3 by default) so very small sections cannot be de-anonymized, and shuffling free-text answers to break ordering correlations.

6. **Handle academic-year transitions in one transaction** through the *Advance Academic Year* batch action — graduating final-year cohorts, promoting all other years to the next level, and randomly redistributing students across the new year's blocks — atomically, with rollback on any failure.

7. **Accommodate off-cycle students** (transferees with `block_id = NULL` and cohort members with outstanding 5.00 failures) by automatically excluding them from Open Term's cohort fan-out, auto-enrolling them in retake sections when the failed course comes back into the calendar, and locking downstream subjects until the prereq is re-passed.

8. **Preserve historical academic records indefinitely** by moving finished terms into parallel `*_archive` tables (sections, enrollments, scores, categories, assessments, resolved appeals), keeping the live tables fast while transcripts continue to UNION the live + archived data for a complete student history.

---

## IV. Tools and Technologies

| | |
|---|---|
| **Programming Language**       | TypeScript (both frontend and backend) |
| **Integrated Development Environment (IDE)** | Visual Studio Code |
| **Database**                   | PostgreSQL 15 (hosted on Supabase) |
| **Frontend Framework**         | React 19 + Vite 7 |
| **Styling**                    | Tailwind CSS 3 |
| **Frontend State**             | TanStack React Query 5 + React Context API |
| **Routing**                    | React Router 7 |
| **Backend Framework**          | Node.js 20 + Express 5 |
| **Authentication**             | Custom JWT (`jsonwebtoken` + `bcryptjs`) — not Supabase Auth |
| **Input Validation**           | Zod |
| **Database Client**            | `pg` (node-postgres) |
| **PDF Generation**             | `pdfkit` (Certificate of Registration + Certificate of Graduation) |
| **iCalendar (.ics) Export**    | Hand-rolled, no dependency (RFC 5545) |
| **API Documentation**          | Swagger UI via `swagger-jsdoc` |
| **Deployment — Frontend**      | Vercel |
| **Deployment — Backend**       | Render |
| **Database Hosting**           | Supabase (Transaction Pooler) |
| **Version Control**            | Git + GitHub |

---

## V. Team Roles

| Developer Name      | Responsibility |
|---|---|
| **Janke Vin Gerona** | Full-stack lead. Designed the database schema (24 tables across 19 migrations), implemented all backend modules (auth, users, programs, blocks, courses, curriculum, terms, sections, enrollments, gradebook, appeals, evaluations, archive, password-resets, notifications, audit logs, irregularity), built the entire React frontend (admin / faculty / student page trees + shared component library), implemented the auto-assigner algorithm, the multi-meeting schedule model, the anonymous faculty evaluation system with K-anonymity, the past-term archive, the irregular-student handling (no-block + retake-driven), the Advance Academic Year batch flow, the alumni portal with Certificate of Graduation PDF, dark mode, code splitting, and the deployment pipeline to Vercel + Render + Supabase. |
| *Student's Name*    | *[Contribution to be filled by team member]* |
| *Student's Name*    | *[Contribution to be filled by team member]* |
| *Student's Name*    | *[Contribution to be filled by team member]* |

---

## VI. Project Scope

The application implements the following features. All listed items are fully shipped and deployed.

| Feature | Description |
|---|---|
| **Custom JWT Authentication** | User-code based login (`YYYY-NNNNN-MN-R` format), bcrypt password hashing, role-gated routes (admin / faculty / student), JWT in `localStorage`, forced password change on first login, "forgot password" flow with admin-mediated approval queue, eye-icon password reveal toggle. |
| **User & Account Management** | Full CRUD for users with role-specific fields (students get program + year + block, faculty get max teaching units), bulk CSV import with two-stage preview/apply flow, CSV export, irregular-student filter chip, alumni filter chip. |
| **Program & Curriculum Management** | Programs with derived total-units (computed from curriculum, not stored), per-year/per-semester course placement, prerequisite enforcement at curriculum-build time, restricted electives via `course_programs` linking, per-course `meetings_per_week` toggle (1 or 2). |
| **Block (Cohort) Management** | Auto-generated blocks from program config (N years × M blocks/year), capacity tracking that excludes graduates, random-block placement for new students, *Advance Academic Year* single-button batch (graduate Y4 → promote Y3→Y4 → Y2→Y3 → Y1→Y2) running in one transaction with preview modal. |
| **Multi-Meeting Section Schedule** | Each section can have 1 or 2 meetings per week, on independent days at independent times, with asymmetric durations supported (e.g., Tue 3 h + Fri 2 h). Same-day back-to-back pairs allowed; gaps rejected. Sunday meetings supported for NSTP-style courses. Database-level trigger enforces the cap. |
| **Auto-Assign Faculty + Schedule** | Constraint-based greedy assigner: picks qualified faculty (`faculty_qualifications`) whose availability covers a candidate slot (standard pairs Mon+Thu / Tue+Fri / Wed+Sat for 2-meeting subjects, Sun-first for 1-meeting), respects per-faculty `max_teaching_units` cap, avoids block-level and faculty-level schedule conflicts. Strategy presets: balanced / prefer-standard-pairs / prefer-mornings. |
| **Open Term — Smart Enrollment** | Bulk-creates sections from curriculum across all selected programs; speculatively enrolls students with prereq-checked per-student logic (skips locked subjects, auto-enrolls retakes for previously-failed courses whenever they come back into the calendar). Idempotent; safe to re-run. |
| **Self-Enlistment / Confirm Enrollment** | Students receive a notification when a term opens, view their pending registration on the COR page, and explicitly confirm to flip status from `pending → enrolled`. Until confirmed, gradebook / roster / schedule all hide the student. |
| **Spreadsheet-Style Gradebook** | Weighted assessment categories (must sum to 100), per-student score entry with keyboard navigation, real-time computed grade on the 1.00–5.00 PH scale, bulk score CSV import, finalize-grade action with confirmation modal, TBA section auto-pass at term close. |
| **Grade Appeals (3-stage)** | Student files within 14 days of finalize → faculty accepts → faculty resolves *or* escalates to dean → dean decides. Each stage notification-driven, audit-logged with old + new value, immutable once resolved. |
| **Anonymous Faculty Evaluation** | 8-question default bank (7 Likert + 1 free-text) editable by admin. Evaluation window opens 30 days before term-end. Final grades hidden until student submits the evaluation for that section. K-anonymity threshold (default 3) hides aggregates from faculty / admin when responses are below threshold. Free-text answers returned shuffled and never paired with Likert scores. |
| **Class Schedule iCal Export** | One-click `.ics` download per student, one VEVENT per meeting with RFC 5545 RRULE recurring weekly until term end, anchored to `Asia/Manila` via VTIMEZONE. |
| **Certificate of Registration (COR) PDF** | Landscape A4, hand-rolled with `pdfkit`. Header + student info block + multi-meeting schedule table per subject + totals + signature line. |
| **Certificate of Graduation PDF** | Portrait A4 transcript-style document with final GWA (PH norm: units-weighted, includes failures), per-term breakdown of every finalized enrollment, official issuance footer. Alumni-only endpoint. |
| **Alumni Portal** | Graduated students keep `is_active = TRUE` and can sign in to a read-only portal showing a congratulations hero, final GWA + total units + cohort year, downloadable Certificate of Graduation and transcript CSV. Routes for active-only features (Schedule, Wishlist, COR, Appeals, Evaluations) return 403 with a friendly message. |
| **Irregularity Tracking** | Two derived states surfaced as an *Irregular* chip + filter: `no_block` (transferees / shifters with `block_id = NULL`) and `pending_retakes` (cohort members with one or more 5.00 grades not yet re-passed). The student dashboard banners the retake situation; Open Term auto-schedules the retake whenever the failed course is offered again; promote/graduate batches hold the student back until the retake clears. |
| **Past-Term Archive** | Admin can move finished terms (sections + enrollments + scores + assessments + categories + resolved appeals) into parallel `*_archive` tables in one transaction. Refuses if any active appeal exists. Transcripts continue to UNION live + archived via `enrollments_full_v` / `sections_full_v` views. |
| **Pre-Registration / Wishlist** | Students rank desired courses for an upcoming term; admin Terms page shows aggregated demand per course with priority breakdown to inform section provisioning. |
| **Analytics Dashboard** | Custom SVG charts (no `recharts` / `d3`). Four reports: cohort retention by entry year, faculty teaching load with overload/underload classification, section fill rates with histogram, average GWA per program × term. All exportable to CSV. |
| **Notifications System** | In-app bell with unread badge, polling every 60 s, kinds covering grade-finalized, term-opened, schedule-changed, appeal-stage-changes, password-reset events, cohort-graduated. Mark-read and mark-all-read actions. |
| **Forgot-Password Flow** | Public submit from login (no-info-leak — always 200), admin queue + notification fan-out, approve resets to default password + flags `password_must_change`, deny with note shown to user. Rate-limited per user-code (1 per hour). |
| **Audit Logs** | Every state-changing admin action (grade update, finalize, promote year, graduate cohort, advance AY, archive term, approve password reset, etc.) writes a JSONB-typed audit row with actor + old/new values. Searchable from the admin audit log page. |
| **Dark Mode** | Class-based via Tailwind `darkMode: 'class'`. CSS-level overrides for all design utility classes (`.card`, `.input`, `.btn-*`, badges, etc.). Theme toggle in topbar, persisted to `localStorage`, bootstraps before React renders to prevent flash-of-light-theme. |
| **Bundle Code-Splitting** | Every route is its own `React.lazy()` chunk; initial JS payload reduced from 655 kB to 365 kB (115 kB gzipped). |

---

## VII. Project Timeline

This schedule shows the key phases and deadlines of the project.

| Milestone               | Due Date |
|---|---|
| Requirements gathering  | February 2026 |
| Design phase            | February 2026 |
| Development start       | March 2026    |
| Midpoint check-in       | April 2026    |
| Final testing           | May 2026      |
| Submission              | June 2026     |

---

## VIII. Database Schema

The Cursus database is a normalized PostgreSQL 15 schema with **24 tables** organized into seven logical groups. The schema evolved across **19 incremental migrations** (`001_initial_schema.sql` through `019_password_reset_requests.sql`) and is consolidated into a single `migrations/schema.sql` file for fresh installs.

### Logical groupings

| Group | Tables |
|---|---|
| **Identity & roles** | `users` (admin / faculty / student, with derived alumni flag via `graduated_at`) |
| **Academic structure** | `programs`, `blocks`, `courses`, `course_programs`, `course_prerequisites`, `curriculum_courses` |
| **Term operations** | `terms`, `sections`, `section_meetings`, `enrollments`, `faculty_availability`, `faculty_qualifications`, `wishlist_entries` |
| **Gradebook** | `assessment_categories`, `assessments`, `scores` |
| **Workflows** | `grade_appeals`, `evaluations`, `eval_questions`, `eval_answers`, `eval_periods`, `password_reset_requests` |
| **Archive** (post-2.6) | `sections_archive`, `enrollments_archive`, `scores_archive`, `assessments_archive`, `assessment_categories_archive`, `grade_appeals_archive` + transcript-friendly UNION views `enrollments_full_v`, `sections_full_v` |
| **System** | `notifications`, `audit_logs`, `migration_backfill_problems` |

### Key design decisions

- **UUID primary keys** everywhere via `gen_random_uuid()` from the `pgcrypto` extension. Predictable cross-environment references; no auto-increment leakage.
- **Enum types** for `user_role`, `enroll_status`, `semester_type`, `course_visibility`, `availability_kind` to prevent typos at the database boundary.
- **Cohort modeled as `blocks`**: each block belongs to a program + year + block number (e.g., BSCS 1-1). A section binds a block to a course in a term — sections are never created manually, they are materialized by the *Open Term* bulk action from the program's curriculum template.
- **Schedule is its own table.** Each section has **1 or 2 meetings** in `section_meetings`. A constraint trigger enforces the cap and the back-to-back rule for same-day pairs. Day-of-week is one of `Mon / Tue / Wed / Thu / Fri / Sat / Sun`.
- **Grade-flow tables share a (student, section) UNIQUE.** A student can only enroll in a section once; appeals are 1-to-1 with their enrollment; evaluations are 1-to-1 with a (student, section) pair. UNIQUE constraints at the database level prevent duplicates that would otherwise leak through race conditions.
- **Archive tables use `LIKE … INCLUDING ALL`** to snapshot the live structure, plus denormalized `archived_term_id` + `archived_at` columns for fast term-scoped lookups. Foreign keys to live tables are deliberately omitted so archived rows survive future deletes of their original parents.
- **Anonymity is enforced in the queries, not the schema.** `evaluations.student_id` exists for one-response-per-student and grade-gate purposes, but is **never** joined to `eval_answers` in any faculty- or admin-facing read. K-anonymity threshold lives in `eval_periods.min_response_n`.
- **Constraint triggers (DEFERRABLE INITIALLY DEFERRED)** for cross-row invariants (category weights sum to 100; 1-or-2 meetings per section with the back-to-back rule). They fire at COMMIT so multi-row inserts within a transaction stay valid mid-write.
- **Computed columns via views** (`enrollments_full_v`, `sections_full_v`) for transparent "live + archive" reads from transcript / TOR endpoints.
- **Partial indexes** for the hot paths: `idx_users_graduated WHERE graduated_at IS NOT NULL`, `idx_terms_archived WHERE archived_at IS NOT NULL`, `idx_password_reset_pending WHERE status = 'pending'`, unique `uq_password_reset_one_pending_per_user WHERE status = 'pending'`.

### Entity relationship diagram

A visual ERD of all 24 tables (live + archive) with foreign-key relationships is rendered separately. The diagram covers:

- Identity flow: `programs → blocks → users` (with optional `block_id` for irregulars).
- Curriculum flow: `programs → curriculum_courses → courses ← course_prerequisites`.
- Section flow: `blocks + courses + terms → sections → section_meetings`, plus `faculty_id → users`.
- Enrollment & grading: `users → enrollments → sections`, then `sections → assessment_categories → assessments → scores`.
- Workflow tables: `grade_appeals → enrollments`, `evaluations → sections + users → eval_answers → eval_questions`, `eval_periods → terms`.
- Archive mirrors of section / enrollment / scoring tables.
- System tables: `notifications` and `audit_logs` reference `users` for authorship and recipient.

---

## IX. Testing Plan

The project employs a layered testing strategy aligned with the typical pyramid: type-level safety as the bottom (broadest, cheapest), integration via end-to-end seeded data in the middle, and exploratory manual UI testing per role at the top.

### 1. Static type checking (continuous)

Both the backend and the frontend are written in **TypeScript with strict mode enabled**. Every change is validated by `tsc --noEmit` (backend) and `npm run build` (frontend, which runs `tsc -b` before Vite bundles). This catches:

- Argument/return type mismatches at API boundaries
- Discriminated-union exhaustiveness gaps (e.g., a new `status` value not being handled in a `switch`)
- Promise misuse (unawaited / wrong shape)
- Null/undefined accesses on optional fields
- Outdated import paths after refactors

Both builds run clean as of the current revision.

### 2. Input validation (per request)

Every API endpoint that mutates state uses **Zod** schemas to validate the request body and route parameters. A bad payload returns a structured 400 with the offending field — never reaches the service layer or hits the database with malformed data.

Validators live in `modules/<feature>/<feature>.schema.ts` and are tested by exercising the relevant admin/student/faculty UI flows that produce the inputs (every form maps to a schema).

### 3. Database constraint testing

The schema itself encodes many of the business rules — UNIQUE indexes, CHECK constraints, ENUM types, and constraint triggers. Test scenarios that intentionally violate them:

- Same-day section meetings with a time gap → trigger raises `must be back-to-back`.
- Inserting a third meeting for a section → trigger raises `at most 2 meetings per week`.
- Assessment category weights that don't sum to 100 → deferred trigger raises at COMMIT.
- Submitting two evaluations for the same (student, section) → UNIQUE constraint raises 23505.
- Attempting to enroll a student twice in the same section → UNIQUE constraint raises 23505.
- Two pending password-reset requests for the same user → partial unique index raises 23505.

All of these surface as friendly 409 responses in the controller layer.

### 4. End-to-end integration via seeded data

The repository ships a fully populated seed file (`migrations/seed.sql`) that creates 24 students (20 cohort + 3 irregular, 1 admin × 40 faculty), full BSCS curriculum, 7 past terms with finalized grades, anonymous evaluations from every student to every faculty per past term, and 1 active in-progress term — all in one DO block. The seed verifies:

- All 19 migrations apply cleanly via `schema.sql` on a fresh Supabase project.
- Foreign-key cascade behavior across `sections → enrollments → scores`, `sections → section_meetings`, etc.
- The 3 strategic-fail students (Olivia, Joaquin, Emilio) demonstrate the retake workflow end-to-end: failed prereq → downstream lock → Open Term auto-enrolls the retake when the course is offered again.
- The 3 irregulars (Paolo, Celine, Miguel) demonstrate the no-block flow: no Open Term enrollment, no Promote/Graduate impact, manual section enrollment via the admin Enrollments page.

### 5. Manual role-based UI testing (per release)

Each shipped feature is exercised by signing in as the relevant role and walking through the full flow on the deployed Vercel app. Testers check:

- **Admin:** Users / Programs / Blocks / Courses / Curriculum / Terms / Sections / Enrollments / Appeals / Evaluations / Analytics / Password Resets / Audit Log — including Open Term, Auto-Assign, Advance Academic Year, Archive Term, Password Reset Approve.
- **Faculty:** My Sections / My Subjects / Availability / Gradebook (score entry + finalize) / Roster / Appeals (accept/resolve/escalate) / Evaluations (K-anonymous rollup).
- **Student:** Dashboard / Curriculum (with retake state) / My Grades / Schedule (Mon–Sun grid with multi-meeting blocks) / Wishlist / COR (confirm enrollment + PDF download) / Appeals / Evaluations / Account.
- **Alumni:** Read-only portal with Overview + Transcript + Account; 403 on locked routes; Certificate of Graduation PDF download.

### 6. Browser compatibility & responsiveness

Tested on the latest Chromium-based browsers (Chrome, Edge) and Firefox on desktop, plus mobile Safari and Chrome on iOS / Android. The layout adapts via Tailwind responsive utilities — sidebar collapses to a drawer below `md`, tables hide low-priority columns at smaller breakpoints, the multi-meeting schedule grid switches to horizontal-swipe on mobile.

### 7. Dark mode visual review

Every page is reviewed in both light and dark mode after any UI change. The dark palette is layered (page bg `#0e0d0b`, card surface `#1c1917`, elevated surfaces `#292524`) and all design utility classes have `.dark`-scoped overrides in `index.css`. The Tailwind `dark:` variants are added at call sites where global overrides aren't sufficient (e.g., gradient banners).

### 8. Deployment smoke tests

After every push to the deployment branches:

- The frontend build on Vercel must produce a passing bundle (no TypeScript errors, no missing chunks).
- The backend build on Render must boot, run `SELECT 1` against the Supabase DB on startup, and respond to `/api/health` with HTTP 200.
- A test login as each of admin / faculty / student must succeed and route to the correct dashboard.
- The `cursus-logo.svg` favicon must load and the in-app brand must render the same asset.

---

*End of document.*
