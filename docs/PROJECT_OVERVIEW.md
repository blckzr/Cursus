# Cursus SIS — Project Overview

> **Purpose of this file.** Snapshot of what the system *is* and *does* as of
> the current revision. Written so the next person (or assistant) sitting
> down at this repo cold can understand the codebase in 10 minutes without
> reading every file. Updated as new features ship — read top-down for the
> intro, jump to the section you need for detail.

---

## 1. What is this?

A **Student Information System (SIS)** for **Universidad Mariana** (a PH
higher-ed institution), built as a school project. The system manages:

- Users (admin / faculty / student)
- Degree programs, blocks (cohorts), courses, curricula
- Academic terms, course sections, enrollments
- Faculty workload (availability + qualifications) + auto-scheduling
- Excel-like gradebook (faculty enter scores, system computes weighted grades)
- Student self-service (curriculum roadmap, schedule, COR, transcripts, wishlist)
- Notifications, audit logs, analytics

**Defining UX:** the **gradebook** is a spreadsheet-style grid faculty
can keyboard-navigate. **Self-enlistment** at term start makes students
explicitly confirm their attendance for each semester. The **auto-assigner**
matches qualified faculty to sections automatically using a constraint
solver.

---

## 2. Tech stack

| Layer | Technology | Hosting |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS | **Vercel** |
| Backend | Node.js + Express + TypeScript | **Render** |
| Database | PostgreSQL 15+ | **Supabase** |
| Auth | Custom JWT (`bcryptjs` + `jsonwebtoken`) | n/a |
| PDF | `pdfkit` (hand-rolled COR layout) | n/a |
| iCalendar | Hand-rolled (no dep) | n/a |
| State (FE) | React Query + Context API | n/a |
| Forms (FE) | Native + small `<InputField>` / `<SelectField>` wrappers | n/a |

**Not Supabase Auth.** We use our own JWT flow because the user-code login
format (`2026-00001-MN-2`) and the password-must-change gate aren't features
of Supabase Auth.

---

## 3. Repository layout

```
/  (monorepo root)
├── apps/
│   ├── backend/          Express API
│   │   └── src/
│   │       ├── config/   env.ts, db.ts
│   │       ├── lib/      csv, ics, pdf, mailer (deleted)
│   │       ├── middleware/  auth (JWT + role gates)
│   │       ├── modules/  feature folders — each has schema/service/controller/routes
│   │       └── routes/   index router wiring all modules
│   └── frontend/         React SPA (Vite)
│       └── src/
│           ├── api/      ALL API helpers + TypeScript types
│           ├── components/  shared UI (DataTable, PageHeader, Modal, etc.)
│           ├── context/  AuthContext (JWT + user in localStorage)
│           ├── layouts/  AppLayout (sidebar + topbar shell + gates)
│           ├── lib/      csv.ts, days.ts, apiError.ts
│           └── pages/    per-role page components (admin/faculty/student)
├── migrations/
│   ├── schema.sql        UNIFIED schema (drop-and-recreate; all 13 migrations folded in)
│   ├── seed.sql          UNIFIED test data (BSCS curriculum + 1 admin + 40 faculty + 5 students)
│   └── 001-013.sql       Historical per-step migrations (kept for piecewise upgrades)
├── docs/
│   ├── PROJECT_OVERVIEW.md (this file)
│   └── FUTURE_FEATURES.md  Detailed backlog of unbuilt features
├── render.yaml           Render Blueprint
├── apps/frontend/vercel.json  Vercel config
└── README.md             Deployment + setup walkthrough
```

### Backend module convention

Every feature gets its own folder under `apps/backend/src/modules/`:

```
modules/<feature>/
├── <feature>.schema.ts      Zod validators for request bodies / params
├── <feature>.service.ts     Pure DB/business logic (no Express types)
├── <feature>.controller.ts  Thin handlers: parse req → call service → respond
└── <feature>.routes.ts      Router with auth/authorize + OpenAPI JSDoc
```

Routes are mounted in `apps/backend/src/routes/index.ts`.

### Frontend page convention

Each role has its own folder under `apps/frontend/src/pages/`:

