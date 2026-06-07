-- ============================================================
-- SIS Canonical Schema (Cursus)
-- PostgreSQL 15+ / Supabase
--
-- Usage (FRESH SETUP):
--   1. Drop all existing tables/types/sequences first.
--      Easiest: Supabase Dashboard → Database → Tables → delete schema, OR run:
--        DROP SCHEMA public CASCADE; CREATE SCHEMA public;
--   2. Paste this entire file into Supabase SQL Editor and run.
--   3. Then run migrations/seed.sql to insert the admin user, programs,
--      and the BSCS curriculum.
--
-- KEY MODEL: a `section` is bound to a `block`. The block is the cohort,
-- the section is *that cohort's class for one course in one term*. Sections
-- are never created manually — they are materialised by the "Open Term"
-- bulk action from the program's curriculum template.
-- ============================================================


-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE user_role         AS ENUM ('admin', 'faculty', 'student');
CREATE TYPE enroll_status     AS ENUM ('pending', 'enrolled', 'dropped', 'completed');
CREATE TYPE semester_type     AS ENUM ('1', '2', 'summer');
CREATE TYPE course_visibility AS ENUM ('public', 'restricted');
CREATE TYPE availability_kind AS ENUM ('teaching', 'office_hour');


-- ============================================================
-- SEQUENCES — per-role user code numbering
-- ============================================================

CREATE SEQUENCE student_code_seq START 1;
CREATE SEQUENCE faculty_code_seq START 1;
CREATE SEQUENCE admin_code_seq   START 1;


-- ============================================================
-- PROGRAMS  (degree programs)
-- ============================================================

CREATE TABLE programs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            TEXT NOT NULL UNIQUE,        -- e.g. 'BSCS'
    name            TEXT NOT NULL,
    -- Derived field — the API computes the live total from curriculum_courses
    -- on every read. The stored value is a no-op cache that defaults to 0.
    total_units     INT  NOT NULL DEFAULT 0 CHECK (total_units >= 0),
    year_levels     INT  NOT NULL DEFAULT 4  CHECK (year_levels BETWEEN 1 AND 8),
    blocks_per_year INT  NOT NULL DEFAULT 3  CHECK (blocks_per_year > 0),
    block_capacity  INT  NOT NULL DEFAULT 50 CHECK (block_capacity > 0)
);


-- ============================================================
-- BLOCKS  (cohort + scheduling unit, e.g. 'BSCS 1-1')
--   Each block holds N students and gets one auto-generated
--   `sections` row per curriculum course per term.
-- ============================================================

CREATE TABLE blocks (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id   UUID        NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    year_level   INT         NOT NULL CHECK (year_level > 0),
    block_number INT         NOT NULL CHECK (block_number > 0),
    capacity     INT         NOT NULL DEFAULT 50 CHECK (capacity > 0),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (program_id, year_level, block_number)
);

CREATE INDEX idx_blocks_program ON blocks(program_id);


-- ============================================================
-- USERS
-- ============================================================

CREATE TABLE users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_code     TEXT        UNIQUE,             -- e.g. '2026-00001-MN-2'
    email         TEXT        NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,
    full_name     TEXT        NOT NULL,
    role          user_role   NOT NULL,
    branch        TEXT        NOT NULL DEFAULT 'MN',
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    program_id    UUID        REFERENCES programs(id) ON DELETE SET NULL,
    year_level    INT,
    -- NULL block_id = irregular student (attached to specific sections by hand)
    block_id      UUID        REFERENCES blocks(id)   ON DELETE SET NULL,
    -- NOT NULL once a final-year cohort has been graduated. is_active is set
    -- to FALSE at the same time, so graduated students can't sign in but their
    -- record persists for transcripts.
    graduated_at  TIMESTAMPTZ,
    -- Soft cap consumed by the section auto-assigner (3.4). NULL = unlimited.
    -- 24 units/week is a common PH teaching-load default.
    max_teaching_units INT  DEFAULT 24
                            CHECK (max_teaching_units IS NULL OR max_teaching_units BETWEEN 0 AND 60),
    -- Forces the password-change flow on the next login. Set TRUE on creation
    -- and when an admin resets a password; cleared when the user changes it.
    password_must_change BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_block      ON users(block_id);
