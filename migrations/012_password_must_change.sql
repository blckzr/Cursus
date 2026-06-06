-- ============================================================
-- 012 — Force password change on first login (FUTURE_FEATURES 6.1)
--
-- New `users.password_must_change` flag. Set TRUE by:
--   • `createUser`              — every newly-onboarded account
--   • `updateUser` (admin reset) — when an admin changes someone's password
-- Cleared by:
--   • `changePassword`          — the user changing their own password
--
-- Idempotent — safe to re-run.
-- ============================================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS password_must_change BOOLEAN NOT NULL DEFAULT FALSE;