```
pages/
├── admin/      Dashboard, Users, Programs, Blocks, Courses, Curriculum,
│               Terms, Sections, Enrollments, Analytics, AuditLog
├── faculty/    Dashboard, Sections, Gradebook, Roster, Availability, Subjects
├── student/    Dashboard, Curriculum, Grades, Schedule, Wishlist, COR
└── Account.tsx (shared)
└── Login.tsx
```

Routes wired in `apps/frontend/src/App.tsx`.

---

## 4. Database schema (high level)

See `migrations/schema.sql` for the canonical DDL. Key entities:

### Identity & cohorts
- **`users`** — admins, faculty, students. Persistent `user_code`
  (`YYYY-NNNNN-MN-X` where X=0/1/2 by role). Students link to `program_id`,
  `year_level`, `block_id`. `password_must_change` gates first-login
  password change. `max_teaching_units` (faculty) caps load.
- **`programs`** — BSCS, BSIT, etc.
- **`blocks`** — cohort × year × block number, e.g. `BSCS 1-1`.

### Catalog & curriculum
- **`courses`** — master catalog. `visibility = 'public' | 'restricted'`.
- **`course_programs`** — m2m for restricted courses.
- **`course_prerequisites`** — m2m self-ref.
- **`curriculum_courses`** — per-program year/sem placement.

### Sections & enrollments
- **`terms`** — academic terms. One active at a time (`is_active`).
- **`sections`** — `(block × course × term)` triple. `faculty_id` nullable
  (= TBA), `day_of_week` / `start_time` / `end_time` / `room` set after
  scheduling. `section_code` auto-generated: `BSCS 1-1 COMP002`.
- **`enrollments`** — student × section. Status enum:
  `pending` → `enrolled` → `completed` / `dropped`.

### Gradebook
- **`assessment_categories`** — per-section bucket (Quizzes, Finals…). Weight
  sums must ≤ 100 (enforced by trigger).
- **`assessments`** — columns under a category.
- **`scores`** — cells.

### Faculty workload
- **`faculty_availability`** — weekly teaching + office-hour slots.
- **`faculty_qualifications`** — courses each faculty can teach + preference (1-5).

### Student-facing extras
- **`wishlist_entries`** — pre-registration intent for upcoming term.

### Cross-cutting
- **`notifications`** — in-app bell feed (fan-out per recipient).
- **`audit_logs`** — every state change.

### Enums

| Enum | Values |
|---|---|
| `user_role` | admin, faculty, student |
| `enroll_status` | pending, enrolled, dropped, completed |
| `semester_type` | 1, 2, summer |
| `course_visibility` | public, restricted |
| `availability_kind` | teaching, office_hour |

### Sequences

Per-role user-code sequences (`student_code_seq`, `faculty_code_seq`,
`admin_code_seq`) so each role numbers independently.

### Triggers

`check_category_weights` — deferrable, ensures per-section weights sum ≤ 100%.

---

## 5. Auth flow

1. **Login** — POST `/api/auth/login` with `{ userCode, password }`.
   - Backend hits `users` by `user_code`, `bcrypt.compare` the password.
   - Returns `{ token, user }`. JWT TTL 8h.
2. **Token** — frontend stores in `localStorage`. Axios interceptor adds
   `Authorization: Bearer <token>` to every request.
3. **401 interceptor** — auto-clears storage and redirects to /login.
4. **`/api/auth/me`** — frontend re-fetches user on hard reload.
5. **Force password change** — if `user.passwordMustChange`, `AppLayout`'s
   `PasswordChangeGate` redirects to `/<role>/account` and shows a sticky
   amber banner until the user changes their password.

---

## 6. Shipped features (by role)

### Admin

| Feature | Where | Notes |
|---|---|---|
| Dashboard | `/admin` | KPI tiles + top programs + recent enrollments |
| Users CRUD | `/admin/users` | Create / edit / activate-deactivate |
| **Bulk CSV import** | `/admin/users` → Import CSV | Two-step: preview → apply |
| **CSV export** | every admin table | Header row matches import format for round-trip |
| Programs | `/admin/programs` | + block configuration |
| Blocks | `/admin/blocks` | Promote year + graduate block actions |
| Courses | `/admin/courses` | Public/restricted visibility |
| Curriculum builder | `/admin/curriculum` | Per-program year/sem placement with prereq enforcement |
| Terms | `/admin/terms` | Create + activate + **Open Term** wizard |
| Sections | `/admin/sections` | Term → program → year → block → subjects drill-down |
| **Auto-assign** | Sections page | Faculty + day/time picker (greedy with block conflict check) |
| Enrollments | `/admin/enrollments` | Manual "irregular" enroll + drop |
| Activity log | `/admin/audit-log` | Filterable, paginated, exportable |
| **Analytics** | `/admin/analytics` | Tabs: Retention, Faculty load, Section fill, Avg GWA |
| Wishlist demand | Terms page → per-term | Aggregate of student wishlist for pre-registration |
| TBA auto-pass | Terms page → per-term | Policy: TBA section at term close → all students 1.00 |

