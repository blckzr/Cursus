-- ============================================================
-- 007 — Backfill users.graduated_at
--
-- The canonical schema declared `users.graduated_at` from the start, but none
-- of migrations 001–005 added it on existing databases. Code in
-- users.service.ts and blocks.service.ts SELECTs it, so any DB that was set up
-- migration-by-migration (not from schema.sql) errors with
--   column u.graduated_at does not exist
-- on /api/users.
--
-- This migration is idempotent — safe to run repeatedly.
-- ============================================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS graduated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_graduated
    ON users(graduated_at) WHERE graduated_at IS NOT NULL;
