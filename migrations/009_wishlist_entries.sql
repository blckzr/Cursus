-- ============================================================
-- 009 — Pre-registration wishlist
--
-- Students mark which courses they intend to take in an upcoming term BEFORE
-- the registrar formally opens it. The admin uses the aggregate count to size
-- sections, spot demand for restricted courses, and avoid surprise overflow.
--
-- A row is uniquely defined by (student, term, course). Priority is a soft
-- ranking the student sets (1 = must-have, 5 = nice-to-have) so they can
-- communicate trade-offs alongside the raw list.
--
-- Writes are app-level gated: once `terms.is_active = TRUE`, the service
-- rejects POST/PATCH/DELETE on entries for that term. The rows survive so the
-- student (and admin) can compare wished-for vs. opened-for-real.
--
-- Idempotent — safe to re-run.
-- ============================================================

CREATE TABLE IF NOT EXISTS wishlist_entries (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id  UUID         NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    term_id     UUID         NOT NULL REFERENCES terms(id)   ON DELETE CASCADE,
    course_id   UUID         NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    priority    INT          NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
    notes       TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE (student_id, term_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_wishlist_student_term ON wishlist_entries(student_id, term_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_term_course  ON wishlist_entries(term_id, course_id);