### Faculty

| Feature | Where | Notes |
|---|---|---|
| Dashboard | `/faculty` | Today's classes + at-risk students + sections grid |
| My Sections | `/faculty/sections` | Card grid with live class average + at-risk count |
| **Gradebook** | `/faculty/sections/:id` | Excel-like grid with keyboard nav, ⌘S save, bulk score import, finalize |
| Roster | `/faculty/sections/:id/roster` | Plain student list + CSV/print |
| Availability | `/faculty/availability` | Weekly teaching + office-hour grid |
| **My Subjects** | `/faculty/subjects` | Pick which courses they can teach + preference 1-5 + max load cap |

### Student

| Feature | Where | Notes |
|---|---|---|
| Dashboard | `/student` | GWA + standing + term progress + today's schedule |
| Curriculum roadmap | `/student/curriculum` | Per-subject status: completed / current / pending / locked |
| My Grades | `/student/grades` | Per-term breakdown + GWA + transcript download |
| Weekly schedule | `/student/schedule` | Visual grid (Mon–Fri, 7–18) |
| **COR** | `/student/cor` | Certificate of Registration preview + PDF download |
| **Wishlist** | `/student/wishlist` | Pre-registration intent with priority + notes |
| **Confirm enrollment** | COR page banner | Self-enlistment: flip pending → enrolled |
| **Schedule .ics export** | Schedule page → "Add to calendar" | iCalendar feed for Google/Apple/Outlook |
| Account | `/student/account` | Profile + change password |

### Cross-cutting

- **Notifications** — in-app bell in topbar, polls every 60s. Auto-fired on
  grade finalize, term open, schedule change, enrollment confirm. Per-kind
  icon + tint.
- **Mobile responsiveness** — every page tested at 320px+. Tables collapse
  non-essential columns via `hideBelow: 'sm' | 'md' | 'lg'`. Pagination
  defaults to 10 rows/page on the shared `DataTable` component.
- **Force password change** — gates entire app after creation/admin reset
  until user changes their default `1.PolytechnicU`.

---

## 7. Key business rules

### Self-enlistment (pending → enrolled)

When admin runs **Open Term**, the wizard creates `enrollments` rows with
`status = 'pending'`, not `'enrolled'`. Students must visit their COR page
and click **Confirm enrollment** to flip every pending row to `'enrolled'`.
Until they do, the enrollment is invisible to faculty rosters, gradebooks,
the student's schedule, and the COR itself (every query filters
`status = 'enrolled'`).

This implements the PH "enlistment" concept — students explicitly confirm
they're attending each semester. No-confirm = treated as on-leave.

### Auto-pass TBA at term close

If a section had no faculty assigned when the term ended (registrar
failure), admins can run **Auto-pass TBA sections** from the past-term card.
Every still-enrolled student in those sections gets `numeric_grade=100`,
`letter_grade='1.00'`, `status='completed'`. Per-enrollment audit row +
per-student notification.

### Force password change on first login

`users.password_must_change` defaults to FALSE in schema, but is set TRUE by:
- `createUser` (every newly created account)
- `updateUser` when admin changes the password

Cleared by:
- `auth.changePassword` (the user replacing their own password)

The frontend `PasswordChangeGate` (in `AppLayout`) redirects to
`/<role>/account` and shows a sticky amber banner whenever the flag is
TRUE.

### Default password