CREATE INDEX idx_users_program    ON users(program_id);
CREATE INDEX idx_users_graduated  ON users(graduated_at) WHERE graduated_at IS NOT NULL;


-- ============================================================
-- COURSES  (catalog — no program_id; see course_programs + curriculum_courses)
-- ============================================================

CREATE TABLE courses (
    id         UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    code       TEXT              NOT NULL UNIQUE,         -- e.g. 'COMP 001'
    title      TEXT              NOT NULL,
    units      INT               NOT NULL CHECK (units > 0),
    visibility course_visibility NOT NULL DEFAULT 'public'
);


-- ============================================================
-- COURSE_PROGRAMS  (m2m — used only when visibility = 'restricted')
--   A course with visibility='restricted' is only usable by programs
--   linked here. Public courses bypass this table entirely.
-- ============================================================

CREATE TABLE course_programs (
    course_id  UUID NOT NULL REFERENCES courses(id)  ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    PRIMARY KEY (course_id, program_id)
);

CREATE INDEX idx_course_programs_program ON course_programs(program_id);


-- ============================================================
-- COURSE_PREREQUISITES  (self-ref m2m — global per-course)
-- ============================================================

CREATE TABLE course_prerequisites (
    course_id       UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    prerequisite_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    PRIMARY KEY (course_id, prerequisite_id),
    CHECK (course_id <> prerequisite_id)
);


-- ============================================================
-- CURRICULUM_COURSES  (per-program year/sem placement)
--   The admin builds each program's curriculum here. A single
--   catalog course may appear in multiple programs at different
--   year/sem slots.
-- ============================================================

CREATE TABLE curriculum_courses (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id    UUID          NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    course_id     UUID          NOT NULL REFERENCES courses(id)  ON DELETE CASCADE,
    year_level    INT           NOT NULL CHECK (year_level > 0),
    semester      semester_type NOT NULL,
    display_order INT           NOT NULL DEFAULT 0,
    UNIQUE (program_id, course_id)
);

CREATE INDEX idx_curriculum_program ON curriculum_courses(program_id, year_level, semester);


-- ============================================================
-- TERMS
-- ============================================================

CREATE TABLE terms (
    id         UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT          NOT NULL,             -- e.g. 'AY 2025–2026, 1st Semester'
    semester   semester_type NOT NULL,             -- which sem of the curriculum to use
    start_date DATE          NOT NULL,
    end_date   DATE          NOT NULL,
    is_active  BOOLEAN       NOT NULL DEFAULT FALSE,
    CHECK (end_date > start_date)
);


