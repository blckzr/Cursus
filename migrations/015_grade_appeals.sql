-- ============================================================
-- 015 — Grade appeals (FUTURE_FEATURES 4.2)
--
-- State machine:
--   pending          → student just submitted
--   faculty_review   → faculty accepted, looking at it
--   dean_review      → faculty escalated
--   resolved         → final state (with outcome + maybe new grade)
--   withdrawn        → student withdrew (final)
--
-- Policy: one appeal per enrollment. Once resolved or withdrawn the
-- student can't re-submit for that grade.
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS grade_appeals (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id   UUID         NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    student_id      UUID         NOT NULL REFERENCES users(id),
    reason          TEXT         NOT NULL,
    status          TEXT         NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','faculty_review','dean_review','resolved','withdrawn')),
    faculty_note    TEXT,
    dean_note       TEXT,
    -- outcome ∈ ('grade_changed','denied','withdrawn')
    outcome         TEXT         CHECK (outcome IS NULL OR outcome IN ('grade_changed','denied','withdrawn')),
    -- New grade values applied to enrollments if outcome='grade_changed'.
    resolved_grade  TEXT,
    resolved_numeric NUMERIC(5,2) CHECK (resolved_numeric IS NULL OR (resolved_numeric >= 0 AND resolved_numeric <= 100)),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    resolved_at     TIMESTAMPTZ,
    UNIQUE (enrollment_id)
);

CREATE INDEX IF NOT EXISTS idx_appeals_student ON grade_appeals(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_appeals_status  ON grade_appeals(status);