Constant `'1.PolytechnicU'` exported from `apps/backend/src/modules/users/users.service.ts`.
Applied when admin creates a user via UI or bulk CSV (no password field on
the form — admin doesn't pick the password).

### Auto-assign algorithm

`apps/backend/src/modules/sections/auto-assign.service.ts`:

- **Hard constraints**: qualification (faculty must have the course in their
  qualifications), availability (window must fit teaching slot, can't overlap
  office hour), faculty schedule conflict, **block schedule conflict** (so
  one block can't be in two classes at the same time), `max_teaching_units`.
- **Soft constraints (strategy-dependent)**:
  - `balanced` — reward 60-80% utilization, penalize >90%
  - `prefer-grouped-days` — bonus for MWF/TTh patterns (effectively
    permissive since all generated patterns are grouped already)
  - `prefer-mornings` — bonus for start ≤ 11:00
- **Score**: `(6 - preference) × 10 + load-balance bonus + strategy bonus`.
- **Order**: sections sorted by candidate-count ASC (tightest first) so
  scarce-faculty courses get first pick.
- **Greedy assignment** — picks highest-scoring candidate, locks the slot in
  both the faculty's and block's state, moves on.
- **Two-phase UI**: `GET /preview` returns proposals without writing; client
  posts the same payload to `POST /apply` to commit.

---

## 8. Frontend conventions

### `DataTable`

Shared component (`apps/frontend/src/components/DataTable.tsx`). Features:

- Per-column `hideBelow: 'sm' | 'md' | 'lg'` for responsive collapse
- Optional client-side pagination via `pageSize={10}`
- Footer slot

Used in every admin/faculty/student table. Auto-resets to page 0 when the
filtered row count changes.

### `PageHeader`

Shared (`apps/frontend/src/components/PageHeader.tsx`). Eyebrow + title +
subtitle + optional stat tiles + optional action slot. Stacks responsively
on mobile.

### `useToast()`

Toast manager from `apps/frontend/src/components/Toast.tsx`. Pushes
`{ tone, title, message }`. Auto-dismisses.

### `api/index.ts`

ALL HTTP calls live in `apps/frontend/src/api/index.ts`. Single axios
instance with JWT interceptor. Types co-located with helpers.

### CSV helpers

`apps/frontend/src/lib/csv.ts`:
- `csvEscape()` — RFC-4180 quoting
- `downloadCsv()` — UTF-8 BOM + trigger save
- `todayStamp()` — `YYYY-MM-DD` for filenames

Used by every "Export CSV" button + bulk imports.

### Notification kinds

Defined in backend `notifications.service.ts` and consumed by frontend
`NotificationBell.tsx`. Current kinds:
- `grade_finalized` — olive, award icon
- `term_opened` — khaki, calendar icon
- `schedule_changed` — amber, clock icon
- `announcement` — (future, slated for 2.2)

---

## 9. API surface

Mounted at `/api`. All routes require `Authorization: Bearer <jwt>` unless
explicitly public (`/auth/login`, `/health`).

### Auth
- `POST /auth/login`
- `GET /auth/me`
- `PATCH /auth/me`
- `POST /auth/change-password`

### Users (admin-only via `users.routes.ts` `router.use(authenticate, authorize('admin'))`)
- `GET /users?role=...`
- `GET /users/:id`
- `POST /users`
- `PATCH /users/:id`
- `POST /users/bulk-import/preview`
- `POST /users/bulk-import/apply`

### Catalog
- `GET/POST/PATCH /programs[/:id]`
- `GET/POST/PATCH /courses[/:id]`
- `GET/POST/DELETE /programs/:programId/curriculum[/:entryId]`
- `GET/POST/PATCH /terms[/:id]`
- `POST /terms/:id/open`
- `GET /terms/:id/tba-auto-pass-preview`
- `POST /terms/:id/tba-auto-pass`

### Sections
- `GET /sections?termId=&facultyId=`
- `GET /sections/:id`
- `POST /sections`
- `PATCH /sections/:id`
- `GET /sections/auto-assign/preview?termId=&strategy=&onlyTba=`
- `POST /sections/auto-assign/apply`

### Enrollments
- `GET/POST/PATCH /enrollments[/:id]`

### Blocks
- `GET /blocks`
- `POST /blocks/promote`
- `POST /blocks/:id/graduate`

### Availability
- `GET /availability/:facultyId`
- `PUT /availability/:facultyId`

### Qualifications
- `GET/PUT /qualifications/:facultyId`
- `POST /qualifications/:facultyId/items`
- `PATCH/DELETE /qualifications/:facultyId/items/:id`

### Gradebook
- `GET /sections/:id/gradebook`
- CRUD on categories/assessments
- `PUT /sections/:id/scores/bulk`
- `POST /sections/:id/finalize`
- `GET /sections/:id/export`
- `GET /sections/:id/roster[/csv]`

### Student self-service
- `GET /students/:id/grades`
- `GET /students/me/transcript` (CSV)
- `GET /students/me/cor` (preview JSON) / `/cor.pdf`
- `GET /students/me/schedule.ics`
- `GET /students/me/pending-enrollment`
- `POST /students/me/confirm-enrollment`
- `GET /students/me/curriculum-progress`

### Wishlist
- `GET /wishlist/terms`
- `GET /wishlist/candidates?termId=`
- `GET/POST/PATCH/DELETE /wishlist/me[/:id]`
- `GET /wishlist/demand?termId=` (admin)

### Notifications
- `GET /notifications?limit=&unreadOnly=`
- `GET /notifications/unread-count`
- `POST /notifications/:id/read`
- `POST /notifications/read-all`

### Audit logs
- `GET /audit-logs?action=&entityType=&actor=&from=&to=&limit=&offset=`
- `GET /audit-logs/actions`

### Analytics (admin-only)
- `GET /admin/analytics/retention?programId=`
- `GET /admin/analytics/faculty-load?termId=`
- `GET /admin/analytics/section-fill?termId=`
- `GET /admin/analytics/gwa-stats?programId=&groupBy=cohort|term`

### Health
- `GET /health`

OpenAPI JSDoc lives next to every route declaration.

---

## 10. Deployment

See `README.md` for the full walkthrough. Quick view:

```
Vercel (frontend, static)  ──HTTPS──▶  Render (backend, Node)  ──TLS──▶  Supabase (Postgres)
```

### Supabase
- Project on Singapore region
- SQL Editor → run `migrations/schema.sql` then `migrations/seed.sql`
- Pooler connection string (port 6543) goes to backend as `DATABASE_URL`

### Render
- `render.yaml` Blueprint provisions a web service
- Env vars (set in dashboard):
  - `DATABASE_URL`
  - `JWT_SECRET` (long random)
  - `CLIENT_ORIGIN` (comma-separated Vercel URLs)
  - `CLIENT_ORIGIN_PATTERN` (optional regex for preview URLs)
- Build: `npm install --include=dev && npm run build && npm prune --omit=dev`
- Start: `npm run start`

### Vercel
- `apps/frontend/vercel.json` pins framework=vite + SPA rewrites
- Env: `VITE_API_BASE_URL` = `https://<render-url>.onrender.com/api`

---

## 11. Fresh-start workflow

1. **Wipe the DB** in Supabase SQL Editor:
   ```sql
   DROP SCHEMA public CASCADE;
   CREATE SCHEMA public;
   ```
2. **Run schema** — paste `migrations/schema.sql`, run.
3. **Run seed** — paste `migrations/seed.sql`, run.
4. You now have:
   - 1 admin (`admin@cursus.local`, code `<year>-00001-MN-2`)
   - 40 faculty (`a.mercado@cursus.local` etc., codes `<year>-0000N-MN-1`)
   - 5 students (all in BSCS 1-1, codes `<year>-0000N-MN-0`)
   - BSCS program + 8 blocks (4 years × 2)
   - 55-course BSCS catalog with prereqs + curriculum placement
   - 1 inactive term: `AY 2025–2026, First Semester`
5. **Login** — user code from above, password `1.PolytechnicU`.
6. **Activate the term**, click **Open term**, run **Auto-assign sections**
   (strategy: *Prefer MWF / TTh*), then have students confirm.

---

## 12. Important migrations (history)

While `schema.sql` is the unified canon, the per-step migration files in
`migrations/00X-*.sql` document the history of schema changes:

| File | What it added |
|---|---|
| 001 | Initial schema |
| 002 | `user_code` |
| 003 | Student `program_id` |
| 004 | Block-driven sections |
| 005 | BSCS curriculum seed (superseded by `seed.sql`) |
| 006 | Notifications |
| 007 | `users.graduated_at` |
| 008 | `faculty_availability` + `availability_kind` enum |
| 009 | `wishlist_entries` |
| 010 | `faculty_qualifications` + `max_teaching_units` |
| 011 | Dummy-faculty seed (superseded by `seed.sql`) |
| 012 | `password_must_change` |
| 013 | `pending` value in `enroll_status` enum |

For new installs, use `schema.sql` + `seed.sql`. For existing installs,
apply individual migrations 001 through 013 in order.

---

## 13. Common patterns

### Adding a new admin page

1. Create `apps/frontend/src/pages/admin/<Page>.tsx`.
2. Import + register in `App.tsx` (route + nav item).
3. If it needs backend data, add helper to `apps/frontend/src/api/index.ts`.
4. Use shared `<PageHeader>`, `<DataTable>`, etc.

### Adding a backend module

1. `mkdir apps/backend/src/modules/<feature>`.
2. Create `<feature>.{schema,service,controller,routes}.ts`.
3. Wire router in `apps/backend/src/routes/index.ts`.

### Adding a CSV export

1. Build the row array in the page component.
2. Use `downloadCsv([header, ...rows], filename)` from `lib/csv.ts`.

### Auto-firing a notification

Call `createMany(items, client)` from `modules/notifications/notifications.service.ts`.
The `client` arg is optional — pass the active transactional client to make
the fanout atomic with the action that triggers it.

### Adding a new analytics tab

1. Create `apps/frontend/src/pages/admin/<Name>Report.tsx`.
2. Add backend endpoint + service function + schema.
3. Register tab in `Analytics.tsx`'s `TABS` array.

---

## 14. Known limitations / non-goals

- **No transferred-in marker.** Students who transferred from another school
  get bucketed by their original cohort year (from `user_code`). Not
  separately tracked.
- **No holiday calendar.** The `.ics` export emits weekly recurring events
  across the whole term; users mute individual occurrences in their
  calendar app.
- **No tuition / fees module.** Out of scope.
- **No DM / chat.** Use external chat tools.
- **Email is disabled.** Earlier attempts used Resend; abandoned for
  simplicity. Default-password sharing is admin's manual responsibility.
- **No formal incomplete (INC) grade flow** (planned in FUTURE_FEATURES 4.1).
- **No real-time updates.** Polling intervals: notifications every 60s.

---

## 15. Where to find each thing

| Looking for… | Path |
|---|---|
| Full backlog of unbuilt features | `docs/FUTURE_FEATURES.md` |
| Deployment walkthrough | `README.md` |
| Schema canonical truth | `migrations/schema.sql` |
| Seed for fresh testing | `migrations/seed.sql` |
| Auto-assign algorithm | `apps/backend/src/modules/sections/auto-assign.service.ts` |
| Gradebook UI | `apps/frontend/src/pages/faculty/Gradebook.tsx` |
| Mobile responsive shell | `apps/frontend/src/layouts/AppLayout.tsx` |
| Password-change gate | `AppLayout.tsx` → `PasswordChangeGate` |
| All HTTP helpers | `apps/frontend/src/api/index.ts` |
| CSV helpers | `apps/frontend/src/lib/csv.ts` |
| PDF (COR) renderer | `apps/backend/src/lib/pdf/cor.ts` |
| iCalendar renderer | `apps/backend/src/lib/ics/schedule.ts` |
| Notifications fan-out | `apps/backend/src/modules/notifications/notifications.service.ts` |
| Auth flow | `apps/backend/src/modules/auth/auth.service.ts` |
| Audit log writer | Inline in services — `INSERT INTO audit_logs …` |

---

## 16. Quick smoke test after fresh deploy

1. Log in as admin (`<year>-00001-MN-2` / `1.PolytechnicU`).
2. `/admin/terms` → activate AY 2025–2026 First Sem → click **Open term**.
3. `/admin/sections` → click the term → **Auto-assign sections** → preview → apply.
4. Log in as student #1 → COR page → click **Confirm enrollment**.
5. Check schedule populates and notifications fire.
6. Log in as a faculty → see assigned sections → open gradebook.

If all six steps work without errors, the full end-to-end is healthy.

---

*Last verified against the codebase at the time of writing. When adding
features, update §6 (shipped) and §9 (API surface) at minimum.*
