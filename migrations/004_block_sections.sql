-- ============================================================
-- Migration 004: Block Sections (year/program cohorts)
--
-- A "block section" is a cohort of students grouped by
--   program + year level + block number   →  e.g. 'BSCS 1-1'.
-- This is DISTINCT from `sections` (course offerings).
--
--   1. Adds block-config columns to programs.
--   2. Creates the block_sections table.
--   3. Adds year_level + block_section_id to users.
--   4. Auto-generates blocks for every existing program.
--
-- Safe to run on an existing database — NO data is deleted.
-- Re-runnable: every statement is guarded.
-- ============================================================

-- Per-program block configuration
ALTER TABLE programs ADD COLUMN IF NOT EXISTS year_levels     INT NOT NULL DEFAULT 4  CHECK (year_levels BETWEEN 1 AND 8);
ALTER TABLE programs ADD COLUMN IF NOT EXISTS blocks_per_year INT NOT NULL DEFAULT 3  CHECK (blocks_per_year > 0);
ALTER TABLE programs ADD COLUMN IF NOT EXISTS block_capacity  INT NOT NULL DEFAULT 50 CHECK (block_capacity > 0);

-- Block sections: program + year level + block number  =>  'BSCS 1-1'
CREATE TABLE IF NOT EXISTS block_sections (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id   UUID        NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    year_level   INT         NOT NULL CHECK (year_level > 0),
    block_number INT         NOT NULL CHECK (block_number > 0),
    capacity     INT         NOT NULL DEFAULT 50 CHECK (capacity > 0),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (program_id, year_level, block_number)
);

CREATE INDEX IF NOT EXISTS idx_block_sections_program ON block_sections(program_id);

-- Student cohort assignment (NULL for admin/faculty)
ALTER TABLE users ADD COLUMN IF NOT EXISTS year_level       INT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS block_section_id UUID REFERENCES block_sections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_block_section ON users(block_section_id);

-- Generate blocks for every existing program from its configuration
INSERT INTO block_sections (program_id, year_level, block_number, capacity)
SELECT p.id, y.year_level, b.block_number, p.block_capacity
FROM programs p
CROSS JOIN generate_series(1, p.year_levels)     AS y(year_level)
CROSS JOIN generate_series(1, p.blocks_per_year) AS b(block_number)
ON CONFLICT (program_id, year_level, block_number) DO NOTHING;

-- Backfill: place any pre-existing students (with a program but no block)
-- into a random year-1 block of their program.
UPDATE users u
SET year_level = 1,
    block_section_id = (
        SELECT bs.id FROM block_sections bs
        WHERE bs.program_id = u.program_id AND bs.year_level = 1
        ORDER BY random() LIMIT 1
    )
WHERE u.role = 'student'
  AND u.program_id IS NOT NULL
  AND u.block_section_id IS NULL;
