# AI & Automation Features

A forward-looking backlog for **automation** (deterministic, scheduled, or
event-driven logic) and **AI** (LLM-powered) features for the Cursus SIS.
This is a companion to [`FUTURE_FEATURES.md`](./FUTURE_FEATURES.md) — that
file holds the general feature backlog; this one focuses specifically on the
two themes the team flagged: *what can we automate* and *where can AI enhance
the experience*.

Format matches `FUTURE_FEATURES.md`: each entry carries a full spec (problem,
data model, backend, frontend, edge cases, effort, dependencies, open
questions) so anyone can pick it up cold. Entries are marked **✅ Shipped**,
**🟡 Partial**, or left plain (= not yet built).

**Effort tags:** `S` = ≤ 1 day · `M` = 1–3 days · `L` = 1+ weeks.

For the current state of the codebase, see
[`PROJECT_OVERVIEW.md`](./PROJECT_OVERVIEW.md).

---

## Table of contents

1. [The foundation: a job runner](#1-the-foundation-a-job-runner)
2. [Automation features](#2-automation-features)
   - 2.1 Deadline & reminder digests
   - 2.2 At-risk student auto-flagging
   - 2.3 Auto-section generation from curriculum
   - 2.4 Waitlist / seat auto-promotion
   - 2.5 Time-based policy automations (INC expiry, honors, add/drop, archive)
   - 2.6 Grade-completeness nags for faculty
3. [AI features](#3-ai-features)
   - 3.1 Anonymous-eval free-text summarizer ⭐
   - 3.2 Student academic advisor chatbot ⭐
   - 3.3 At-risk advising narrative
   - 3.4 Natural-language analytics ("ask your data")
   - 3.5 Smart bulk-import column mapping
   - 3.6 Grade anomaly detection
4. [Cross-cutting AI guardrails](#4-cross-cutting-ai-guardrails)
5. [Recommended sequencing](#5-recommended-sequencing)

---

## 1. The foundation: a job runner — `M`

**Problem.** The system has **no scheduler**. Every time-based action today is
triggered by an admin clicking a button (TBA auto-pass, Open Term), and
notifications are pull-only (the bell polls every 60 s). Several backlog items
in `FUTURE_FEATURES.md` silently assume a recurring job exists:

- INC → 5.00 expiry after one year (4.1)
- Honor-roll auto-compute (4.3)
- Add/drop window auto-close (4.4)
- Past-term archive after a year (3.6, the trigger is manual today)
- Eval window open/close reminders (4.6)

None of these can be *automatic* without a runner. This is the enabling
infrastructure for almost everything else in this document.

**Two viable approaches.**

| Approach | How | Pros | Cons |
|---|---|---|---|
| **Supabase `pg_cron`** | Schedule SQL functions directly in Postgres | No app uptime needed; atomic with the DB | Logic lives in SQL, not TS; harder to reuse service code |
| **Render Cron Job** | A scheduled job (or a tiny scheduler in the web service) hits internal `/api/jobs/*` endpoints with a shared secret | Reuses existing TS services; testable | Render free tier sleeps — needs the cron itself to act as keep-alive, or a paid always-on instance |

**Recommendation:** Render Cron Jobs calling internal endpoints, because all
the business logic (finalize, notifications fan-out, archive) already lives in
TypeScript services we'd otherwise duplicate in PL/pgSQL. Use `pg_cron` only
for pure-SQL maintenance (e.g. `VACUUM`, archive moves).

**Data model.**
```sql
-- Audit/visibility for scheduled runs so admins can see what fired and when.
CREATE TABLE job_runs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name    TEXT        NOT NULL,           -- 'reminders.daily', 'inc.expire'
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status      TEXT        NOT NULL DEFAULT 'running'
              CHECK (status IN ('running','ok','error')),
  summary     JSONB,                          -- { processed: 42, notified: 12 }
  error       TEXT
);
CREATE INDEX idx_job_runs_name_time ON job_runs(job_name, started_at DESC);
```

**Backend.**
- New module `apps/backend/src/modules/jobs/`.
  - `jobs.service.ts` — a registry mapping `jobName → async fn(client)`.
    Each handler opens a `job_runs` row, runs in a transaction, writes the
    summary, marks `ok`/`error`.
  - `jobs.routes.ts` — `POST /api/jobs/:name/run`, protected by a
    `JOBS_SECRET` header (not JWT — this is machine-to-machine). Also allow an
    admin (authenticated) to fire any job manually for testing.
- New env var `JOBS_SECRET` (add to `render.yaml` as `sync: false`).
- A `render.yaml` cron entry per schedule, e.g.:
  ```yaml
  - type: cron
    name: cursus-daily-jobs
    schedule: "0 21 * * *"   # 05:00 Asia/Manila (Render is UTC)
    buildCommand: ...
    startCommand: "curl -fsS -H \"x-jobs-secret: $JOBS_SECRET\" \
                   https://cursus-backend.onrender.com/api/jobs/daily/run"
  ```

**Frontend.**
- Admin → a small **Maintenance / Jobs** panel (could live under Audit Log or
  a new sidebar entry) listing recent `job_runs` with status + summary, plus a
  "Run now" button per job for manual triggering.

**Edge cases.**
- **Render cold start:** the first cron after sleep eats ~30 s; the curl needs
  a generous `--max-time`. The daily cron doubles as a keep-alive.
- **Idempotency:** every handler must be safe to run twice (e.g. "expire INC"
  filters `inc_completed_at IS NULL AND letter_grade <> '5.00'`).
- **Timezone:** Render runs UTC; all "end of day" logic must anchor to
  `Asia/Manila` (the app already does this in the `.ics` exporter — reuse that
  convention).
- **Overlap:** guard against a slow job overlapping its next tick (check for an
  unfinished `job_runs` row for the same name).

**Effort breakdown.** 4 h module scaffold + 3 h `job_runs` + admin panel +
3 h render.yaml + secret + keep-alive + 2 h first handler = ~1.5 days.

**Dependencies.** None — but it gates 2.1, 2.5, and the scheduled half of 2.2.

**Open questions.**
- Paid Render instance (always-on) vs. relying on cron-as-keep-alive? Affects
  reliability of sub-daily jobs.
- Do we want sub-daily granularity (hourly) for anything, or is daily enough
  for v1? (Daily covers every listed use case.)

---

## 2. Automation features

### 2.1 Deadline & reminder digests — `M`

**Problem.** Students miss the enrollment-confirmation window; faculty forget
to finalize grades; everyone misses the eval window. The data to detect all of
this already exists — nothing *pushes* it. Notifications today only fire
reactively (on finalize, term open, schedule change).

**Data model.** None new (uses `notifications`). Optionally reuse
`notification_preferences` from `FUTURE_FEATURES.md` 8.7 so users can mute
reminder kinds.

**Backend.** A `reminders` job handler (registered under §1) that, on a daily
tick, fans out via the existing
`createMany(items, client)` in
`apps/backend/src/modules/notifications/notifications.service.ts`:

- **Pending enrollment** — students with `enrollments.status = 'pending'` in
  the active term and no confirmation → nudge, escalating as the term-open
  window closes.
- **Eval window closing** — students with rows in `GET /api/eval/pending`
  while `eval_periods.closes_at` is within 3 days.
- **Unfinalized grades** — faculty whose sections in the active term have
  `finalized_at IS NULL` as term end approaches.
- **INC deadline approaching** — once 4.1 lands, students with
  `inc_deadline` within 30/7/1 days.

Add new notification kinds: `reminder_enrollment`, `reminder_eval`,
`reminder_finalize`, `reminder_inc`.

**Frontend.**
- `NotificationBell.tsx` already renders any kind — add an icon + tint per new
  kind (the component is built to absorb new kinds; see PROJECT_OVERVIEW §8).
- Optional: a dismissible banner on the relevant page (e.g. COR page already
  has the confirm-enrollment banner; reuse the pattern).

**Edge cases.**
- Don't re-notify the same user for the same reason every day — track a
  per-(user, kind, term) "last reminded" marker, or dedupe on an unread
  existing notification of that kind.
- Respect `notification_preferences` mutes (if 8.7 shipped) at fan-out time.
- Skip dropped/graduated students.

**Effort breakdown.** 6 h handler logic + 2 h dedupe + 2 h kinds/icons +
2 h preference glue = ~1.5 days.

**Dependencies.** §1 (job runner), notifications module (shipped). Plays well
with 8.7 (notification preferences).

**Open questions.**
- In-app only, or also email (needs `FUTURE_FEATURES.md` 8.6 mailer)? In-app
  first; email is a strict add-on.

### 2.2 At-risk student auto-flagging — `M`

**Problem.** The faculty dashboard *already computes* at-risk students from
gradebook scores — but the signal dies on that screen. Nobody tells the
**student**, and there's no adviser loop. Early warning is the single highest
-impact intervention a SIS can make.

**Data model.**
```sql
CREATE TABLE risk_flags (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id UUID        NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  level         TEXT        NOT NULL CHECK (level IN ('watch','at_risk','critical')),
  reason        JSONB       NOT NULL,    -- { runningGrade: 74, missing: 3, trend: 'down' }
  raised_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  cleared_at    TIMESTAMPTZ,
  UNIQUE (enrollment_id, level)          -- one open flag per level per enrollment
);
CREATE INDEX idx_risk_flags_open ON risk_flags(enrollment_id) WHERE cleared_at IS NULL;
```

**Backend.** A `risk-scan` job handler (under §1):
- Reuse the at-risk computation that backs the faculty dashboard (factor it
  into a shared service if it's currently inline in the controller).
- Thresholds (tunable): running grade < 75 = `at_risk`, < 65 or > N missing
  assessments = `critical`, downward trend over last 2 graded assessments =
  `watch`.
- On a *new* flag: notify the student (kind `risk_alert`, gentle wording) and
  the section faculty. Re-raising an existing open flag is a no-op.
- When the running grade recovers, set `cleared_at`.

**Frontend.**
- **Student dashboard** — a supportive "Heads up" card on flagged sections
  ("Your standing in COMP002 is slipping — current 72") with a link to the
  gradebook detail. Tone matters; this should help, not shame.
- **Faculty dashboard** — the existing at-risk widget gains persistence +
  history (flag raised/cleared timeline) instead of recomputing each load.
- **Admin** — optional roll-up: count of open flags per program/term for the
  analytics page.

**Edge cases.**
- Early in the term (few assessments) the signal is noisy — suppress flags
  until at least 2 graded assessments exist.
- Finalized sections stop generating flags.
- Don't flag dropped enrollments.

**Effort breakdown.** 3 h factor-out shared service + 4 h schema + scan +
4 h student/faculty UI + 2 h notifications = ~2 days.

**Dependencies.** §1 (for the scheduled half — manual recompute can ship
first), gradebook (shipped), notifications (shipped). Feeds AI 3.3.

**Open questions.**
- Is there an "adviser" relationship to route critical flags to, or only the
  section faculty? (No adviser role exists today — would piggyback on faculty.)

### 2.3 Auto-section generation from curriculum — `M`

**Problem.** Opening a term, the registrar manually drills
term → program → year → block → subject to create each section. But the set of
sections a term *needs* is fully determined by data we already have: for every
active block, the `curriculum_courses` rows for that block's year + the term's
semester. This is mechanical work that should be one click.

**Data model.** None new. Writes `sections` rows (faculty `NULL` = TBA) for
the auto-assigner to fill.

**Backend.**
- `GET /api/terms/:id/section-plan` — computes the *proposed* set of sections:
  for each active, non-graduated block whose program has curriculum entries in
  this term's semester, emit one section per required course. Returns a preview
  (no writes), flagging any that already exist.
- `POST /api/terms/:id/section-plan/apply` — creates the missing sections in a
  transaction, audit-logged.
- Natural follow-on: chain straight into the existing
  `GET /sections/auto-assign/preview` so "generate + schedule + assign" is one
  guided flow.

**Frontend.**
- **Terms → Open Term wizard** gains a step: "Generate sections" showing the
  computed plan (block × course grid) with counts, then "Create N sections".
- The wizard then offers "Run auto-assign" inline (the apply endpoint already
  exists).

**Edge cases.**
- A section already exists for a (block × course × term) → skip, don't
  duplicate (the triple is the section's natural key).
- Electives / restricted courses with no block default — flag for manual
  handling rather than guessing.
- Irregular students aren't block-driven — they're handled by the existing
  manual enrollment flow; this feature is block-cohort only.
- Curriculum gaps (a year/sem with no entries) → empty plan, clear message.

**Effort breakdown.** 6 h plan computation + 4 h apply + audit + 4 h wizard
step + 2 h auto-assign chaining = ~2 days.

**Dependencies.** Curriculum (shipped), sections + auto-assign (shipped).

**Open questions.**
- How many parallel sections per course when a block is large? Today one
  section per block; if a course is shared across blocks the registrar may
  want capacity-based splitting (out of scope for v1).

### 2.4 Waitlist / seat auto-promotion — `M`

**Problem.** Wishlist demand is collected (`wishlist_entries` with priority
1–5) but once a term opens it's static. When an enrolled student drops and a
seat frees, nobody is auto-pulled in — the registrar would have to notice and
act manually.

**Data model.** Reuse `wishlist_entries` as the waitlist source. Add a section
capacity check (sections already have an implied capacity via block size; if a
`capacity` column doesn't exist, add `sections.capacity INT`).
```sql
ALTER TABLE sections ADD COLUMN IF NOT EXISTS capacity INT;
```

**Backend.**
- On `updateEnrollment` to `status = 'dropped'`: if the section is now below
  capacity and has waitlisted candidates (wishlist entries for that course,
  ordered by priority then timestamp), auto-create a `pending` enrollment for
  the top candidate and notify them to confirm.
- Make this event-driven (inside the drop handler) *and* available as a
  reconcile job under §1 (catch any missed promotions).

**Frontend.**
- **Admin Enrollments** — a section's row shows "N waitlisted"; a manual
  "Promote next" action mirrors the automatic behavior.
- **Student** — promoted student gets a notification + the existing
  confirm-enrollment flow handles acceptance.

**Edge cases.**
- Capacity unknown (NULL) → don't auto-promote, only surface the waitlist.
- Promoted student never confirms → after a deadline, release back and promote
  the next (ties into 2.1 reminders + an add/drop deadline from 4.4).
- Prerequisite check (4.5) must run before promotion to avoid pulling in an
  ineligible student.

**Effort breakdown.** 3 h capacity + 5 h promotion logic (event + job) +
3 h admin UI + 2 h notifications = ~2 days.

**Dependencies.** Wishlist (shipped), enrollments (shipped), §1 for the
reconcile job. Stronger with 4.4 (deadlines) + 4.5 (prereq check).

### 2.5 Time-based policy automations — `S` each (bundle)

**Problem.** Four `FUTURE_FEATURES.md` items are *specified* but are really
"run this rule on a schedule" — once §1 exists they're each a small handler:

- **INC → 5.00 expiry** (4.1): flip `letter_grade = '5.00'` where
  `inc_deadline < now()` and `inc_completed_at IS NULL`.
- **Honor-roll auto-compute** (4.3): recompute `term_honors` after finalize /
  nightly.
- **Add/drop window auto-close** (4.4): once `terms.add_drop_deadline` passes,
  enrollment edits downgrade to "withdraw only".
- **Past-term archive** (3.6, shipped but manual): auto-archive terms whose
  `end_date` is > 1 year ago.

**Backend.** Each is a job handler registered under §1, reusing the services
those features already define. They share the `job_runs` visibility and the
admin "Run now" button.

**Frontend.** Surfaced via the §1 Maintenance panel; the per-feature UIs
(INC tracker, honors table, archive action) come from their own backlog
entries.

**Effort breakdown.** ~0.5 day each once §1 + the underlying feature exist.

**Dependencies.** §1, plus each feature's own schema (4.1, 4.3, 4.4 from
`FUTURE_FEATURES.md`). 3.6 already has its service — just schedule it.

### 2.6 Grade-completeness nags for faculty — `S`

**Problem.** Faculty sometimes finalize with empty cells or categories whose
weights don't sum to 100 (the trigger enforces ≤ 100, not exactly 100). A
pre-finalize check + a nudge avoids "why is my grade wrong" appeals later.

**Backend.** `GET /api/sections/:id/finalize-check` — returns blocking issues
(missing scores, weights < 100, students with no scores at all) before the
faculty hits finalize. Optionally surfaced proactively by the 2.1 reminder job.

**Frontend.** Gradebook finalize modal shows a checklist; the existing
finalize button stays disabled (or warns) until resolved.

**Edge cases.** Excused/dropped students shouldn't count as "missing". INC
(once 4.1 lands) is a valid non-numeric state.

**Effort breakdown.** ~1 day.

**Dependencies.** Gradebook (shipped). Pairs with 2.1.

---

## 3. AI features

> All AI features call the **Claude API** (this is an Anthropic stack). Model
> guidance: **Haiku 4.5** (`claude-haiku-4-5`) for cheap, high-volume
> summarize/classify; **Sonnet 4.6** (`claude-sonnet-4-6`) for advising and
> multi-step reasoning; **Opus 4.8** (`claude-opus-4-8`) only where depth
> clearly pays for itself. See [§4](#4-cross-cutting-ai-guardrails) for the
> non-negotiable guardrails every one of these must follow.

### 3.1 ⭐ Anonymous-eval free-text summarizer — `M`

**Problem.** The anonymous faculty-evaluation feature (shipped, 4.6) collects
free-text comments and surfaces them to faculty as a *shuffled, unattributed
list*. At any real response volume that's a wall of text nobody reads
carefully. An LLM can distill themes ("students consistently praised your
pacing; several flagged the rubric for Project 2 as unclear") — turning raw
comments into actionable signal. **This is the best-fit AI feature in the
system**: the data exists, the privacy boundary is already drawn, and the
current UX is weakest exactly here.

**The anonymity contract — inherited and absolute.** The summarizer operates
**only** on the same aggregated, shuffled comment set the faculty view already
exposes, and **only** when the section/rollup meets `eval_periods.min_response_n`
(default 3). It must:
- Never receive `evaluations.student_id` or any per-student row.
- Never receive comments paired with Likert scores, dates, or order.
- Refuse to summarize below the K-anonymity threshold (no input → no call).
- Be instructed (system prompt) to summarize themes only and never quote a
  comment verbatim in a way that could re-identify (e.g. a comment naming a
  specific incident). Prefer paraphrase + theme counts.

**Data model.**
```sql
CREATE TABLE eval_summaries (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  scope       TEXT        NOT NULL CHECK (scope IN ('section','faculty_term')),
  scope_id    TEXT        NOT NULL,          -- section_id, or faculty_id|term_id
  n_responses INT         NOT NULL,
  model       TEXT        NOT NULL,
  summary     JSONB       NOT NULL,          -- { themes: [...], praises: [...], concerns: [...] }
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, scope_id)
);
```
Caching matters: summaries are expensive to regenerate and the underlying
comments are frozen once the window closes — generate once, store, reuse.

**Backend.**
- New `apps/backend/src/lib/ai/client.ts` — thin Anthropic SDK wrapper,
  fail-soft (no `ANTHROPIC_API_KEY` → skip, mirror the old mailer pattern),
  with a shared system prompt enforcing the anonymity rules.
- `POST /api/eval/faculty/me/term/:termId/summary` (and the admin equivalent)
  — gathers the already-aggregated shuffled comments (reusing the existing
  K-anonymity query in the eval service), calls Claude (Haiku 4.5), stores in
  `eval_summaries`, returns it. Subsequent calls return the cached row.
- Generation can also be triggered by a §1 job when an eval window closes, so
  summaries are ready before faculty look.

**Frontend.** Faculty / Admin → Evaluations: above the shuffled comment list,
a "Summary of written feedback" card (themes, top praises, top concerns) with
an "AI-generated from N anonymous responses" disclaimer.

**Edge cases.**
- `n < min_response_n` → no summary card at all (matches existing behavior).
- Comments in Taglish / mixed language — Claude handles this well; no special
  handling needed.
- Prompt-injection in a student comment ("ignore previous instructions…") →
  the system prompt treats all comment text as untrusted data, never
  instructions; keep comments inside a clearly delimited block.

**Effort breakdown.** 4 h AI client + prompt + 4 h endpoint + cache + 3 h job
hook + 3 h UI = ~2 days.

**Dependencies.** Eval module (shipped). New `ANTHROPIC_API_KEY` env var.
Optional §1 for pre-generation.

**Open questions.**
- Per-section summaries, faculty-term rollup, or both? (Rollup is safer for
  small sections; start there.)
- Budget cap / rate limit on regeneration to control spend.

### 3.2 ⭐ Student academic advisor chatbot — `L`

**Problem.** Students constantly ask "what subjects do I still need?", "am I on
track to graduate?", "what GWA do I need this term for Dean's List?", "is it
safe to take COMP010 next sem given my prereqs and schedule?". Today they read
the curriculum roadmap and do the math themselves. A grounded chatbot answers
instantly — and every answer is computable from data the student already owns.

**Approach.** Retrieval-grounded, **strictly student-scoped**, **read-only**.
The model never queries the DB directly; the backend fetches the calling
student's own structured data (curriculum progress, grades, GWA, schedule,
remaining units, prereq lock states — all endpoints exist) and passes it as
context. The LLM reasons over that context; it has no tool that can read other
students or write anything.

**Data model.**
```sql
CREATE TABLE advisor_threads (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE advisor_messages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  UUID        NOT NULL REFERENCES advisor_threads(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL CHECK (role IN ('user','assistant')),
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Backend.**
- `POST /api/advisor/message` — body `{ threadId?, message }`. Server:
  1. Loads the **calling** student's curriculum-progress, grades, GWA,
     remaining units, current schedule (reusing existing services — no new
     queries that could leak scope).
  2. Builds a system prompt: role = academic advisor for this one student,
     grounded *only* in the supplied context, must say "I don't have that
     information" rather than invent, must not give grades it wasn't given.
  3. Calls Claude (Sonnet 4.6) with prior thread messages + context.
  4. Persists both messages.
- No function-calling that touches the DB in v1 — context is pre-fetched. (A
  later version could add read-only, student-scoped tools.)

**Frontend.** Student → a "Advisor" chat panel (could live on the Dashboard or
Curriculum page). Streaming responses. Suggested-prompt chips ("What do I need
to graduate?", "Plan my next term").

**Edge cases.**
- Hallucination guard: the system prompt forbids stating any grade/requirement
  not present in the supplied context; the UI labels it as guidance, not an
  official record, with a link to the authoritative pages.
- "What-if" math (e.g. projected GWA) — compute deterministically in the
  backend and feed the result in, rather than trusting the model's arithmetic.
- Prompt injection from stored data is low-risk (it's the student's own data)
  but still delimit context as untrusted.
- Cost control: cap thread length, trim old turns.

**Effort breakdown.** 4 h context assembly + 4 h endpoint/streaming + 4 h
thread persistence + 6 h UI + 4 h prompt hardening + deterministic what-if =
~3 days.

**Dependencies.** Curriculum-progress, grades, schedule services (all shipped).
`ANTHROPIC_API_KEY`.

**Open questions.**
- Streaming (SSE) vs. simple request/response for v1? (Request/response is
  simpler; streaming is nicer UX.)
- Should faculty/admin get a parallel advisor scoped to their data? (Later.)

### 3.3 At-risk advising narrative — `S`

**Problem.** The deterministic at-risk flags (2.2) produce numbers
(`runningGrade: 72, missing: 3`). Faculty and advisers act faster on a sentence
than a JSON blob. Let the rule engine decide *who* is at risk (auditable,
deterministic) and let the LLM only *phrase* the explanation + suggest
interventions.

**Backend.** When a `risk_flags` row is raised (2.2), optionally call Claude
(Haiku 4.5) with the structured reason to generate a short narrative +
2–3 suggested interventions ("reach out about missed quizzes; the drop is
recent and recoverable"). Store alongside the flag. Fail-soft: no API key → no
narrative, the numeric flag still stands.

**Frontend.** Faculty at-risk widget and student "heads up" card show the
narrative instead of (or above) the raw numbers.

**Edge cases.** The *decision* must never depend on the LLM — it only writes
copy. If generation fails, the flag is unaffected. Keep wording supportive for
the student-facing variant; more clinical for faculty.

**Effort breakdown.** ~1 day (mostly prompt + wiring; rides on 2.2's data).

**Dependencies.** 2.2 (at-risk flags), `ANTHROPIC_API_KEY`.

### 3.4 Natural-language analytics ("ask your data") — `L`

**Problem.** Admins ask ad-hoc questions ("BSCS 2nd-years who failed COMP002
last term", "which faculty are overloaded this term") that today require a
predefined analytics tab or a SQL console. A natural-language query box would
be a force multiplier — but it's also the **highest-risk** AI feature here.

**Approach.** Constrained text-to-SQL over **read-only, allowlisted views**.
The model never sees raw tables or write capability.

**Data model.**
```sql
-- Curated, read-only views the AI is allowed to query. Nothing else is exposed.
CREATE VIEW ai_enrollments_v AS SELECT ... ;   -- denormalized, no PII beyond codes
CREATE VIEW ai_sections_v    AS SELECT ... ;
-- A dedicated, GRANT SELECT-only DB role used exclusively for these queries.
```

**Backend.**
- `POST /api/admin/ask` (admin only) — Claude (Sonnet 4.6) is given the view
  schemas and asked to emit a single `SELECT` against the allowlisted views.
- The backend **validates** the generated SQL before running: parse it, reject
  anything that isn't a single `SELECT`, references a non-allowlisted relation,
  or lacks a `LIMIT`. Execute under the read-only role. Return rows + a
  natural-language summary of the result.
- Log every question + generated SQL to `audit_logs`.

**Frontend.** Admin → command palette (extends the planned Cmd+K, 6.4) or a
dedicated "Ask" box on Analytics. Shows the answer, the underlying table, and
(collapsible) the generated SQL for transparency.

**Edge cases.**
- **Injection / destructive SQL:** the validator is the security boundary, not
  the prompt. Allowlist + single-SELECT + read-only role + statement timeout.
- Ambiguous questions → the model asks a clarifying question instead of
  guessing.
- Large result sets → enforce `LIMIT`, paginate.
- Wrong-but-plausible SQL → always show the generated SQL so an admin can sanity
  -check; label results as AI-derived.

**Effort breakdown.** 6 h views + read-only role + 6 h SQL validator (the hard
part) + 4 h endpoint + 4 h UI + 4 h prompt/eval = ~3 days, and worth extra
review time given the risk.

**Dependencies.** `ANTHROPIC_API_KEY`. Pairs with 6.4 (command palette).

**Open questions.**
- Ship only after a security review of the validator. Consider gating behind a
  feature flag initially.

### 3.5 Smart bulk-import column mapping — `S`

**Problem.** The bulk CSV importer (3.1, shipped) expects a fixed header
format. Real spreadsheets from a registrar have messy, reordered, or
differently-named columns ("Student No." vs `user_code`, "E-mail" vs `email`).
`FUTURE_FEATURES.md` already wants fuzzy column matching — an LLM does this
robustly.

**Backend.** During the existing preview step, send just the **header row +
2–3 sample rows** (not the whole file, and ideally without full PII — codes and
column names suffice) to Claude (Haiku 4.5) and ask it to map source columns →
the canonical schema fields, returning a JSON mapping + confidence. The
deterministic validator (Zod + DB dupe checks) still runs on the mapped data —
the AI only proposes the mapping.

**Frontend.** The import preview gains a "Column mapping" step showing the
proposed mapping with dropdowns to override before applying.

**Edge cases.** Low-confidence mappings default to "unmapped" and force a
manual pick. The AI never bypasses the existing row-level validation. Fail-soft:
no API key → fall back to today's exact-header matching.

**Effort breakdown.** ~1 day.

**Dependencies.** Bulk import (shipped), `ANTHROPIC_API_KEY`.

### 3.6 Grade anomaly detection — `S`

**Problem.** Suspicious patterns — an entire section with identical scores,
scores edited after finalize, a grade wildly inconsistent with the running
average — should be surfaced to the registrar for review. Mostly statistical;
AI helps by explaining *why* something looks off.

**Backend.** A §1 job scans recently finalized sections for statistical
outliers (deterministic rules). Optionally, Claude (Haiku 4.5) writes a
one-line explanation per flag for the review queue. Flags go to a
`risk`-style table or straight into `audit_logs` as a review item.

**Frontend.** Admin → a small "Review queue" listing anomalies with the
explanation and a link to the gradebook.

**Edge cases.** The detection is deterministic; AI only annotates. False
positives are expected — this is a *review* aid, never an automatic action on
grades.

**Effort breakdown.** ~1 day (rules) + 0.5 day (AI annotation).

**Dependencies.** §1, gradebook (shipped). AI portion optional.

---

## 4. Cross-cutting AI guardrails

Every AI feature in §3 **must** follow these. They are not optional polish —
they are the conditions under which AI is allowed near this system's data.

1. **No writes, ever.** AI features are read + suggest only. No AI path may
   modify grades, enrollments, users, or any record. Humans commit changes
   through the existing deterministic endpoints.
2. **Scope to the caller.** A student's AI features see only that student's
   data; faculty see only their sections; the only cross-student surface
   (3.4) runs under a read-only DB role over allowlisted views with a SQL
   validator as the security boundary.
3. **The eval anonymity contract is absolute** (3.1). Aggregate-only, `n ≥
   min_response_n`, never per-student rows, never paired with scores/dates/order.
   No admin "see who said what" tool is ever built.
4. **Decisions stay deterministic.** Rule engines decide *who* is at-risk, *what*
   SQL is safe, *whether* a row is valid. The LLM only explains, phrases,
   summarizes, or proposes — its output is always validated or advisory.
5. **Fail-soft.** No `ANTHROPIC_API_KEY` → the feature degrades to its
   non-AI behavior (exact-match import, raw comment list, numeric flags). The
   app never hard-depends on the AI provider. Mirror the old mailer pattern.
6. **Untrusted text is data, not instructions.** Student comments, CSV cells,
   and chat input are wrapped in delimited blocks; system prompts state that
   such content is never to be treated as instructions (prompt-injection
   defense).
7. **Auditable + transparent.** Log AI calls (feature, model, scope) to
   `audit_logs`. User-facing AI output is labeled as AI-generated and links to
   the authoritative non-AI source.
8. **Cost control.** Cache expensive generations (3.1 summaries, frozen once a
   window closes), cap thread/context length (3.2), rate-limit regeneration.

**Shared infra to build once:** `apps/backend/src/lib/ai/client.ts` — Anthropic
SDK wrapper with the fail-soft check, model selection, audit logging, and a
helper to wrap untrusted content in delimited blocks. Every §3 feature imports
it.

---

## 5. Recommended sequencing

Priorities balance value, risk, and dependency order.

### Phase 1 — Automation backbone (~3 days)
1. **§1 Job runner** — the enabler. Nothing scheduled works without it.
2. **2.1 Deadline & reminder digests** — immediately felt by every user;
   first real consumer of §1.

### Phase 2 — Flagship AI + early warning (~4 days)
3. **3.1 Eval free-text summarizer** — best fit, lowest risk, data + privacy
   boundary already exist. The AI feature to lead with.
4. **2.2 At-risk auto-flagging** + **3.3 advising narrative** — highest
   pedagogical impact; rule-based detection with AI only on the wording.

### Phase 3 — Registrar automation (~4 days)
5. **2.3 Auto-section generation** — removes the biggest manual registrar step.
6. **2.5 Time-based policy automations** — cheap once §1 + the underlying
   features (4.1/4.3/4.4) exist.
7. **2.4 Waitlist auto-promotion** — closes the loop on wishlist demand data.

### Phase 4 — Higher-risk / higher-ceiling (~6 days)
8. **3.2 Student advisor chatbot** — big UX win; needs careful grounding.
9. **3.4 Natural-language analytics** — gate behind a security review of the
   SQL validator before shipping.

### Smaller wins, slot in anywhere
- **3.5 Smart import mapping** (`S`), **2.6 Finalize-completeness check**
  (`S`), **3.6 Grade anomaly detection** (`S`).

**If you can build only one thing:** the **§1 job runner**, because it converts
a pile of already-specified "manual button" features into genuine automation.
**If you can build only one AI thing:** the **3.1 eval summarizer** — it's the
lowest-risk, best-fit use of data you already collect, behind a privacy
boundary you already enforce.

---

*Companion to `FUTURE_FEATURES.md` and `PROJECT_OVERVIEW.md`. When an item
here ships, mark it ✅ with a one-line "where it lives" note rather than
deleting it — keeps the trail.*
