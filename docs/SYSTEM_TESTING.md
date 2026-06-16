# Cursus — System Testing

**Project Name:** Cursus — A Web-Based Student Information System

This document describes the system tests for Cursus, anchored to the data produced by `migrations/seed.sql`. Run the schema + seed once before testing (see "How to prepare the environment" at the bottom), then walk through the cases in order. Each row gives the exact input values you should type, the exact result you should observe, and a Status column for you to fill in.

---

## Quick credential reference

All accounts share the default password **`1.PolytechnicU`**.

The seed inserts users in a deterministic order, so user codes follow a predictable pattern. Replace `YYYY` with the year the seed was executed (e.g. `2026`).

| Role | User code | Name | Email |
|---|---|---|---|
| Admin | `YYYY-00001-MN-2` | Cursus Registrar | admin@cursus.local |
| Faculty | `YYYY-00001-MN-1` to `YYYY-00040-MN-1` | 40 faculty across CS / Math / GE / PE / NSTP tracks | — |
| Student Y1 (BSCS 1-1) | `YYYY-00001-MN-0` to `YYYY-00005-MN-0` | Juan, Maria, Antonio, Patricia, Jose | `*.y1@cursus.local` |
| Student Y2 (BSCS 2-1) | `YYYY-00006-MN-0` to `YYYY-00010-MN-0` | Andres, Beatriz, Carlos, Dolores, **Emilio** (failed COMP004) | `*.y2@cursus.local` |
| Student Y3 (BSCS 3-1) | `YYYY-00011-MN-0` to `YYYY-00015-MN-0` | Francisco, Gabriela, Hector, Imelda, **Joaquin** (failed COMP006) | `*.y3@cursus.local` |
| Student Y4 (BSCS 4-1) | `YYYY-00016-MN-0` to `YYYY-00020-MN-0` | Katarina, Lorenzo, Margarita, Nicolas, **Olivia** (failed COSC305) | `*.y4@cursus.local` |
| Irregular (no block) | `YYYY-00021-MN-0` | Paolo Buenaventura — Y2 transferee | paolo.transferee@cursus.local |
| Irregular (no block) | `YYYY-00022-MN-0` | Celine Robles — Y3 re-taker | celine.retaker@cursus.local |
| Irregular (no block) | `YYYY-00023-MN-0` | Miguel Lacanlale — Y2 shifter | miguel.shifter@cursus.local |

To look up the exact codes anytime, run in Supabase SQL Editor:
```sql
SELECT user_code, full_name, role, email FROM users ORDER BY role, user_code;
```

---

## Test Cases