-- ============================================================
-- SECTIONS  (a block's class for one course in one term)
--
--   At most one section per (block, course, term).
--   section_code is auto-generated by the service layer as
--   '<program> <year>-<block> <course>' (e.g. 'BSCS 1-1 COMP 002').
--   faculty_id is nullable so the bulk "Open Term" action can
--   create TBA sections to be assigned later.
-- ============================================================

CREATE TABLE sections (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    block_id     UUID NOT NULL REFERENCES blocks(id)   ON DELETE CASCADE,
    course_id    UUID NOT NULL REFERENCES courses(id),
    term_id      UUID NOT NULL REFERENCES terms(id)    ON DELETE CASCADE,
    faculty_id   UUID          REFERENCES users(id),   -- nullable: 'TBA'
    section_code TEXT NOT NULL,
    day_of_week  TEXT,
    start_time   TIME,
    end_time     TIME,
    room         TEXT,
    capacity     INT  NOT NULL CHECK (capacity > 0),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (block_id, course_id, term_id),
    CHECK (end_time IS NULL OR start_time IS NULL OR end_time > start_time)
);

CREATE INDEX idx_sections_block   ON sections(block_id);
CREATE INDEX idx_sections_term    ON sections(term_id);
CREATE INDEX idx_sections_faculty ON sections(faculty_id);


-- ============================================================
-- FACULTY_AVAILABILITY  (weekly teaching + office-hour slots)
--
--   `day_of_week` uses the same compact format as sections
--   ('MWF', 'TTh', 'SunSat', …). Slots are independent rows —
--   one teaching block per row, one office-hour block per row.
-- ============================================================

CREATE TABLE faculty_availability (
    id          UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    faculty_id  UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_of_week TEXT              NOT NULL,
    start_time  TIME              NOT NULL,
    end_time    TIME              NOT NULL,
    kind        availability_kind NOT NULL,
    created_at  TIMESTAMPTZ       NOT NULL DEFAULT now(),
    CHECK (end_time > start_time)
);

CREATE INDEX idx_faculty_availability_faculty ON faculty_availability(faculty_id);


-- ============================================================
-- ENROLLMENTS
-- ============================================================

CREATE TABLE enrollments (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id     UUID          NOT NULL REFERENCES users(id),
    section_id     UUID          NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    status         enroll_status NOT NULL DEFAULT 'enrolled',
    enrolled_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    numeric_grade  NUMERIC(5,2)  CHECK (numeric_grade >= 0 AND numeric_grade <= 100),
    letter_grade   TEXT,
    finalized_at   TIMESTAMPTZ,
    finalized_by   UUID          REFERENCES users(id),
    UNIQUE (student_id, section_id)
);

CREATE INDEX idx_enrollments_section ON enrollments(section_id);
CREATE INDEX idx_enrollments_student ON enrollments(student_id);


-- ============================================================
-- GRADEBOOK
-- ============================================================

CREATE TABLE assessment_categories (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id    UUID         NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    name          TEXT         NOT NULL,
    weight        NUMERIC(5,2) NOT NULL CHECK (weight >= 0 AND weight <= 100),
    display_order INT          NOT NULL DEFAULT 0,
    UNIQUE (section_id, name)
);

CREATE INDEX idx_categories_section ON assessment_categories(section_id);

CREATE TABLE assessments (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id   UUID         NOT NULL REFERENCES assessment_categories(id) ON DELETE CASCADE,
    name          TEXT         NOT NULL,
    max_score     NUMERIC(7,2) NOT NULL CHECK (max_score > 0),
    display_order INT          NOT NULL DEFAULT 0
);

CREATE INDEX idx_assessments_category ON assessments(category_id);

CREATE TABLE scores (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID         NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    enrollment_id UUID         NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    score         NUMERIC(7,2) CHECK (score >= 0),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_by    UUID         REFERENCES users(id),
    UNIQUE (assessment_id, enrollment_id)
);

CREATE INDEX idx_scores_enrollment ON scores(enrollment_id);


-- ============================================================
-- AUDIT LOG
-- ============================================================

CREATE TABLE audit_logs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        REFERENCES users(id),
    action      TEXT        NOT NULL,       -- 'UPDATE_SCORE', 'FINALIZE_GRADE', 'PROMOTE_YEAR', 'OPEN_TERM'…
    entity_type TEXT        NOT NULL,
    entity_id   UUID,
    old_value   JSONB,
    new_value   JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ============================================================
-- GRADE APPEALS  (FUTURE_FEATURES 4.2 — student → faculty → dean state machine)
-- ============================================================

CREATE TABLE grade_appeals (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id   UUID         NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    student_id      UUID         NOT NULL REFERENCES users(id),
    reason          TEXT         NOT NULL,
    status          TEXT         NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','faculty_review','dean_review','resolved','withdrawn')),
    faculty_note    TEXT,
    dean_note       TEXT,
    outcome         TEXT         CHECK (outcome IS NULL OR outcome IN ('grade_changed','denied','withdrawn')),
    resolved_grade  TEXT,
    resolved_numeric NUMERIC(5,2) CHECK (resolved_numeric IS NULL OR (resolved_numeric >= 0 AND resolved_numeric <= 100)),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    resolved_at     TIMESTAMPTZ,
    UNIQUE (enrollment_id)
);
CREATE INDEX idx_appeals_student ON grade_appeals(student_id, created_at DESC);
CREATE INDEX idx_appeals_status  ON grade_appeals(status);


-- ============================================================
-- FACULTY QUALIFICATIONS  (which courses a faculty can / wants to teach)
-- ============================================================

CREATE TABLE faculty_qualifications (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    faculty_id  UUID         NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    course_id   UUID         NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    preference  INT          NOT NULL DEFAULT 3 CHECK (preference BETWEEN 1 AND 5),
    notes       TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (faculty_id, course_id)
);
CREATE INDEX idx_faculty_qual_faculty ON faculty_qualifications(faculty_id);
CREATE INDEX idx_faculty_qual_course  ON faculty_qualifications(course_id);


-- ============================================================
-- WISHLIST  (student pre-registration intent for an upcoming term)
-- ============================================================

CREATE TABLE wishlist_entries (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id  UUID         NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    term_id     UUID         NOT NULL REFERENCES terms(id)   ON DELETE CASCADE,
    course_id   UUID         NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    priority    INT          NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
    notes       TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (student_id, term_id, course_id)
);

CREATE INDEX idx_wishlist_student_term ON wishlist_entries(student_id, term_id);
CREATE INDEX idx_wishlist_term_course  ON wishlist_entries(term_id, course_id);


-- ============================================================
-- NOTIFICATIONS  (in-app bell-icon feed; one row per recipient)
-- ============================================================

CREATE TABLE notifications (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind       TEXT         NOT NULL,        -- 'grade_finalized', 'term_opened', 'schedule_changed', …
    title      TEXT         NOT NULL,
    body       TEXT,
    link       TEXT,                          -- relative app path, e.g. /student/grades
    data       JSONB,
    read_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread  ON notifications (user_id, read_at, created_at DESC);
CREATE INDEX idx_notifications_user_created ON notifications (user_id, created_at DESC);


-- ============================================================
-- TRIGGER: category weights per section must sum to ≤ 100%
-- ============================================================

CREATE OR REPLACE FUNCTION check_category_weights()
RETURNS TRIGGER AS $$
DECLARE
    total NUMERIC;
    sid   UUID := COALESCE(NEW.section_id, OLD.section_id);
BEGIN
    SELECT COALESCE(SUM(weight), 0) INTO total
    FROM assessment_categories
    WHERE section_id = sid;

    IF total > 100 THEN
        RAISE EXCEPTION
            'Category weights for section % exceed 100%% (current total: %)', sid, total;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_category_weights
    AFTER INSERT OR UPDATE OR DELETE ON assessment_categories
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION check_category_weights();
-- ============================================================
-- 016_term_archive.sql  (FUTURE_FEATURES 3.6 — Past-term archive)
--
-- Two years from now, the live `enrollments` / `scores` tables will
-- hold hundreds of thousands of stale rows weighing down every query.
-- This migration creates parallel `*_archive` tables and a flag on
-- `terms` so an admin can move a finished term's data out of the hot
-- path. Transcripts / TORs can still reach archived rows via a UNION
-- view (see `enrollments_full_v`).
--
-- Design notes:
--   • `LIKE INCLUDING ALL` copies PK, defaults, CHECKs, indexes, and
--     unique constraints but does NOT copy foreign keys — exactly
--     what we want. Archived rows must NOT FK back to live tables
--     because the live parents are gone after the move.
--   • Every archive table gets two denormalised columns:
--       archived_term_id UUID         — fast lookup by term
--       archived_at      TIMESTAMPTZ  — when this batch was archived
--     The term_id is needed because `enrollments` / `scores` reach
--     `term_id` only through `sections.term_id` in live data; once
--     archived, that JOIN path is gone.
--   • Resolved/withdrawn appeals are copied to `grade_appeals_archive`
--     before enrollments are deleted, so the audit trail survives.
--     Archiving is REFUSED when any active appeal exists for the term
--     (see archive.service.ts).
-- ============================================================

ALTER TABLE terms
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_terms_archived_at ON terms(archived_at);

-- ── Sections ────────────────────────────────────────────────
DROP TABLE IF EXISTS sections_archive;
CREATE TABLE sections_archive            (LIKE sections            INCLUDING ALL);
ALTER TABLE sections_archive
  ADD COLUMN archived_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX idx_sections_archive_term ON sections_archive(term_id);

-- ── Enrollments ─────────────────────────────────────────────
DROP TABLE IF EXISTS enrollments_archive;
CREATE TABLE enrollments_archive         (LIKE enrollments         INCLUDING ALL);
ALTER TABLE enrollments_archive
  ADD COLUMN archived_term_id UUID,
  ADD COLUMN archived_at      TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX idx_enrollments_archive_term    ON enrollments_archive(archived_term_id);
CREATE INDEX idx_enrollments_archive_student ON enrollments_archive(student_id);

-- ── Gradebook (categories, assessments, scores) ─────────────
DROP TABLE IF EXISTS assessment_categories_archive;
CREATE TABLE assessment_categories_archive (LIKE assessment_categories INCLUDING ALL);
ALTER TABLE assessment_categories_archive
  ADD COLUMN archived_term_id UUID,
  ADD COLUMN archived_at      TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX idx_categories_archive_term ON assessment_categories_archive(archived_term_id);

DROP TABLE IF EXISTS assessments_archive;
CREATE TABLE assessments_archive         (LIKE assessments         INCLUDING ALL);
ALTER TABLE assessments_archive
  ADD COLUMN archived_term_id UUID,
  ADD COLUMN archived_at      TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX idx_assessments_archive_term ON assessments_archive(archived_term_id);

DROP TABLE IF EXISTS scores_archive;
CREATE TABLE scores_archive              (LIKE scores              INCLUDING ALL);
ALTER TABLE scores_archive
  ADD COLUMN archived_term_id UUID,
  ADD COLUMN archived_at      TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX idx_scores_archive_term ON scores_archive(archived_term_id);

-- ── Resolved appeals (4.2) ──────────────────────────────────
-- Active appeals block archival; resolved/withdrawn ones come with us.
DROP TABLE IF EXISTS grade_appeals_archive;
CREATE TABLE grade_appeals_archive       (LIKE grade_appeals       INCLUDING ALL);
ALTER TABLE grade_appeals_archive
  ADD COLUMN archived_term_id UUID,
  ADD COLUMN archived_at      TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX idx_appeals_archive_term ON grade_appeals_archive(archived_term_id);

-- ── Transcript view: live UNION archive ─────────────────────
-- The student grades / transcript page should never care whether a
-- term has been archived. Read through this view to get both.
CREATE OR REPLACE VIEW enrollments_full_v AS
  SELECT id, student_id, section_id, status, enrolled_at,
         numeric_grade, letter_grade, finalized_at, finalized_by,
         FALSE AS is_archived, NULL::uuid AS archived_term_id
    FROM enrollments
  UNION ALL
  SELECT id, student_id, section_id, status, enrolled_at,
         numeric_grade, letter_grade, finalized_at, finalized_by,
         TRUE  AS is_archived, archived_term_id
    FROM enrollments_archive;

CREATE OR REPLACE VIEW sections_full_v AS
  SELECT id, block_id, course_id, term_id, faculty_id, section_code,
         day_of_week, start_time, end_time, room, capacity, created_at,
         FALSE AS is_archived
    FROM sections
  UNION ALL
  SELECT id, block_id, course_id, term_id, faculty_id, section_code,
         day_of_week, start_time, end_time, room, capacity, created_at,
         TRUE  AS is_archived
    FROM sections_archive;
-- ============================================================
-- 017_section_meetings.sql  (FUTURE_FEATURES 2.6 — Multi-meeting section schedule)
--
-- Promotes the section schedule from a single
--   (day_of_week TEXT, start_time TIME, end_time TIME)
-- triple on `sections` to a `section_meetings` child table that can
-- hold 1 or 2 meetings per week with independent times.
--
-- Constraints (Universidad Mariana policy):
--   • At most 2 meetings per section.
--   • If both meetings share a day, they must be back-to-back —
--     no gap between them.
--   • day_of_week is one of Mon/Tue/Wed/Thu/Fri/Sat/Sun.
--   • Curriculum drives meeting count via curriculum_courses.meetings_per_week.
--
-- Backfill from existing rows:
--   • Single-day patterns ('Mon', 'Sat', 'Sun')                    → 1 meeting.
--   • 2-day patterns ('MTh', 'TF', 'MW', 'TTh', 'WSat', ...)       → 2 meetings.
--   • 3+ day patterns ('MWF', 'TThSat', ...)                       → flagged into
--     `migration_backfill_problems`; section schedule wiped to TBA.
-- ============================================================

-- ── A. curriculum_courses.meetings_per_week ─────────────────
ALTER TABLE curriculum_courses
  ADD COLUMN IF NOT EXISTS meetings_per_week INT NOT NULL DEFAULT 2
  CHECK (meetings_per_week IN (1, 2));

-- ── B. section_meetings ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS section_meetings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id  UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL
              CHECK (day_of_week IN ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS idx_section_meetings_section ON section_meetings(section_id);
CREATE INDEX IF NOT EXISTS idx_section_meetings_day     ON section_meetings(day_of_week);

-- ── C. Cap trigger: 1-or-2 meetings; same-day pair must be back-to-back ─────
CREATE OR REPLACE FUNCTION check_section_meeting_rules() RETURNS TRIGGER AS $$
DECLARE
  v_section_id UUID;
  v_count      INT;
  v_rec        RECORD;
  v_first      RECORD;
  v_second     RECORD;
BEGIN
  v_section_id := COALESCE(NEW.section_id, OLD.section_id);

  SELECT count(*) INTO v_count FROM section_meetings WHERE section_id = v_section_id;
  IF v_count > 2 THEN
    RAISE EXCEPTION 'A section can have at most 2 meetings per week (section_id=%)', v_section_id;
  END IF;

  -- If both meetings share a day, the earlier one's end_time must equal
  -- the later one's start_time (no gap, no overlap).
  IF v_count = 2 THEN
    SELECT day_of_week, start_time, end_time INTO v_first
      FROM section_meetings WHERE section_id = v_section_id ORDER BY start_time LIMIT 1;
    SELECT day_of_week, start_time, end_time INTO v_second
      FROM section_meetings WHERE section_id = v_section_id ORDER BY start_time OFFSET 1 LIMIT 1;

    IF v_first.day_of_week = v_second.day_of_week THEN
      IF v_first.end_time <> v_second.start_time THEN
        RAISE EXCEPTION
          'Same-day meetings must be back-to-back (no gap) for section %: % %–% then %–%',
          v_section_id,
          v_first.day_of_week, v_first.start_time, v_first.end_time,
          v_second.start_time, v_second.end_time;
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_section_meeting_rules ON section_meetings;
CREATE CONSTRAINT TRIGGER trg_section_meeting_rules
  AFTER INSERT OR UPDATE OR DELETE ON section_meetings
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_section_meeting_rules();

-- ── D. Problem log for backfill ─────────────────────────────
CREATE TABLE IF NOT EXISTS migration_backfill_problems (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration   TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   UUID NOT NULL,
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── E. Backfill from legacy columns ─────────────────────────
DO $$
DECLARE
  s          RECORD;
  rest       TEXT;
  days       TEXT[];
  d          TEXT;
  ok_count   INT := 0;
  flag_count INT := 0;
BEGIN
  FOR s IN
    SELECT id, day_of_week, start_time, end_time
      FROM sections
     WHERE day_of_week IS NOT NULL
       AND start_time  IS NOT NULL
       AND end_time    IS NOT NULL
  LOOP
    rest := REPLACE(s.day_of_week, ' ', '');
    days := ARRAY[]::TEXT[];

    -- Multi-char tokens first so 'Th' doesn't consume the T from TF.
    WHILE rest ~* 'sun' LOOP
      days := array_append(days, 'Sun');
      rest := regexp_replace(rest, 'sun', '', 'i');
    END LOOP;
    WHILE rest ~* 'sat' LOOP
      days := array_append(days, 'Sat');
      rest := regexp_replace(rest, 'sat', '', 'i');
    END LOOP;
    WHILE rest ~* 'th' LOOP
      days := array_append(days, 'Thu');
      rest := regexp_replace(rest, 'th', '', 'i');
    END LOOP;
    -- Singles
    FOREACH d IN ARRAY string_to_array(upper(rest), NULL) LOOP
      IF d = 'M' THEN days := array_append(days, 'Mon');
      ELSIF d = 'T' THEN days := array_append(days, 'Tue');
      ELSIF d = 'W' THEN days := array_append(days, 'Wed');
      ELSIF d = 'F' THEN days := array_append(days, 'Fri');
      END IF;
    END LOOP;

    -- Deduplicate, preserve order
    days := ARRAY(SELECT DISTINCT unnest(days));

    IF array_length(days, 1) IS NULL OR array_length(days, 1) = 0 THEN
      -- Couldn't parse anything — flag.
      INSERT INTO migration_backfill_problems (migration, entity_type, entity_id, detail)
        VALUES ('017_section_meetings', 'sections', s.id,
                jsonb_build_object('reason','unparseable_days','raw',s.day_of_week));
      flag_count := flag_count + 1;
      CONTINUE;
    END IF;

    IF array_length(days, 1) > 2 THEN
      -- 3+ day pattern violates the cap.
      INSERT INTO migration_backfill_problems (migration, entity_type, entity_id, detail)
        VALUES ('017_section_meetings', 'sections', s.id,
                jsonb_build_object(
                  'reason','too_many_days','raw',s.day_of_week,
                  'parsed_days', to_jsonb(days),
                  'start_time', s.start_time::text, 'end_time', s.end_time::text));
      flag_count := flag_count + 1;
      CONTINUE;
    END IF;

    -- 1 or 2 days — backfill one row each, same times for both.
    FOREACH d IN ARRAY days LOOP
      INSERT INTO section_meetings (section_id, day_of_week, start_time, end_time)
        VALUES (s.id, d, s.start_time, s.end_time);
    END LOOP;
    ok_count := ok_count + 1;
  END LOOP;

  RAISE NOTICE '[017_section_meetings] backfill complete: % sections OK, % sections flagged',
    ok_count, flag_count;
END $$;

-- ── F. Drop legacy columns ──────────────────────────────────
-- `section_meetings` is now the only source of truth for schedules.
--
-- `sections_full_v` from migration 016 references the legacy columns, so we
-- drop the view first, drop the columns from both sections AND sections_archive
-- (sections_archive inherited them via LIKE), and then rebuild the view
-- without those columns.

DROP VIEW IF EXISTS sections_full_v;

ALTER TABLE sections         DROP COLUMN IF EXISTS day_of_week;
ALTER TABLE sections         DROP COLUMN IF EXISTS start_time;
ALTER TABLE sections         DROP COLUMN IF EXISTS end_time;
ALTER TABLE sections_archive DROP COLUMN IF EXISTS day_of_week;
ALTER TABLE sections_archive DROP COLUMN IF EXISTS start_time;
ALTER TABLE sections_archive DROP COLUMN IF EXISTS end_time;

CREATE VIEW sections_full_v AS
  SELECT id, block_id, course_id, term_id, faculty_id, section_code,
         room, capacity, created_at,
         FALSE AS is_archived
    FROM sections
  UNION ALL
  SELECT id, block_id, course_id, term_id, faculty_id, section_code,
         room, capacity, created_at,
         TRUE  AS is_archived
    FROM sections_archive;
-- ============================================================
-- 018_faculty_evaluation.sql  (FUTURE_FEATURES 4.6 — Anonymous faculty evaluation)
--
-- PH college standard: students evaluate their instructors BEFORE
-- final grades are released. The evaluation must be ANONYMOUS so no
-- student is identifiable to the faculty being rated, and it must be
-- GATED on time (opens 30 days before term end) and on grade reveal
-- (final grade hidden until the student has evaluated).
--
-- Anonymity contract:
--   • `evaluations.student_id` exists ONLY to enforce one-response-per-
--     student-per-section AND to drive the per-student grade-reveal gate.
--     It is NEVER joined to `eval_answers` in any faculty- or admin-
--     facing query. Every read aggregates with a K-anonymity threshold
--     (default n ≥ 3) on the per-section rollup.
--   • Free-text answers are returned shuffled, never paired with a
--     Likert score or a date.
-- ============================================================

-- ── eval_periods: one row per term that gets an evaluation window ──
CREATE TABLE IF NOT EXISTS eval_periods (
  term_id        UUID         PRIMARY KEY REFERENCES terms(id) ON DELETE CASCADE,
  opens_at       TIMESTAMPTZ  NOT NULL,
  closes_at      TIMESTAMPTZ  NOT NULL,
  min_response_n INT          NOT NULL DEFAULT 3 CHECK (min_response_n >= 1),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CHECK (closes_at > opens_at)
);

-- ── eval_questions: institution-wide question bank ──
CREATE TABLE IF NOT EXISTS eval_questions (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt        TEXT         NOT NULL,
  kind          TEXT         NOT NULL CHECK (kind IN ('likert_5', 'text')),
  display_order INT          NOT NULL DEFAULT 0,
  archived_at   TIMESTAMPTZ,            -- soft-delete; old answers stay valid
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eval_questions_active
  ON eval_questions(display_order) WHERE archived_at IS NULL;

-- ── evaluations: ONE ROW per (student, section). The student_id is
-- here only to enforce uniqueness + drive the grade gate; it is never
-- exposed to faculty/admin in any answer-bearing query.
CREATE TABLE IF NOT EXISTS evaluations (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id   UUID         NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  student_id   UUID         NOT NULL REFERENCES users(id),
  submitted_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (section_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_evaluations_section ON evaluations(section_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_student ON evaluations(student_id);

-- ── eval_answers: the actual scores. Joined on evaluation_id only.
CREATE TABLE IF NOT EXISTS eval_answers (
  evaluation_id UUID         NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  question_id   UUID         NOT NULL REFERENCES eval_questions(id),
  likert_value  INT          CHECK (likert_value IS NULL OR likert_value BETWEEN 1 AND 5),
  text_value    TEXT,
  PRIMARY KEY (evaluation_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_eval_answers_question ON eval_answers(question_id);

-- ── Default question bank seed ─────────────────────────────────────
-- 8 PH-standard prompts: 7 Likert + 1 open text. Edit anytime via the
-- admin question-bank UI; old answers stay valid because `archived_at`
-- is a soft-delete.
INSERT INTO eval_questions (prompt, kind, display_order) VALUES
  ('The instructor demonstrated mastery of the subject matter.',                  'likert_5', 1),
  ('The instructor explained concepts clearly and answered questions well.',      'likert_5', 2),
  ('Class sessions started and ended on time and used the time effectively.',     'likert_5', 3),
  ('Assessments and grades were fair, transparent, and returned promptly.',       'likert_5', 4),
  ('The instructor encouraged participation and respected student opinions.',     'likert_5', 5),
  ('Course materials and activities helped me learn.',                            'likert_5', 6),
  ('Overall, I would recommend this instructor to other students.',               'likert_5', 7),
  ('What is one thing the instructor does well, and one thing they could improve?', 'text',   8)
ON CONFLICT DO NOTHING;
