-- ============================================================
-- 008 — Backfill faculty_availability
--
-- Same drift story as 007 (users.graduated_at): the table and its enum live
-- in schema.sql but were never added by an individual migration, so DBs that
-- were set up migration-by-migration error with:
--   relation "faculty_availability" does not exist
-- whenever the faculty Availability page or the section schedule conflict
-- checker queries it.
--
-- Idempotent — safe to re-run.
-- ============================================================

-- 1) Enum (separate DO block — CREATE TYPE has no IF NOT EXISTS).
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'availability_kind') THEN
        CREATE TYPE availability_kind AS ENUM ('teaching', 'office_hour');
    END IF;
END$$;

-- 2) Table.
CREATE TABLE IF NOT EXISTS faculty_availability (
    id          UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
    faculty_id  UUID              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_of_week TEXT              NOT NULL,
    start_time  TIME              NOT NULL,
    end_time    TIME              NOT NULL,
    kind        availability_kind NOT NULL,
    created_at  TIMESTAMPTZ       NOT NULL DEFAULT now(),
    CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_faculty_availability_faculty
    ON faculty_availability(faculty_id);
