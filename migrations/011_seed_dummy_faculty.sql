-- ============================================================
-- 011 — Seed 10 dummy faculty for auto-assigner testing
--
-- Pre-conditions:
--   • Migration 008 applied (faculty_availability)
--   • Migration 010 applied (faculty_qualifications + max_teaching_units)
--   • BSCS curriculum is loaded (migrations/005_bscs_curriculum.sql)
--
-- What this script does, idempotently:
--   1. Inserts 10 faculty accounts (idempotent on email)
--   2. Gives each a sensible MWF/TThS teaching availability block
--   3. Distributes BSCS curriculum courses across them as qualifications,
--      with weighted preference scores
--
-- All faculty share the default password `1.PolytechnicU` — the same hash the
-- app uses when an admin creates a user via the UI. They can change it on
-- first login.
--
-- Safe to re-run: every insert uses ON CONFLICT to skip existing rows.
-- ============================================================


-- ─── 1. The faculty accounts ────────────────────────────────────────────────
-- bcrypt hash of "1.PolytechnicU" (cost 12). Same value the API would produce.
DO $$
DECLARE
  pw_hash CONSTANT TEXT := '$2a$12$XlIEY8VxJtu8R0czdYGYK.SCYFLfZ8DCjyKkmW4tNAY/iSTcYZF5q';
  faculty_seed CONSTANT TEXT[][] := ARRAY[
    -- full_name,                       email,                          max_units
    ARRAY['Dr. Anna Lourdes Mercado',    'a.mercado@cursus.local',       '24'],
    ARRAY['Dr. Renato Villanueva',       'r.villanueva@cursus.local',    '24'],
    ARRAY['Prof. Marie Antonette Tan',   'ma.tan@cursus.local',          '21'],
    ARRAY['Prof. Joseph Patrick Ramos',  'j.ramos@cursus.local',         '24'],
    ARRAY['Engr. Cristina Manalo',       'c.manalo@cursus.local',        '24'],
    ARRAY['Engr. Marco Aurelio Reyes',   'm.reyes@cursus.local',         '21'],
    ARRAY['Ms. Patricia Andrea Cruz',    'p.cruz@cursus.local',          '18'],
    ARRAY['Mr. Joel Adriano Gutierrez',  'j.gutierrez@cursus.local',     '24'],
    ARRAY['Ms. Diana Concepcion Soriano','d.soriano@cursus.local',       '21'],
    ARRAY['Mr. Lawrence Edmund Bautista','l.bautista@cursus.local',      '24']
  ];
  row TEXT[];
  v_code TEXT;
BEGIN
  FOREACH row SLICE 1 IN ARRAY faculty_seed
  LOOP
    -- Generate a fresh user_code only when we're actually inserting.
    v_code := EXTRACT(YEAR FROM now())::TEXT
              || '-' || LPAD(nextval('faculty_code_seq')::TEXT, 5, '0')
              || '-MN-1';

    INSERT INTO users (user_code, email, password_hash, full_name, role, branch, max_teaching_units)
    VALUES (v_code, row[2], pw_hash, row[1], 'faculty', 'MN', row[3]::INT)
    ON CONFLICT (email) DO NOTHING;
  END LOOP;
END $$;


-- ─── 2. Weekly availability per faculty ─────────────────────────────────────
-- Split into two cohorts so the auto-assigner has both MWF and TTh teachers.
-- Each gets one teaching block + one office-hour block.

INSERT INTO faculty_availability (faculty_id, day_of_week, start_time, end_time, kind)
SELECT u.id, 'MWF',  TIME '08:00', TIME '12:00', 'teaching'::availability_kind
FROM users u
WHERE u.email IN ('a.mercado@cursus.local', 'ma.tan@cursus.local', 'c.manalo@cursus.local',
                  'p.cruz@cursus.local', 'd.soriano@cursus.local')
ON CONFLICT DO NOTHING;

INSERT INTO faculty_availability (faculty_id, day_of_week, start_time, end_time, kind)
SELECT u.id, 'MWF',  TIME '13:00', TIME '17:00', 'teaching'::availability_kind
FROM users u
WHERE u.email IN ('r.villanueva@cursus.local', 'j.ramos@cursus.local')
ON CONFLICT DO NOTHING;

INSERT INTO faculty_availability (faculty_id, day_of_week, start_time, end_time, kind)
SELECT u.id, 'TTh',  TIME '08:00', TIME '12:00', 'teaching'::availability_kind
FROM users u
WHERE u.email IN ('m.reyes@cursus.local', 'j.gutierrez@cursus.local', 'l.bautista@cursus.local')
ON CONFLICT DO NOTHING;

INSERT INTO faculty_availability (faculty_id, day_of_week, start_time, end_time, kind)
SELECT u.id, 'TTh',  TIME '13:00', TIME '17:00', 'teaching'::availability_kind
FROM users u
WHERE u.email IN ('r.villanueva@cursus.local', 'j.ramos@cursus.local',
                  'm.reyes@cursus.local', 'j.gutierrez@cursus.local')
