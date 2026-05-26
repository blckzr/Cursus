-- ============================================================
-- 006 — Notifications
--
-- In-app notifications, fanned out per recipient. Auto-fired by:
--   • Grade finalize       → one row per student in the section
--   • Open Term            → one row per auto-enrolled student
--   • Schedule change      → one row per enrolled student + the faculty
--
-- `kind` is a short tag the UI uses to pick an icon / colour.
-- `link` is a relative app path the bell dropdown navigates to on click.
-- `data` holds optional structured context (section_id, term_id, …).
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
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

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
    ON notifications (user_id, read_at, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
    ON notifications (user_id, created_at DESC);
