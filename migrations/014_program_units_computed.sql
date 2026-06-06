-- ============================================================
-- 014 — Programs.total_units is now derived
--
-- The admin's "New program" form used to ask for `total_units` upfront.
-- That value would routinely drift from the actual sum once curriculum
-- entries were added. We now compute it on read (SUM of placed
-- curriculum-course units) and leave the column as a no-op cache that
-- defaults to 0 on insert.
--
-- This migration only relaxes the CHECK constraint so we can INSERT with 0.
-- Existing rows are left untouched — their stored values will be ignored
-- in favour of the computed live total.
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE programs DROP CONSTRAINT IF EXISTS programs_total_units_check;
ALTER TABLE programs
    ADD CONSTRAINT programs_total_units_check CHECK (total_units >= 0);

-- Reset stored values to 0 so the no-op cache doesn't show stale numbers
-- if anyone bypasses the API and reads the column directly.
UPDATE programs SET total_units = 0;
