-- ============================================================
-- 010 — Faculty teaching qualifications + load cap
--
-- Required input for the auto-assign feature (FUTURE_FEATURES 3.4): without
-- this table, an auto-assigner would have to assume "any faculty can teach
-- any course," which produces useless assignments (e.g. an English teacher on
-- Discrete Math).
--
-- Faculty self-service their list on the new "My subjects" page; admins can
-- edit on a user's behalf via the Users module. A "preference" score (1 = love
-- it, 5 = can do it in a pinch) feeds the auto-assigner's soft constraints.
--
-- `users.max_teaching_units` is a soft cap the auto-assigner respects; admins
-- can override per faculty member.
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS faculty_qualifications (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    faculty_id  UUID         NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    course_id   UUID         NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    preference  INT          NOT NULL DEFAULT 3 CHECK (preference BETWEEN 1 AND 5),
    notes       TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (faculty_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_faculty_qual_faculty ON faculty_qualifications(faculty_id);
CREATE INDEX IF NOT EXISTS idx_faculty_qual_course  ON faculty_qualifications(course_id);

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS max_teaching_units INT DEFAULT 24
        CHECK (max_teaching_units IS NULL OR max_teaching_units BETWEEN 0 AND 60);
