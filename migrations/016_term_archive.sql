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