ON CONFLICT DO NOTHING;

-- One office-hour block per faculty (1 PM on their off-day).
INSERT INTO faculty_availability (faculty_id, day_of_week, start_time, end_time, kind)
SELECT u.id, 'F',    TIME '15:00', TIME '17:00', 'office_hour'::availability_kind
FROM users u
WHERE u.email LIKE '%@cursus.local' AND u.role = 'faculty'
ON CONFLICT DO NOTHING;


-- ─── 3. Qualifications ──────────────────────────────────────────────────────
-- Distribute BSCS courses across faculty by year level so we get realistic
-- coverage. Each faculty gets 4-6 courses; preference is 1 for their
-- specialty year(s), 2 for adjacent ones.

-- Helper: a CTE-style approach via temp table makes the assignment readable.
DO $$
DECLARE
  -- Map of faculty email → preferred year levels (specialty)
  -- and adjacent year levels they're willing to teach.
  -- This is a simple, hard-coded distribution for testing 3.4.
  rec RECORD;
  v_faculty UUID;
  v_course_id UUID;
  -- We'll loop over (faculty_email, year_specialty, year_adjacent, pref_specialty, pref_adjacent)
  assignments CONSTANT TEXT[][] := ARRAY[
    -- email,                       specialty_years (CSV),  adjacent_years (CSV)
    ARRAY['a.mercado@cursus.local',  '1',  '2'],   -- Year 1 specialist (math/foundations)
    ARRAY['r.villanueva@cursus.local','1', '2'],
    ARRAY['ma.tan@cursus.local',     '2',  '1,3'],
    ARRAY['j.ramos@cursus.local',    '2',  '3'],
    ARRAY['c.manalo@cursus.local',   '3',  '2,4'],
    ARRAY['m.reyes@cursus.local',    '3',  '2,4'],
    ARRAY['p.cruz@cursus.local',     '4',  '3'],   -- Senior subjects + capstone
    ARRAY['j.gutierrez@cursus.local','4',  '3'],
    ARRAY['d.soriano@cursus.local',  '2,3','1,4'], -- Generalist mid-years
    ARRAY['l.bautista@cursus.local', '1,4','2,3']  -- Generalist endpoints
  ];
  a TEXT[];
  spec_years INT[];
  adj_years  INT[];
  yr INT;
BEGIN
  FOREACH a SLICE 1 IN ARRAY assignments
  LOOP
    SELECT id INTO v_faculty FROM users WHERE email = a[1];
    IF v_faculty IS NULL THEN CONTINUE; END IF;

    -- Parse comma-separated year lists into INT[]
    spec_years := string_to_array(a[2], ',')::INT[];
    adj_years  := string_to_array(COALESCE(a[3], ''), ',')::INT[];

    -- Specialty years → preference 1
    FOREACH yr IN ARRAY spec_years LOOP
      FOR v_course_id IN
        SELECT DISTINCT cc.course_id
        FROM curriculum_courses cc
        JOIN programs p ON p.id = cc.program_id
        WHERE p.code = 'BSCS' AND cc.year_level = yr
      LOOP
        INSERT INTO faculty_qualifications (faculty_id, course_id, preference)
        VALUES (v_faculty, v_course_id, 1)
        ON CONFLICT (faculty_id, course_id) DO NOTHING;
      END LOOP;
    END LOOP;

    -- Adjacent years → preference 3 (only if there are any)
    IF cardinality(adj_years) > 0 THEN
      FOREACH yr IN ARRAY adj_years LOOP
        IF yr IS NULL THEN CONTINUE; END IF;
        FOR v_course_id IN
          SELECT DISTINCT cc.course_id
          FROM curriculum_courses cc
          JOIN programs p ON p.id = cc.program_id
          WHERE p.code = 'BSCS' AND cc.year_level = yr
        LOOP
          INSERT INTO faculty_qualifications (faculty_id, course_id, preference)
          VALUES (v_faculty, v_course_id, 3)
          ON CONFLICT (faculty_id, course_id) DO NOTHING;
        END LOOP;
      END LOOP;
    END IF;
  END LOOP;
END $$;


-- ─── 4. Quick verification (uncomment to read out the result) ───────────────
-- SELECT u.full_name, u.user_code, u.max_teaching_units,
--        COUNT(fq.id) AS qualified_courses,
--        COUNT(fq.id) FILTER (WHERE fq.preference = 1) AS strong_prefs
-- FROM users u
-- LEFT JOIN faculty_qualifications fq ON fq.faculty_id = u.id
-- WHERE u.email LIKE '%@cursus.local' AND u.role = 'faculty'
-- GROUP BY u.id, u.full_name, u.user_code, u.max_teaching_units
-- ORDER BY u.full_name;
