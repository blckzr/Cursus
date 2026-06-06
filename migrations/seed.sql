-- ============================================================
-- SEED — Fresh-start test data
--
-- Pre-condition: `migrations/schema.sql` has been applied to a clean DB.
--
-- This file inserts:
--   • 1 admin account
--   • 20 faculty accounts (with availability + qualifications)
--   • 5 student accounts (all in BSCS 1-1)
--   • The BSCS program + 8 blocks (4 years × 2 blocks)
--   • The full BSCS catalog of 50+ subjects (from the source curriculum sheet)
--   • Course prerequisites + per-year/semester placement
--   • One inactive term (`AY 2025–2026, First Semester`) — admin clicks
--     "Open term" in the UI to materialise sections + enrollments.
--
-- All accounts share the default password `1.PolytechnicU`. `password_must_change`
-- is left at FALSE so testing isn't bottlenecked by the first-login gate
-- (toggle it back to TRUE manually if you want to exercise that flow).
-- ============================================================


-- The pgcrypto extension powers bcrypt-compatible hashing via `crypt()`.
-- Already enabled on Supabase (we use gen_random_uuid from it), but ensuring
-- it here makes the seed re-runnable on bare PostgreSQL too.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  -- bcrypt('1.PolytechnicU', cost=12). Computed at seed-time so it's always
  -- valid for the backend's `bcrypt.compare` — bcryptjs accepts the `$2a$`
  -- output that pgcrypto's `gen_salt('bf', …)` produces.
  pw  CONSTANT TEXT := crypt('1.PolytechnicU', gen_salt('bf', 12));

  -- Deterministic UUIDs so re-runs and cross-references stay readable.
  bscs_id        CONSTANT UUID := '11111111-1111-1111-1111-111111111111';

  -- Local helpers
  v_block_id     UUID;
  v_user_id      UUID;
  v_face_idx     INT;
  y              INT;
  b              INT;
