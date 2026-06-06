-- ============================================================
-- 013 — Pending enrollment status (student self-enlistment)
--
-- Adds a new `pending` value to the enroll_status enum so the "Open Term"
-- wizard can create speculative enrollments that students must explicitly
-- confirm before they count as actually-enrolled.
--
-- Pipeline:
--   • Open Term creates enrollments with status='pending'
--   • Student hits "Confirm enrollment" on the COR page → backend flips all
--     their pending rows in that term to 'enrolled'
--   • Pending rows are invisible to the gradebook, faculty roster, student
--     schedule, and COR until confirmed
--
-- Idempotent — ALTER TYPE … ADD VALUE IF NOT EXISTS is safe to re-run.
-- ============================================================

ALTER TYPE enroll_status ADD VALUE IF NOT EXISTS 'pending';
