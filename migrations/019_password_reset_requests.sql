-- ============================================================
-- 019_password_reset_requests.sql  (FUTURE_FEATURES 8.5 — Forgot-password flow)
--
-- Admin-mediated forgot-password flow. A user submits a request from
-- the login page; an admin reviews + approves it; the user's password
-- is reset to the default `1.PolytechnicU` and `password_must_change`
-- is set TRUE so the first-login gate forces an immediate change.
--
-- Email integration (8.6) is deferred — for now admins see requests in
-- their in-app notification bell + a dedicated "Password resets" admin
-- page.
-- ============================================================

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       TEXT         NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'denied')),
  requested_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ,
  resolved_by  UUID         REFERENCES users(id),
  admin_note   TEXT
);

-- Fast lookup of the active queue.
CREATE INDEX IF NOT EXISTS idx_password_reset_pending
  ON password_reset_requests(requested_at DESC)
  WHERE status = 'pending';

-- Rate-limit helper: at most one pending request per user at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_password_reset_one_pending_per_user
  ON password_reset_requests(user_id)
  WHERE status = 'pending';