BEGIN

  -- ============================================================
  -- 1. ADMIN
  -- ============================================================
  INSERT INTO users (user_code, email, password_hash, full_name, role, branch, password_must_change)
  VALUES (
    EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD(nextval('admin_code_seq')::TEXT, 5, '0') || '-MN-2',
    'admin@cursus.local', pw, 'Universidad Mariana Registrar', 'admin', 'MN', FALSE
  );

  -- ============================================================
  -- 2. PROGRAMS — just BSCS for now
  -- ============================================================
  INSERT INTO programs (id, code, name, total_units, year_levels, blocks_per_year, block_capacity)
  VALUES (bscs_id, 'BSCS', 'Bachelor of Science in Computer Science', 187, 4, 2, 50);

  -- ============================================================
  -- 3. BLOCKS — 4 years × 2 blocks/year (BSCS 1-1 … BSCS 4-2)
  -- ============================================================
  FOR y IN 1..4 LOOP
    FOR b IN 1..2 LOOP
      INSERT INTO blocks (program_id, year_level, block_number, capacity)
      VALUES (bscs_id, y, b, 50);
    END LOOP;
  END LOOP;

  -- ============================================================
  -- 4. COURSES — BSCS catalog from the curriculum sheet
  --    visibility = 'public' unless explicitly listed as restricted
  --    (only BSCS-specific electives are restricted to BSCS).
  -- ============================================================
  INSERT INTO courses (code, title, units, visibility) VALUES
    -- Year 1, First Semester
    ('COMP002',   'Computer Programming 1',                                              3, 'public'),
    ('GEED032',   'Filipinolohiya at Pambansang Kaunlaran',                              3, 'public'),
    ('COMP001',   'Introduction to Computing',                                           3, 'public'),
    ('GEED004',   'Mathematics in the Modern World',                                     3, 'public'),
    ('NSTP001',   'National Service Training Program 1',                                 3, 'public'),
    ('PATHFIT1',  'Physical Activity Towards Health and Fitness 1',                      2, 'public'),
    ('GEED020',   'Politics, Governance and Citizenship',                                3, 'public'),
    ('GEED005',   'Purposive Communication',                                             3, 'public'),
    -- Year 1, Second Semester
    ('COMP003',   'Computer Programming 2',                                              3, 'public'),
    ('MATH017',   'Differential Calculus for Computer Science Students',                 3, 'public'),
    ('COMP004',   'Discrete Structures 1',                                               3, 'public'),
    ('NSTP002',   'National Service Training Program 2',                                 3, 'public'),
    ('GEED033',   'Pagsasaliin sa Kontekstong Filipino',                                 3, 'public'),
    ('PATHFIT2',  'Physical Activity Towards Health and Fitness 2',                      2, 'public'),
    ('GEED007',   'Science, Technology and Society',                                     3, 'public'),
    ('GEED001',   'Understanding the Self',                                              3, 'public'),
    -- Year 2, First Semester
    ('ELECCSFE1', 'BSCS Free Elective 1',                                                3, 'restricted'),
    ('COMP006',   'Data Structures and Algorithms',                                      3, 'public'),
    ('COMP005',   'Discrete Structures 2',                                               3, 'public'),
    ('GEED008',   'Ethics / Etika',                                                      3, 'public'),
    ('COSC201',   'Logic Design and Digital Computer Circuits',                          3, 'public'),
    ('COSC202',   'Modeling and Simulation',                                             3, 'public'),
    ('COMP009',   'Object Oriented Programming',                                         3, 'public'),
    ('PATHFIT3',  'Physical Activity Towards Health and Fitness 3',                      2, 'public'),
    -- Year 2, Second Semester
    ('ELECCSFE2', 'BSCS Free Elective 2',                                                3, 'restricted'),
    ('COMP008',   'Data Communications and Networking',                                  3, 'public'),
    ('COSC203',   'Design and Analysis of Algorithms',                                   3, 'public'),
    ('COMP010',   'Information Management',                                              3, 'public'),
    ('COMP007',   'Operating Systems',                                                   3, 'public'),
    ('GEED010',   'People and the Earth''s Ecosystems',                                  3, 'public'),
    ('PATHFIT4',  'Physical Activity Towards Health and Fitness 4',                      2, 'public'),
    ('COMP011',   'Technical Documentation and Presentation Skills in ICT',              3, 'public'),
    -- Year 3, First Semester
    ('COMP019',   'Applications Development and Emerging Technologies',                  3, 'public'),
    ('COSC302',   'Automata and Language Theory',                                        3, 'public'),
    ('ELECCSE1',  'BSCS Elective 1',                                                     3, 'restricted'),
    ('COSC301',   'Computer Organization and Assembly Language',                         3, 'public'),
    ('COMP015',   'Fundamentals of Research',                                            3, 'public'),
    ('COMP013',   'Human Computer Interaction',                                          3, 'public'),
    ('COSC303',   'Principles of Programming Languages',                                 3, 'public'),
    -- Year 3, Second Semester
    ('GEED006',   'Art Appreciation / Pagpapahalaga sa Sining',                          3, 'public'),
    ('ELECCSE2',  'BSCS Elective 2',                                                     3, 'restricted'),
    ('COSC305',   'CS Thesis Writing 1',                                                 3, 'public'),
    ('COMP020',   'Information Assurance and Security',                                  3, 'public'),
    ('COSC304',   'Introduction to Artificial Intelligence',                             3, 'public'),
    ('COMP021',   'Software Engineering 1',                                              3, 'public'),
    ('COMP016',   'Web Development',                                                     3, 'public'),
    -- Year 3, Summer
    ('COSC306',   'Practicum (200 hours)',                                               3, 'public'),
    -- Year 4, First Semester
    ('ELECCSE3',  'BSCS Elective 3',                                                     3, 'restricted'),
    ('COSC401',   'CS Thesis Writing 2',                                                 3, 'public'),
    ('GEED026',   'Philippine Popular Culture',                                          3, 'public'),
    ('GEED002',   'Readings in Philippine History',                                      3, 'public'),
    ('COMP022',   'Software Engineering 2',                                              3, 'public'),
    ('GEED003',   'The Contemporary World',                                              3, 'public'),
    -- Year 4, Second Semester
    ('ELECCSE4',  'BSCS Elective 4',                                                     3, 'restricted'),
    ('COSC402',   'Current Trends and Topics in Computing',                              3, 'public'),
    ('GEED037',   'Life and Works of Rizal',                                             3, 'public'),
    ('COMP023',   'Social and Professional Issues in Computing',                         3, 'public');

  -- Link the restricted BSCS electives to the BSCS program.
  INSERT INTO course_programs (course_id, program_id)
  SELECT c.id, bscs_id
  FROM courses c
  WHERE c.code IN ('ELECCSFE1','ELECCSFE2','ELECCSE1','ELECCSE2','ELECCSE3','ELECCSE4');

  -- ============================================================
  -- 5. PREREQUISITES (from the curriculum sheet)
  -- ============================================================
  INSERT INTO course_prerequisites (course_id, prerequisite_id)
  SELECT c.id, p.id
  FROM (VALUES
    -- Year 1 → Year 2 chain
    ('COMP003',  'COMP002'),
    ('MATH017',  'GEED004'),
    ('GEED033',  'GEED032'),
    ('PATHFIT2', 'PATHFIT1'),
    -- Year 2 First Sem
    ('COMP005',  'COMP004'),
    ('COSC201',  'COMP001'),
    ('COMP009',  'COMP003'),
    ('PATHFIT3', 'PATHFIT2'),
    -- Year 2 Second Sem
    ('COMP008',  'COSC201'),
    ('COSC203',  'COMP006'),
    ('COMP010',  'COMP006'),
    ('COMP007',  'COMP001'),
    ('PATHFIT4', 'PATHFIT3'),
    -- Year 3 First Sem
    ('COMP019',  'COMP003'),
    ('COSC302',  'COMP006'),
    ('COSC301',  'COMP002'),
    ('COSC301',  'COSC201'),
    ('COMP015',  'COMP011'),
    ('COMP013',  'COMP002'),
    ('COSC303',  'COMP006'),
    -- Year 3 Second Sem
    ('COSC305',  'COMP015'),
    ('COSC304',  'COSC302'),
    ('COMP021',  'COMP009'),
    ('COMP021',  'COMP010'),
    ('COMP016',  'COMP009'),
    ('COMP016',  'COMP010'),
    -- Year 3 Summer
    ('COSC306',  'COMP008'),
    ('COSC306',  'COMP009'),
    ('COSC306',  'COMP010'),
    ('COSC306',  'COMP021'),
    -- Year 4 First Sem
    ('COSC401',  'COSC305'),
    ('COMP022',  'COMP021')
  ) AS pairs(course_code, prereq_code)
  JOIN courses c ON c.code = pairs.course_code
  JOIN courses p ON p.code = pairs.prereq_code;

  -- ============================================================
  -- 6. CURRICULUM PLACEMENT  (course → year/semester slot for BSCS)
  -- ============================================================
  INSERT INTO curriculum_courses (program_id, course_id, year_level, semester, display_order)
  SELECT bscs_id, c.id, p.year_level, p.semester::semester_type, p.display_order
  FROM (VALUES
    -- Year 1 First Semester
    ('COMP002',   1, '1',      1),
    ('GEED032',   1, '1',      2),
    ('COMP001',   1, '1',      3),
    ('GEED004',   1, '1',      4),
    ('NSTP001',   1, '1',      5),
    ('PATHFIT1',  1, '1',      6),
    ('GEED020',   1, '1',      7),
    ('GEED005',   1, '1',      8),
    -- Year 1 Second Semester
    ('COMP003',   1, '2',      1),
    ('MATH017',   1, '2',      2),
    ('COMP004',   1, '2',      3),
    ('NSTP002',   1, '2',      4),
    ('GEED033',   1, '2',      5),
    ('PATHFIT2',  1, '2',      6),
    ('GEED007',   1, '2',      7),
    ('GEED001',   1, '2',      8),
    -- Year 2 First Semester
    ('ELECCSFE1', 2, '1',      1),
    ('COMP006',   2, '1',      2),
    ('COMP005',   2, '1',      3),
    ('GEED008',   2, '1',      4),
    ('COSC201',   2, '1',      5),
    ('COSC202',   2, '1',      6),
    ('COMP009',   2, '1',      7),
    ('PATHFIT3',  2, '1',      8),
    -- Year 2 Second Semester
    ('ELECCSFE2', 2, '2',      1),
    ('COMP008',   2, '2',      2),
    ('COSC203',   2, '2',      3),
    ('COMP010',   2, '2',      4),
    ('COMP007',   2, '2',      5),
    ('GEED010',   2, '2',      6),
    ('PATHFIT4',  2, '2',      7),
    ('COMP011',   2, '2',      8),
    -- Year 3 First Semester
    ('COMP019',   3, '1',      1),
    ('COSC302',   3, '1',      2),
    ('ELECCSE1',  3, '1',      3),
    ('COSC301',   3, '1',      4),
    ('COMP015',   3, '1',      5),
    ('COMP013',   3, '1',      6),
    ('COSC303',   3, '1',      7),
    -- Year 3 Second Semester
    ('GEED006',   3, '2',      1),
    ('ELECCSE2',  3, '2',      2),
    ('COSC305',   3, '2',      3),
    ('COMP020',   3, '2',      4),
    ('COSC304',   3, '2',      5),
    ('COMP021',   3, '2',      6),
    ('COMP016',   3, '2',      7),
    -- Year 3 Summer
    ('COSC306',   3, 'summer', 1),
    -- Year 4 First Semester
    ('ELECCSE3',  4, '1',      1),
    ('COSC401',   4, '1',      2),
    ('GEED026',   4, '1',      3),
    ('GEED002',   4, '1',      4),
    ('COMP022',   4, '1',      5),
    ('GEED003',   4, '1',      6),
    -- Year 4 Second Semester
    ('ELECCSE4',  4, '2',      1),
    ('COSC402',   4, '2',      2),
    ('GEED037',   4, '2',      3),
    ('COMP023',   4, '2',      4)
  ) AS p(course_code, year_level, semester, display_order)
  JOIN courses c ON c.code = p.course_code;

  -- ============================================================
  -- 7. FACULTY — 40 accounts
  --
  --    With 8 blocks × ~8 subjects per semester, a single semester runs
  --    ~58 sections. Each faculty has a 24-unit cap (≈ 8 sections of
  --    3 units each). So we need at least 58/8 ≈ 8 faculty per semester
  --    *of the right tracks*. Sized below so every track has 2-4× slack
  --    after splitting MWF vs TTh:
  --
  --      • cs   (20) — every COMP / COSC / BSCS-elective course
  --      • math ( 4) — Differential Calc + Discrete Structures
  --      • geed ( 8) — General Education courses
  --      • pe   ( 4) — PATHFIT 1–4
  --      • nstp ( 4) — NSTP 1–2
  --
  --    Within each track they're split MWF vs TTh for day-pattern coverage.
  --    Every faculty member gets a 4-hour morning + 4-hour afternoon teaching
  --    window on their days plus a Saturday office-hour block.
  -- ============================================================

  FOR v_face_idx IN 1..40 LOOP
    DECLARE
      v_name        TEXT;
      v_email       TEXT;
      v_track       TEXT;
      v_days        TEXT;
      v_code        TEXT;
    BEGIN
      SELECT name, email, track, days INTO v_name, v_email, v_track, v_days
      FROM (VALUES
        -- ── CS (20: 10 MWF + 10 TTh) ───────────────────────────────────
        ( 1, 'Dr. Anna Lourdes Mercado',         'a.mercado@cursus.local',     'cs',   'MWF'),
        ( 2, 'Dr. Renato Villanueva',            'r.villanueva@cursus.local',  'cs',   'MWF'),
        ( 3, 'Prof. Marie Antonette Tan',        'ma.tan@cursus.local',        'cs',   'MWF'),
        ( 4, 'Prof. Joseph Patrick Ramos',       'j.ramos@cursus.local',       'cs',   'MWF'),
        ( 5, 'Engr. Cristina Manalo',            'c.manalo@cursus.local',      'cs',   'MWF'),
        ( 6, 'Dr. Benjamin Dimaculangan',        'b.dimaculangan@cursus.local','cs',   'MWF'),
        ( 7, 'Prof. Liza Marquez',               'l.marquez@cursus.local',     'cs',   'MWF'),
        ( 8, 'Engr. Rodel Pascual',              'r.pascual@cursus.local',     'cs',   'MWF'),
        ( 9, 'Mr. Aldwin Tagaro',                'a.tagaro@cursus.local',      'cs',   'MWF'),
        (10, 'Ms. Sarah Olivar',                 's.olivar@cursus.local',      'cs',   'MWF'),
        (11, 'Engr. Marco Aurelio Reyes',        'm.reyes@cursus.local',       'cs',   'TTh'),
        (12, 'Ms. Patricia Andrea Cruz',         'p.cruz@cursus.local',        'cs',   'TTh'),
        (13, 'Mr. Joel Adriano Gutierrez',       'j.gutierrez@cursus.local',   'cs',   'TTh'),
        (14, 'Ms. Diana Concepcion Soriano',     'd.soriano@cursus.local',     'cs',   'TTh'),
        (15, 'Mr. Lawrence Edmund Bautista',     'l.bautista@cursus.local',    'cs',   'TTh'),
        (16, 'Dr. Karina Espino',                'k.espino@cursus.local',      'cs',   'TTh'),
        (17, 'Prof. Edgar Solis',                'e.solis@cursus.local',       'cs',   'TTh'),
        (18, 'Mr. Bryan Tolentino',              'b.tolentino@cursus.local',   'cs',   'TTh'),
        (19, 'Ms. Geraldine Castro',             'g.castro@cursus.local',      'cs',   'TTh'),
        (20, 'Engr. Alfredo Cabrera',            'a.cabrera@cursus.local',     'cs',   'TTh'),
        -- ── Math (4: 2 MWF + 2 TTh) ────────────────────────────────────
        (21, 'Dr. Felicidad Aguilar',            'f.aguilar@cursus.local',     'math', 'MWF'),
        (22, 'Prof. Andres Aquino',              'a.aquino@cursus.local',      'math', 'MWF'),
        (23, 'Mr. Henrico Salvador',             'h.salvador@cursus.local',    'math', 'TTh'),
        (24, 'Ms. Beatriz Lazaro',               'b.lazaro@cursus.local',      'math', 'TTh'),
        -- ── GE (8: 4 MWF + 4 TTh) ──────────────────────────────────────
        (25, 'Dr. Imelda Pamilacan',             'i.pamilacan@cursus.local',   'geed', 'MWF'),
        (26, 'Prof. Roselle Bayot',              'r.bayot@cursus.local',       'geed', 'MWF'),
        (27, 'Ms. Teresita Salvador',            't.salvador@cursus.local',    'geed', 'MWF'),
        (28, 'Mr. Augusto Reyes',                'augusto.reyes@cursus.local', 'geed', 'MWF'),
        (29, 'Mr. Vicente Macaraig',             'v.macaraig@cursus.local',    'geed', 'TTh'),
        (30, 'Ms. Catalina Lim',                 'c.lim@cursus.local',         'geed', 'TTh'),
        (31, 'Dr. Romulo Hernandez',             'romulo.hernandez@cursus.local','geed','TTh'),
        (32, 'Prof. Concepcion Fajardo',         'c.fajardo@cursus.local',     'geed', 'TTh'),
        -- ── PE (4: 2 MWF + 2 TTh) ──────────────────────────────────────
        (33, 'Coach Mario Castillo',             'm.castillo@cursus.local',    'pe',   'MWF'),
        (34, 'Coach Ricardo Mendoza',            'r.mendoza@cursus.local',     'pe',   'MWF'),
        (35, 'Coach Lourdes Domingo',            'l.domingo@cursus.local',     'pe',   'TTh'),
        (36, 'Coach Bernardo Sison',             'b.sison@cursus.local',       'pe',   'TTh'),
        -- ── NSTP (4: 2 MWF + 2 TTh) ────────────────────────────────────
        (37, 'Capt. Eleazar Roxas',              'e.roxas@cursus.local',       'nstp', 'MWF'),
        (38, 'Lt. Salvador Cruz',                'sal.cruz@cursus.local',      'nstp', 'MWF'),
        (39, 'Lt. Maria Esperanza Ocampo',       'm.ocampo@cursus.local',      'nstp', 'TTh'),
        (40, 'Sgt. Florencio Garcia',            'f.garcia@cursus.local',      'nstp', 'TTh')
      ) AS roster(idx, name, email, track, days)
      WHERE idx = v_face_idx;

      v_code := EXTRACT(YEAR FROM now())::TEXT
              || '-' || LPAD(nextval('faculty_code_seq')::TEXT, 5, '0')
              || '-MN-1';

      INSERT INTO users (user_code, email, password_hash, full_name, role, branch,
                         max_teaching_units, password_must_change)
      VALUES (v_code, v_email, pw, v_name, 'faculty', 'MN', 24, FALSE)
      RETURNING id INTO v_user_id;

      -- Availability: morning + afternoon teaching block on their pattern,
      -- short Saturday office hour (out of the way of any section schedule).
      INSERT INTO faculty_availability (faculty_id, day_of_week, start_time, end_time, kind)
      VALUES
        (v_user_id, v_days, TIME '07:00', TIME '12:00', 'teaching'),
        (v_user_id, v_days, TIME '13:00', TIME '17:00', 'teaching'),
        (v_user_id, 'Sat',  TIME '08:00', TIME '10:00', 'office_hour');

      -- Qualifications: each track gets the appropriate course set.
      IF v_track = 'cs' THEN
        INSERT INTO faculty_qualifications (faculty_id, course_id, preference)
        SELECT v_user_id, c.id, 1
        FROM courses c
        WHERE c.code LIKE 'COMP%' OR c.code LIKE 'COSC%' OR c.code LIKE 'ELECCS%'
        ON CONFLICT DO NOTHING;
      ELSIF v_track = 'math' THEN
        INSERT INTO faculty_qualifications (faculty_id, course_id, preference)
        SELECT v_user_id, c.id, 1
        FROM courses c
        WHERE c.code LIKE 'MATH%' OR c.code IN ('COMP004','COMP005')
        ON CONFLICT DO NOTHING;
      ELSIF v_track = 'geed' THEN
        INSERT INTO faculty_qualifications (faculty_id, course_id, preference)
        SELECT v_user_id, c.id, 1
        FROM courses c
        WHERE c.code LIKE 'GEED%'
        ON CONFLICT DO NOTHING;
      ELSIF v_track = 'pe' THEN
        INSERT INTO faculty_qualifications (faculty_id, course_id, preference)
        SELECT v_user_id, c.id, 1
        FROM courses c
        WHERE c.code LIKE 'PATHFIT%'
        ON CONFLICT DO NOTHING;
      ELSIF v_track = 'nstp' THEN
        INSERT INTO faculty_qualifications (faculty_id, course_id, preference)
        SELECT v_user_id, c.id, 1
        FROM courses c
        WHERE c.code LIKE 'NSTP%'
        ON CONFLICT DO NOTHING;
      END IF;
    END;
  END LOOP;

  -- ============================================================
  -- 8. STUDENTS — 5, all in BSCS 1-1
  -- ============================================================
  SELECT id INTO v_block_id
  FROM blocks WHERE program_id = bscs_id AND year_level = 1 AND block_number = 1;

  FOR v_face_idx IN 1..5 LOOP
    DECLARE
      v_name  TEXT;
      v_email TEXT;
      v_code  TEXT;
    BEGIN
      SELECT name, email INTO v_name, v_email
      FROM (VALUES
        (1, 'Juan Miguel dela Cruz',     'juan.delacruz@cursus.local'),
        (2, 'Maria Concepcion Reyes',    'maria.reyes@cursus.local'),
        (3, 'Antonio Lopez Bautista',    'antonio.bautista@cursus.local'),
        (4, 'Patricia Andrea Garcia',    'patricia.garcia@cursus.local'),
        (5, 'Jose Rafael Hernandez',     'jose.hernandez@cursus.local')
      ) AS roster(idx, name, email)
      WHERE idx = v_face_idx;

      v_code := EXTRACT(YEAR FROM now())::TEXT
              || '-' || LPAD(nextval('student_code_seq')::TEXT, 5, '0')
              || '-MN-0';

      INSERT INTO users (user_code, email, password_hash, full_name, role, branch,
                         program_id, year_level, block_id, password_must_change)
      VALUES (v_code, v_email, pw, v_name, 'student', 'MN',
              bscs_id, 1, v_block_id, FALSE);
    END;
  END LOOP;

  -- ============================================================
  -- 9. ONE INACTIVE TERM — admin clicks "Open term" in the UI to
  --    materialise the sections + pending enrollments.
  -- ============================================================
  INSERT INTO terms (name, semester, start_date, end_date, is_active)
  VALUES (
    'AY 2025–2026, First Semester', '1',
    DATE '2025-08-04', DATE '2025-12-19',
    FALSE
  );

END $$;


-- ============================================================
-- VERIFY (uncomment any block to read back what was seeded)
-- ============================================================
-- SELECT role, COUNT(*) FROM users GROUP BY role ORDER BY role;
-- SELECT code, name FROM programs;
-- SELECT year_level, block_number FROM blocks WHERE program_id = '11111111-1111-1111-1111-111111111111' ORDER BY year_level, block_number;
-- SELECT year_level, semester, COUNT(*) FROM curriculum_courses GROUP BY year_level, semester ORDER BY year_level, semester;
-- SELECT u.full_name, COUNT(fq.id) AS qualified FROM users u LEFT JOIN faculty_qualifications fq ON fq.faculty_id = u.id WHERE u.role = 'faculty' GROUP BY u.id, u.full_name ORDER BY u.full_name;
-- SELECT u.full_name, fa.day_of_week, fa.start_time, fa.end_time, fa.kind FROM users u JOIN faculty_availability fa ON fa.faculty_id = u.id WHERE u.role = 'faculty' ORDER BY u.full_name, fa.day_of_week;