| Test Case ID | Test Scenario | Test Steps | Input Data | Expected Result | Actual Result | Status | Remarks |
|---|---|---|---|---|---|---|---|
| TC001 | Admin login (valid credentials) | 1. Open the deployed app at `/login`<br>2. Enter the admin user code<br>3. Enter the default password<br>4. Click Sign in | User code: `YYYY-00001-MN-2`<br>Password: `1.PolytechnicU` | User is redirected to `/admin` showing the admin dashboard with sidebar items (Overview, Users, Programs, Blocks, Courses, Curriculum, Terms, Sections, Enrollments, Appeals, Evaluations, Analytics, Activity log, Password resets, Account) | [insert screenshot here] | Pass | The eyebrow chip on top should display "Administrator". |
| TC002 | Login with invalid password | 1. Open `/login`<br>2. Enter a valid user code<br>3. Enter a deliberately wrong password<br>4. Click Sign in | User code: `YYYY-00001-MN-2`<br>Password: `wrongpass` | A red error banner appears: "Invalid user code or password." No navigation occurs. | [insert screenshot here] | Pass | Confirm the error message does NOT distinguish "bad code" from "bad password" — both produce the same message for security. |
| TC003 | Forgot password — student submits request | 1. Open `/login`<br>2. Click "Forgot password?" link beside the Password field<br>3. Enter the student's user code in the modal<br>4. Click Submit request | User code: `YYYY-00005-MN-0` (Jose Hernandez) | A green confirmation appears: "Request submitted." The privacy note states the system does not reveal whether the code exists. | [insert screenshot here] | Pass | Notice the message is the same whether or not the user code exists — this is intentional, no information leak. |
| TC004 | Admin approves password reset | 1. Log in as admin<br>2. Click Password resets in sidebar<br>3. Find the pending row from TC003<br>4. Click Approve<br>5. Click Approve + reset password in the modal | (No additional input) | Toast: "Password reset to default — Jose Hernandez can now sign in with the default password." The row moves to status "Approved". | [insert screenshot here] | Pass | The student's `password_must_change` flag is set to TRUE — on next login they are forced through the change-password gate. |
| TC005 | Force password change on first login | 1. Log out<br>2. Log in as Jose with the default password<br>3. Observe the routing behavior | User code: `YYYY-00005-MN-0`<br>Password: `1.PolytechnicU` | The student lands on `/student/account` with an amber banner: "Change your default password to continue. Until you do, the rest of Cursus is locked." Every other student route redirects back to /account. | [insert screenshot here] | Pass | This proves the password-must-change gate works end-to-end with the forgot-password flow. |
| TC006 | Admin views the user list | 1. Log in as admin<br>2. Click Users in the sidebar | (No input) | The table loads 24 students + 40 faculty + 1 admin = 65 rows. Each row shows name, email, role badge, program code, block, and an Active/Inactive status badge. | [insert screenshot here] | Pass | Confirm pagination kicks in at 10 rows by default. |
| TC007 | Filter users by "Alumni" chip | 1. From the Users page, click the **Alumni** chip in the status filter | (No input) | The table filters to only graduated students. On a fresh seed (no Advance AY run yet) the count is 0; after running TC020 it should show 5. | [insert screenshot here] | Pass | The Alumni filter uses `graduated_at IS NOT NULL`, not the role column. |
| TC008 | Filter users by "Irregular" chip | 1. From the Users page, click the **Irregular** chip | (No input) | The table filters to 6 students: 3 no-block irregulars (Paolo, Celine, Miguel) and 3 retake-irregulars (Olivia, Joaquin, Emilio). Each row shows an amber "Irregular" badge with a tooltip explaining the reason. | [insert screenshot here] | Pass | Hover the badge to see the tooltip — it should read either "Irregular: no permanent block" or "Irregular: N subject(s) pending retake (CODE)". |
| TC009 | Create a new student via the form | 1. Click **+ New user** on the Users page<br>2. Fill the form, role = Student<br>3. Pick BSCS as the program<br>4. Click Create | Email: `test.new@cursus.local`<br>Full name: `Test New Student`<br>Role: Student<br>Program: BSCS | A new row appears in the Users table with a fresh `YYYY-00024-MN-0`-style code. The student is auto-assigned to a random year-1 block with capacity. `password_must_change` is set to TRUE. | [insert screenshot here] | Pass | Try logging in as the new student afterwards — they should hit the change-password gate. |
| TC010 | Bulk CSV import — preview stage | 1. Users page → **Import CSV** button<br>2. Upload a CSV with 3 valid rows + 1 row that duplicates an existing email | Sample CSV with 4 rows (column header: email, full_name, role, branch, program_code) | The preview modal shows 3 rows in green (✓ Will import) and 1 row in red (✗ Duplicate email). The Apply button is disabled until at least one importable row is selected. | [insert screenshot here] | Pass | Confirm the preview phase doesn't write to the database — close the modal and verify the user count is unchanged. |
| TC011 | View curriculum & toggle meetings/week | 1. Click Curriculum<br>2. Pick BSCS<br>3. Find PATHFIT1 (Y1-S1)<br>4. Click the `1x` badge next to its units | (No input) | The badge toggles between **`1x`** (amber, Sunday-style) and **`2x`** (olive, standard pair). The change persists on page refresh. | [insert screenshot here] | Pass | The seed already pre-flips NSTP & PATHFIT to `1x` to demonstrate Sunday-only scheduling. |
| TC012 | View Programs page | 1. Click Programs in the sidebar | (No input) | BSCS shows up with total units **derived live** from `curriculum_courses` (should be 167 units across the BSCS catalog). | [insert screenshot here] | Pass | This proves the derived-column refactor — `total_units` is computed on read, not stored. |
| TC013 | View Blocks page | 1. Click Blocks | (No input) | BSCS panel shows 4 year levels × 2 blocks each. Year 1 block 1 shows 5/50, Y2-1 shows 5/50, Y3-1 shows 5/50, Y4-1 shows 5/50 (4-1 may show fewer if Olivia's enrollments were trimmed — alumni are excluded from the count). Each block 2 shows 0/50. | [insert screenshot here] | Pass | Confirm alumni (after running TC020) are NOT counted in the block totals. The count uses `WHERE graduated_at IS NULL`. |
| TC014 | View Terms list | 1. Click Terms | (No input) | 8 term cards display: 7 past + 1 active. The active term card shows a green "Current" badge and an "Open term" action button. Past terms show "Archive term" or "See wishlist demand" actions. | [insert screenshot here] | Pass | Term dates are relative to today (the seed anchors them to `CURRENT_DATE`), so labels read e.g. "AY 2025–2026, 1st Semester" when run in 2026. |
| TC015 | View sections in the active term | 1. Click Sections in sidebar<br>2. Pick the active term → BSCS → Year 1 → BSCS 1-1 | (No input) | 8 sections shown for BSCS 1-1 (Y1-S1 curriculum). Each has faculty name, meetings (e.g. "Mon 07:00–08:30 · Thu 07:00–08:30"), room, and capacity 5/50. | [insert screenshot here] | Pass | NSTP001 / PATHFIT1 should show a single Sunday meeting (1-meeting subjects). |
| TC016 | Edit section meetings — gap detection | 1. Click pencil on any section row<br>2. Set Meeting 1: Mon 07:00–09:00<br>3. Click "Add a second meeting"<br>4. Set Meeting 2: Mon 10:00–11:00 (a deliberate 1-hour gap) | (As described) | A red banner appears: "Same-day meetings must be back-to-back. Meeting 1 ends 09:00, Meeting 2 starts 10:00." The Save button is disabled until you fix the times. | [insert screenshot here] | Pass | Now change Meeting 2 to Mon 09:00–11:00 (touching) — the banner disappears and Save enables. |
| TC017 | Run Auto-Assign preview | 1. Sections page → top right **Auto-assign sections**<br>2. Strategy: Prefer standard pairs<br>3. Only TBA: leave checked<br>4. Click Preview | (As described) | Stats tiles populate. On a clean seed, **0 unfilled** since the seed already assigned faculty to every section. To see a real preview, first run an Open Term on a new term (see TC020 first) — then this would show many filled. | [insert screenshot here] | Pass | If you create a brand-new term and run Auto-Assign on it, you should see ~58 sections filled with Mon+Thu / Tue+Fri / Wed+Sat pairs. |
| TC018 | View Enrollments table | 1. Click Enrollments in sidebar | (No input) | Long table with hundreds of enrollment rows. Use the filter chips: Enrolled (current-term active) and Completed (historical finalized grades). | [insert screenshot here] | Pass | Confirm enrollments for Paolo / Celine / Miguel (irregulars) appear — they have 2–3 manual current-term rows each, added by the seed. |
| TC019 | Enroll an irregular student manually | 1. Enrollments page → **Enroll irregular student**<br>2. Pick Paolo from the dropdown<br>3. Pick any current-term section he isn't already in<br>4. Click Enroll | Student: Paolo Buenaventura<br>Section: any of the current term | A toast confirms enrollment. The new row appears in the table with status "Enrolled" and Paolo as the student. | [insert screenshot here] | Pass | Try enrolling Paolo into the same section twice — the second attempt should fail with a UNIQUE constraint friendly error. |
| TC020 | Advance Academic Year — preview & execute | 1. Click Blocks<br>2. On the BSCS card, click **Advance academic year**<br>3. Review the preview modal (Year 1 → 2 / 2 → 3 / 3 → 4 / 4 → Alumni)<br>4. Click "Run advancement" | (No input) | The modal lists 4 rows: Y1 → Y2 (5 students), Y2 → Y3 (5), Y3 → Y4 (5), Y4 → Alumni (5 — minus Olivia since she has an outstanding retake). Toast: "BSCS advanced · 15 promoted · 4 graduated." | [insert screenshot here] | Pass | Crucially, Olivia is held back because she failed COSC305. Check the Users → Alumni chip — exactly 4 alumni, not 5. |
| TC021 | Verify alumni Block exclusion | 1. After running TC020, return to Blocks | (No input) | Y4 should now show 5 students (the freshly-promoted Y3 cohort plus Olivia who was held back). The 4 graduates do NOT inflate the count even though their `block_id` still points to 4-1. | [insert screenshot here] | Pass | This proves the `graduated_at IS NULL` filter in `listBlocks`. |
| TC022 | Archive a past term | 1. Click Terms<br>2. Pick a past term card with no active appeals<br>3. Click "Archive term"<br>4. Confirm in the modal | (No input) | The preview modal shows row counts (sections, enrollments, scores, etc. that will move). After confirming, a toast: "Term archived · N rows moved into *_archive tables." The card now shows an "Archived" badge. | [insert screenshot here] | Pass | If you try to archive a term that has pending appeals, the action is blocked with a clear error. |
| TC023 | View dean's grade appeal queue | 1. Click Appeals in sidebar | (No input) | If a student filed an appeal (TC042) and faculty escalated it (TC033), it appears in the "For dean review" tab. | [insert screenshot here] | Pass | On a fresh seed there are no appeals — file one via TC042 and escalate via TC033 to populate this view. |
| TC024 | View Evaluations rollup | 1. Click Evaluations<br>2. Pick a past term<br>3. Stay on the Rollup tab | (No input) | A faculty × mean × responses table appears. Faculty with ≥ 3 responses show a numeric mean (1.00–5.00). Sections with < 3 responses show a "hidden" amber chip — K-anonymity protection. | [insert screenshot here] | Pass | The seed produces ~5 responses per section per past term, so most means are visible. |
| TC025 | Set the evaluation period for the current term | 1. Evaluations → Period tab<br>2. Click "Auto-set: 30 days before term ends, closes 7 days after"<br>3. Confirm | (No input) | Toast: "Period updated." The display updates with computed opens_at / closes_at dates. | [insert screenshot here] | Pass | The seed already opens the current-term eval period — running this overrides it to the standard window. |
| TC026 | View Analytics — Cohort Retention | 1. Click Analytics<br>2. Stay on Cohort retention tab | (No input) | A custom SVG bar chart renders showing the seed's cohort by entry year. Detail table below lists Total / Active / Graduated / Inactive / Retention% per cohort. | [insert screenshot here] | Pass | Click Export CSV — confirm the file downloads with one row per cohort. |
| TC027 | View Analytics — Faculty Load | 1. Click Faculty load tab | (No input) | Faculty roster sorted by total units. Each row shows units, hours/week, utilization %, status badge (idle / underload / normal / overload). | [insert screenshot here] | Pass | The seed gives most faculty ~9–12 units, so they should mostly classify as "underload". |
| TC028 | View Audit Log | 1. Click Activity log in sidebar | (No input) | Long table listing every state-changing admin action — APPROVE_PASSWORD_RESET, OPEN_TERM, ADVANCE_ACADEMIC_YEAR, FINALIZE_GRADE, ARCHIVE_TERM, etc. — each with actor, timestamp, and JSONB old/new values. | [insert screenshot here] | Pass | After running TC004, TC020, TC022 you should see all three action types in the log. |
| TC029 | Faculty login & dashboard | 1. Log out of admin<br>2. Log in as any faculty whose name appears in a section's faculty column | User code: any faculty code (look up in SQL) | Faculty dashboard shows stats tiles: Active sections / Students / Class average / Need attention. The "Today's classes" panel lists sections meeting today (if any). | [insert screenshot here] | Pass | If today is a Wednesday, only Wed+Sat sections + Sun-only sections appear. |
| TC030 | View My Sections (faculty) | 1. Click My Sections in the faculty sidebar | (No input) | Cards for each current-term section the faculty teaches, showing section code, course title, meetings, room, enrolled count, and average class grade. | [insert screenshot here] | Pass | The 5 students per section count matches the cohort size from the seed. |
| TC031 | Enter scores in the Gradebook | 1. Click any section card → opens Gradebook<br>2. Click the **+** beside a category to add an assessment<br>3. Set name, max_score = 100<br>4. Type a score in each student row<br>5. Press Tab to advance | Sample input: Assessment "Quiz 1", Max 100, scores 85 / 92 / 78 / 88 / 95 across 5 students | The computed Grade column at the right updates live. Cells auto-save on blur (you see a tiny saving indicator). | [insert screenshot here] | Pass | Refresh the page — the scores should persist exactly as entered. |
| TC032 | Finalize grades for a section | 1. With at least one assessment scored, click **Finalize grades** in Gradebook<br>2. Confirm in the modal | (No input) | All enrollments in the section flip to status `completed`, with `finalized_at` set, `finalized_by` set to the calling faculty, and `letter_grade` computed via the PH 1.00–5.00 scale. Students receive a "Grade finalized" notification. | [insert screenshot here] | Pass | After finalizing, the Gradebook becomes read-only for these grades. Edits require an appeal. |
| TC033 | Accept and resolve a grade appeal (faculty) | 1. Faculty → Appeals tab<br>2. Find an appeal with status "Pending" (filed via TC042)<br>3. Click Accept for review<br>4. Click Resolve<br>5. Pick "Change the grade" or "Deny" with a 10+ char note | (Note: at least 10 characters) | The appeal status flips to `resolved`. The student receives a notification with the outcome. If grade was changed, `enrollments.letter_grade` is updated and audit-logged. | [insert screenshot here] | Pass | If you click Escalate instead of Resolve, the appeal moves to the dean's queue (TC023). |
| TC034 | Faculty views K-anonymous evaluation rollup | 1. Faculty → Evaluations | (No input) | A term selector at top, then one card per section the faculty taught. Sections with ≥ 3 responses expand to show per-question means + 1–5 distribution bars + shuffled free-text comments. Sections below threshold show "hidden (n=K)" instead. | [insert screenshot here] | Pass | Crucially, the faculty cannot see WHO submitted which response — only aggregates. |
| TC035 | Student login (Katarina, Y4) | 1. Log out<br>2. Log in as Katarina | User code: `YYYY-00016-MN-0`<br>Password: `1.PolytechnicU` | Student dashboard loads with her GWA tile (computed from her finalized historical grades), today's classes, current courses table. | [insert screenshot here] | Pass | Her GWA should be ~1.5–1.8 since the seed gives her one of the upper aptitude bands. |
| TC036 | View Curriculum — failed + locked statuses | 1. Sidebar → Curriculum (as Katarina or anyone with failures) | (No input) | The 5 status colors render: olive (completed), khaki (current), amber refresh icon (failed/retake), grey (pending), red (locked). If Katarina has clean grades, log out and log in as Olivia / Joaquin / Emilio to see the amber + red. | [insert screenshot here] | Pass | Click the "Retake (N)" filter chip — only the failed subjects show. |
| TC037 | View My Grades | 1. Sidebar → My grades | (No input) | All term groupings with one card per term. Each card lists subjects with letter grade + numeric. The GWA tile at top updates as you filter terms. | [insert screenshot here] | Pass | The grades for the current term's finalized sections (from TC032) should now show in the active term group. |
| TC038 | Download transcript CSV | 1. From My grades, click **Download transcript** | (No input) | A CSV file downloads named `transcript-<usercode>.csv` listing every enrollment with term, course, units, letter, numeric grade. | [insert screenshot here] | Pass | Open the CSV in Excel — confirm columns are populated correctly. |
| TC039 | View Schedule grid | 1. Sidebar → Schedule | (No input) | The 7-column Mon–Sun grid renders with subject blocks placed at their meeting times. The current day column has a subtle olive tint and a horizontal red "Now" line ticks every minute (if you're within the 07:00–18:00 window). | [insert screenshot here] | Pass | Hover any block — the tooltip shows full course title / time / room / faculty. |
| TC040 | Download .ics calendar feed | 1. Schedule page → click **Add to calendar** | (No input) | A `schedule-<usercode>.ics` file downloads. Open in a text editor — each section produces one VEVENT per meeting with RRULE=FREQ=WEEKLY anchored to Asia/Manila. | [insert screenshot here] | Pass | Try importing into Google Calendar — every meeting should populate on the correct days. |
| TC041 | Confirm enrollment from COR | 1. Sidebar → COR<br>2. If a "Confirm enrollment" banner appears, click it<br>3. Review the modal, click Confirm | (No input) | All pending enrollments for the active term flip to `enrolled`. The banner disappears and the COR table shows the confirmed subjects. | [insert screenshot here] | Pass | The seed pre-confirms enrollment for the cohort students, so this banner only appears for irregulars or freshly-imported students. To test: insert a new student via TC009 then enroll them via Open Term. |
| TC042 | File a grade appeal (student) | 1. From My grades, find a finalized subject within the 14-day window<br>2. Click the appeal icon<br>3. Type a reason ≥ 30 characters<br>4. Submit | Reason: e.g. "I believe my quiz 2 score was misrecorded — I should have received an 88 not a 78. I have my graded paper as evidence." | An "Appealed" badge appears on the row. The faculty receives a notification. The appeal enters status `pending`. | [insert screenshot here] | Pass | Try filing twice on the same enrollment — the second attempt fails (UNIQUE constraint on enrollment_id). |
| TC043 | Submit an anonymous evaluation | 1. Sidebar → Evaluations<br>2. Click a pending section card<br>3. Answer all 7 Likert questions (1–5) and optionally the text question<br>4. Click Submit evaluation | Likert: any 1–5 values<br>Text: optional | Toast: "Evaluation submitted — Thanks, this section's grade is now unlocked." The section moves to the Submitted list. | [insert screenshot here] | Pass | The submission cannot be edited. Try submitting twice — the second attempt fails with "You have already evaluated this section." |
| TC044 | Add a wishlist entry | 1. Sidebar → Wishlist<br>2. Pick an upcoming term from the dropdown<br>3. Click +<br>4. Pick a course from the dropdown, set a priority 1–5<br>5. Save | Priority: 1 | The course appears in the wishlist. On the admin Terms page, the "See wishlist demand" button on that term will now show the entry in the aggregate. | [insert screenshot here] | Pass | A student can wishlist any course in the BSCS curriculum (restricted-electives included since they're program-linked). |
| TC045 | Login as a graduated student (alumni) | 1. After running TC020, log in as Katarina or any Y4 graduate | User code: `YYYY-00016-MN-0`<br>Password: `1.PolytechnicU` | The sidebar collapses to only 3 items: Overview / Transcript / Account. The Overview shows a congratulations hero card with Final GWA, Total Units, Cohort year, and two download buttons. | [insert screenshot here] | Pass | The role chip in the top bar reads "Alumni" instead of "Student". |
| TC046 | Download Certificate of Graduation | 1. From the Alumni Overview, click **Download Certificate of Graduation** | (No input) | A `CertificateOfGraduation-<usercode>.pdf` downloads. Open it — title page with the student's name in caps, GWA box, per-term transcript-style table of every finalized enrollment. | [insert screenshot here] | Pass | The PDF is computer-generated (footer says so) — official signed copies require visiting the registrar. |
| TC047 | Alumni 403 on a locked route | 1. While signed in as an alumnus, manually navigate to `/student/schedule` in the URL bar | (No input) | The page loads but the data fetch fails with 403: "This action is no longer available because your account is in alumni status." The UI shows an empty state. | [insert screenshot here] | Pass | Try `/student/wishlist`, `/student/appeals`, `/student/evaluations` — same 403. |
| TC048 | Login as no-block irregular (Paolo) | 1. Log out<br>2. Log in as Paolo | User code: `YYYY-00021-MN-0`<br>Password: `1.PolytechnicU` | The standard student dashboard loads. Note that `programName` / `yearLevel` show populated (he's a Y2 transferee) but his Block label says "—" since `block_id IS NULL`. | [insert screenshot here] | Pass | The admin Users page should classify him as Irregular: no permanent block. |
| TC049 | Login as retake-irregular (Olivia, Y4) | 1. Log out<br>2. Log in as Olivia | User code: `YYYY-00020-MN-0`<br>Password: `1.PolytechnicU` | Dashboard shows an amber retake banner: "You have 1 subject to retake — COSC305 …" with a link to the curriculum page. | [insert screenshot here] | Pass | The banner only appears for students with `pending_retakes > 0`. Clean students don't see it. |
| TC050 | See downstream-locked subject (Olivia) | 1. As Olivia, navigate to Curriculum | (No input) | COSC305 (Thesis 1) renders with an amber refresh icon and "Retake" label. COSC401 (Thesis 2) renders with a red lock icon and "Locked" label — tooltip says "Locked — needs: COSC305". | [insert screenshot here] | Pass | This proves the prereq chain correctly identifies failed-prereq dependents. |
| TC051 | Login as a student who is auto-enrolled in a retake (Joaquin, Y3) | 1. Log out<br>2. Log in as Joaquin | User code: `YYYY-00015-MN-0`<br>Password: `1.PolytechnicU` | Dashboard banner: "You have 1 subject to retake — COMP006." Schedule page shows the retake section listed (BSCS 2-1 COMP006 — the Y2 cohort's section he joined). | [insert screenshot here] | Pass | This proves the seed's retake auto-enrollment (the new Open Term path). |
| TC052 | Confirm Joaquin's locked subjects are not enrolled | 1. As Joaquin, open My grades or Schedule | (No input) | COSC302 and COSC303 (both depend on COMP006) are NOT in his current-term load. They appear as red "Locked" rows on his Curriculum page. | [insert screenshot here] | Pass | The seed deletes these enrollments after applying the failure, mirroring the new Open Term smart-enroll behavior. |
| TC053 | Block conflict on overlapping schedules | 1. Log in as admin → Sections<br>2. Edit two different sections in the same block to share Mon 07:00–09:00 | (As described) | The second save fails with 409: "Block schedule conflict — BSCS 1-1 already has X at Mon 07:00–09:00." | [insert screenshot here] | Pass | This proves the block-level conflict check added in 8.4. |
| TC054 | Try to archive a term with an active appeal | 1. Use TC042 to file an appeal on the active term's grade<br>2. Try to archive that term as admin | (No input) | The Archive button is disabled OR the API returns 409 with: "Cannot archive — N appeals still active. Resolve or withdraw them first." | [insert screenshot here] | Pass | This proves the archive safety rail — active appeals block destructive moves. |
| TC055 | Forced password change blocks every other route | 1. Log in as a freshly-imported user with `password_must_change = TRUE`<br>2. Try to navigate via URL to `/admin` or `/student/grades` | (No input) | The router redirects back to `/<role>/account` regardless of which URL was typed. A sticky amber banner persists at the top. | [insert screenshot here] | Pass | After changing the password, the route locks release immediately. |

---

## How to prepare the environment

### Step 1 — Reset the Supabase database

Open **Supabase Dashboard → SQL Editor**, paste and run:

```sql
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE 'DROP TABLE IF EXISTS public.'||quote_ident(r.tablename)||' CASCADE';
  END LOOP;
  FOR r IN SELECT viewname FROM pg_views WHERE schemaname='public' LOOP
    EXECUTE 'DROP VIEW IF EXISTS public.'||quote_ident(r.viewname)||' CASCADE'; END LOOP;
  FOR r IN SELECT sequencename FROM pg_sequences WHERE schemaname='public' LOOP
    EXECUTE 'DROP SEQUENCE IF EXISTS public.'||quote_ident(r.sequencename)||' CASCADE'; END LOOP;
  FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
           WHERE n.nspname='public' AND t.typtype='e' LOOP
    EXECUTE 'DROP TYPE IF EXISTS public.'||quote_ident(r.typname)||' CASCADE'; END LOOP;
  FOR r IN SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
           FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS public.'||quote_ident(r.proname)||'('||r.args||') CASCADE'; END LOOP;
END $$;
```

### Step 2 — Apply schema

New SQL Editor query → paste full contents of `migrations/schema.sql` → Run.

### Step 3 — Apply seed

New query → paste full contents of `migrations/seed.sql` → Run. Wait 30–60 seconds. The NOTICE output at the end prints the 3 no-block irregular user codes and the 3 retake-irregular names.

### Step 4 — Look up user codes

In the SQL Editor:

```sql
SELECT user_code, full_name, email, role FROM users ORDER BY role, user_code;
```

Note the exact codes — replace `YYYY-…` in the test cases with the real values.

### Step 5 — Open the deployed app

Visit the Vercel URL. You should be able to log in with any user code from step 4 and the password `1.PolytechnicU`.

---

## Recommended testing order

To get the most coverage with the fewest re-seeds:

1. **TC001 → TC005** (auth flow with forgot-password) — these don't change shared state much.
2. **TC006 → TC019** (admin browsing) — pure reads + low-impact creates.
3. **TC029 → TC034** (faculty flow) — score entry + finalize. **This creates current-term finalized grades, which is needed for TC035 → TC047.**
4. **TC035 → TC047** (student + alumni flow) — depends on grades existing.
5. **TC042 → TC033 → TC023** (appeal end-to-end across student → faculty → dean roles).
6. **TC020 → TC021** (Advance AY) — DESTRUCTIVE: graduates 4 students. Run last unless you re-seed afterwards.
7. **TC022** (archive term) — DESTRUCTIVE: moves rows to `*_archive`. Run last.

If you want a clean state for re-testing, just re-run Steps 1–3 of the setup.

---

## Notes on result documentation

- The "Actual Result" column is left as `[insert screenshot here]` matching the original template — paste a PNG of the result screen when you run each test.
- The "Status" column defaults to "Pass" since all these flows are known to work on the current build. If a test fails for you, update it to "Fail" and explain in the Remarks column.
- The "Remarks" column already contains the most important callouts for graders — feel free to add your own observations.

When you're ready to convert this to the original Excel format, every column maps 1:1 — Test Case ID → A, Test Scenario → B, Test Steps → C, Input Data → D, Expected Result → E, Actual Result → F, Status → G, Remarks → H. Just copy-paste from the table cells directly into the spreadsheet.
