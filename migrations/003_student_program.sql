-- ============================================================
-- Migration 003: Degree Programs + Student Program Assignment
--
-- 1. Seeds the 6 degree programs offered by the institute.
-- 2. Adds users.program_id so every student is tied to a program.
--    (NULL for admin/faculty — they don't belong to a program.)
--
-- The program "code" (BSCS, BSIT, …) is the acronym later used
-- to name block sections, e.g. 'BSCS 1-1'.
--
-- Safe to run on an existing database — NO data is deleted.
-- Re-runnable: program inserts are guarded with ON CONFLICT.
-- ============================================================

-- Link a user to a degree program (required for students at the app layer)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES programs(id) ON DELETE SET NULL;

-- Seed the degree programs.
-- total_units values are placeholders — edit them in the Programs page.
INSERT INTO programs (code, name, total_units) VALUES
    ('BSCS',  'Bachelor of Science in Computer Science',       150),
    ('BSIT',  'Bachelor of Science in Information Technology', 150),
    ('BSN',   'Bachelor of Science in Nursing',                200),
    ('BSME',  'Bachelor of Science in Mechanical Engineering', 175),
    ('BSCE',  'Bachelor of Science in Civil Engineering',      175),
    ('BSBIO', 'Bachelor of Science in Biology',                160)
ON CONFLICT (code) DO NOTHING;
