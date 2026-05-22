-- ============================================================
-- Migration 002: Custom User Code (per-role sequences)
-- Format: YYYY-NNNNN-BRANCH-ROLE
--   YYYY   = year account was created
--   NNNNN  = 5-digit sequence number — CONTINUOUS PER ROLE
--   BRANCH = branch code (default 'MN' if none assigned)
--   ROLE   = 0 (student) | 1 (faculty) | 2 (admin)
--
-- Each role has its own counter, so student numbering is never
-- interrupted by faculty/admin creations (and vice versa).
--
-- Safe to run on an existing database — NO data is deleted.
-- Re-runnable: it drops/recreates the sequences and regenerates
-- every user's code from scratch by creation order.
-- ============================================================

-- Remove the old single global sequence (from the earlier draft), if present
DROP SEQUENCE IF EXISTS user_code_seq;

-- One independent sequence per role
DROP SEQUENCE IF EXISTS student_code_seq;
DROP SEQUENCE IF EXISTS faculty_code_seq;
DROP SEQUENCE IF EXISTS admin_code_seq;
CREATE SEQUENCE student_code_seq START 1;
CREATE SEQUENCE faculty_code_seq START 1;
CREATE SEQUENCE admin_code_seq   START 1;

-- Add branch + user_code columns (safe to re-run)
ALTER TABLE users ADD COLUMN IF NOT EXISTS branch    TEXT NOT NULL DEFAULT 'MN';
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_code TEXT UNIQUE;

-- (Re)generate a code for every existing user, numbered per role by creation order
WITH numbered AS (
    SELECT id, role, branch, created_at,
           ROW_NUMBER() OVER (PARTITION BY role ORDER BY created_at, id) AS rn
    FROM users
)
UPDATE users u
SET user_code = CONCAT(
    EXTRACT(YEAR FROM n.created_at)::TEXT, '-',
    LPAD(n.rn::TEXT, 5, '0'), '-',
    n.branch, '-',
    CASE n.role WHEN 'student' THEN '0' WHEN 'faculty' THEN '1' ELSE '2' END
)
FROM numbered n
WHERE u.id = n.id;

-- Advance each sequence past the codes just assigned so new users continue cleanly
SELECT setval('student_code_seq',
    GREATEST((SELECT COUNT(*) FROM users WHERE role = 'student'), 1),
    (SELECT COUNT(*) FROM users WHERE role = 'student') > 0);
SELECT setval('faculty_code_seq',
    GREATEST((SELECT COUNT(*) FROM users WHERE role = 'faculty'), 1),
    (SELECT COUNT(*) FROM users WHERE role = 'faculty') > 0);
SELECT setval('admin_code_seq',
    GREATEST((SELECT COUNT(*) FROM users WHERE role = 'admin'), 1),
    (SELECT COUNT(*) FROM users WHERE role = 'admin') > 0);
