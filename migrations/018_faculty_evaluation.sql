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
