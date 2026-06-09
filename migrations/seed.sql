-- ============================================================
-- SEED — Fresh-start test data with full lived-in history.
--
-- Pre-condition: `migrations/schema.sql` (which includes 001–019) has been
-- applied to a clean DB.
--
-- This file inserts:
--   • 1 admin account
--   • 40 faculty accounts (with availability + qualifications)
--   • 20 regular students — 5 per year level (BSCS 1-1, 2-1, 3-1, 4-1)
--   •  3 IRREGULAR students — `block_id = NULL`, user codes RAISE NOTICE'd
--   • BSCS program + 8 blocks (4 years × 2 blocks)
--   • Full BSCS catalog of 50+ subjects + prereqs + curriculum placement
--   • NSTP / PATHFIT flagged as `meetings_per_week = 1` (Sunday-style)
--
-- Plus a fully lived-in HISTORY so the system feels used:
--
--   Past terms (7) with sections, faculty, schedules, finalized grades:
--     • AY 2022–2023 1st + 2nd Sem    — Y4-cohort took Y1
--     • AY 2023–2024 1st + 2nd Sem    — Y4 took Y2, Y3 took Y1
--     • AY 2024–2025 1st + 2nd Sem    — Y4 took Y3, Y3 took Y2, Y2 took Y1
--     • AY 2024–2025 Summer Term      — Y4 took Y3-Summer Practicum
--
--   Anonymous evaluations from every student → their faculty per past term
--   (eval window closed, K-anonymity threshold = 3).
--
--   Current term  AY 2025–2026 1st Semester  is ACTIVE and in-progress:
--     • Sections created with faculty + standard-pair meetings
--     • Students confirmed-enrolled (status='enrolled', not pending)
--     • NO finalized grades yet — mid-semester feel
--     • Evaluation window OPEN (closes 7 days after term-end) for testing
--
-- All accounts share the default password `1.PolytechnicU`. `password_must_change`
-- is left FALSE so testing isn't bottlenecked by the first-login gate.
--
-- Re-running this seed wipes the DB — call `schema.sql` reset first.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  pw  CONSTANT TEXT := crypt('1.PolytechnicU', gen_salt('bf', 12));
  bscs_id CONSTANT UUID := '11111111-1111-1111-1111-111111111111';

  -- Term anchors (stamped as we create them so historical seeders can refer back).
  t_2022_s1 UUID; t_2022_s2 UUID;
  t_2023_s1 UUID; t_2023_s2 UUID;
  t_2024_s1 UUID; t_2024_s2 UUID; t_2024_summer UUID;
  t_current UUID;

  -- Cohort block lookups (5 students per current block).
  b_1_1 UUID; b_2_1 UUID; b_3_1 UUID; b_4_1 UUID;

  -- Iter vars
  v_user_id      UUID;
  v_face_idx     INT;
  y              INT;
  b              INT;

  -- Helper for irregular student codes (logged at the end)
  irreg_code_1 TEXT; irreg_code_2 TEXT; irreg_code_3 TEXT;
  irreg_id_1   UUID; irreg_id_2   UUID; irreg_id_3   UUID;

  -- Section / enrollment / evaluation seeding
  v_term_id      UUID;
  v_block_id     UUID;
  v_year         INT;
  v_sem          TEXT;
  v_course_id    UUID;
  v_course_code  TEXT;
  v_course_units INT;
  v_meets_per_wk INT;
  v_section_id   UUID;
  v_section_code TEXT;
  v_faculty_id   UUID;
  v_pattern_idx  INT;
  v_start_min    INT;
  v_d1           TEXT;
  v_d2           TEXT;
  v_dur_min      INT;
  v_eval_id      UUID;
  v_q_id         UUID;
  v_likert       INT;

  -- Per-student aptitude (drives mock grades). Keyed by user_id at insert time.
  v_aptitude     NUMERIC;
  v_numeric      NUMERIC;
  v_letter       TEXT;

  -- Standard meeting pairs (rotated by course display_order).
  pair_days TEXT[][] := ARRAY[
    ARRAY['Mon','Thu'],
    ARRAY['Tue','Fri'],
    ARRAY['Wed','Sat']
  ];
  start_slots INT[] := ARRAY[7, 9, 10, 13, 14, 16];   -- hours, used as start_time

  -- Reusable: assign a faculty to a (course, term) deterministically from the
  -- qualified pool. md5 ensures the same course in different terms can get
  -- different faculty (variety), but the choice is reproducible.
  ----------------------------------------------------------------
BEGIN
  -- Deterministic randomness for mock grades + faculty rotation.
  PERFORM setseed(0.42);

  -- ============================================================
  -- 1. ADMIN
  -- ============================================================
  INSERT INTO users (user_code, email, password_hash, full_name, role, branch, password_must_change)
  VALUES (
    EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD(nextval('admin_code_seq')::TEXT, 5, '0') || '-MN-2',
    'admin@cursus.local', pw, 'Cursus Registrar', 'admin', 'MN', FALSE
  );

  -- ============================================================
  -- 2. PROGRAMS — just BSCS for now
  -- ============================================================
  INSERT INTO programs (id, code, name, year_levels, blocks_per_year, block_capacity)
  VALUES (bscs_id, 'BSCS', 'Bachelor of Science in Computer Science', 4, 2, 50);

  -- ============================================================
  -- 3. BLOCKS — 4 years × 2 blocks/year
  -- ============================================================
  FOR y IN 1..4 LOOP
    FOR b IN 1..2 LOOP
      INSERT INTO blocks (program_id, year_level, block_number, capacity)
      VALUES (bscs_id, y, b, 50);
    END LOOP;
  END LOOP;

  SELECT id INTO b_1_1 FROM blocks WHERE program_id = bscs_id AND year_level = 1 AND block_number = 1;
  SELECT id INTO b_2_1 FROM blocks WHERE program_id = bscs_id AND year_level = 2 AND block_number = 1;
  SELECT id INTO b_3_1 FROM blocks WHERE program_id = bscs_id AND year_level = 3 AND block_number = 1;
  SELECT id INTO b_4_1 FROM blocks WHERE program_id = bscs_id AND year_level = 4 AND block_number = 1;

  -- ============================================================
  -- 4. COURSES — BSCS catalog (50+ subjects)
  -- ============================================================
  INSERT INTO courses (code, title, units, visibility) VALUES
    -- Year 1 First Semester
    ('COMP002',   'Computer Programming 1',                                              3, 'public'),
    ('GEED032',   'Filipinolohiya at Pambansang Kaunlaran',                              3, 'public'),
    ('COMP001',   'Introduction to Computing',                                           3, 'public'),
    ('GEED004',   'Mathematics in the Modern World',                                     3, 'public'),
    ('NSTP001',   'National Service Training Program 1',                                 3, 'public'),
    ('PATHFIT1',  'Physical Activity Towards Health and Fitness 1',                      2, 'public'),
    ('GEED020',   'Politics, Governance and Citizenship',                                3, 'public'),
    ('GEED005',   'Purposive Communication',                                             3, 'public'),
    -- Year 1 Second Semester
    ('COMP003',   'Computer Programming 2',                                              3, 'public'),
    ('MATH017',   'Differential Calculus for Computer Science Students',                 3, 'public'),
    ('COMP004',   'Discrete Structures 1',                                               3, 'public'),
    ('NSTP002',   'National Service Training Program 2',                                 3, 'public'),
    ('GEED033',   'Pagsasaliin sa Kontekstong Filipino',                                 3, 'public'),
    ('PATHFIT2',  'Physical Activity Towards Health and Fitness 2',                      2, 'public'),
    ('GEED007',   'Science, Technology and Society',                                     3, 'public'),
    ('GEED001',   'Understanding the Self',                                              3, 'public'),
    -- Year 2 First Semester
    ('ELECCSFE1', 'BSCS Free Elective 1',                                                3, 'restricted'),
    ('COMP006',   'Data Structures and Algorithms',                                      3, 'public'),
    ('COMP005',   'Discrete Structures 2',                                               3, 'public'),
    ('GEED008',   'Ethics / Etika',                                                      3, 'public'),
    ('COSC201',   'Logic Design and Digital Computer Circuits',                          3, 'public'),
    ('COSC202',   'Modeling and Simulation',                                             3, 'public'),
    ('COMP009',   'Object Oriented Programming',                                         3, 'public'),
    ('PATHFIT3',  'Physical Activity Towards Health and Fitness 3',                      2, 'public'),
    -- Year 2 Second Semester
    ('ELECCSFE2', 'BSCS Free Elective 2',                                                3, 'restricted'),
    ('COMP008',   'Data Communications and Networking',                                  3, 'public'),
    ('COSC203',   'Design and Analysis of Algorithms',                                   3, 'public'),
    ('COMP010',   'Information Management',                                              3, 'public'),
    ('COMP007',   'Operating Systems',                                                   3, 'public'),
    ('GEED010',   'People and the Earth''s Ecosystems',                                  3, 'public'),
    ('PATHFIT4',  'Physical Activity Towards Health and Fitness 4',                      2, 'public'),
    ('COMP011',   'Technical Documentation and Presentation Skills in ICT',              3, 'public'),
    -- Year 3 First Semester
    ('COMP019',   'Applications Development and Emerging Technologies',                  3, 'public'),
    ('COSC302',   'Automata and Language Theory',                                        3, 'public'),
    ('ELECCSE1',  'BSCS Elective 1',                                                     3, 'restricted'),
    ('COSC301',   'Computer Organization and Assembly Language',                         3, 'public'),
    ('COMP015',   'Fundamentals of Research',                                            3, 'public'),
    ('COMP013',   'Human Computer Interaction',                                          3, 'public'),
    ('COSC303',   'Principles of Programming Languages',                                 3, 'public'),
    -- Year 3 Second Semester
    ('GEED006',   'Art Appreciation / Pagpapahalaga sa Sining',                          3, 'public'),
    ('ELECCSE2',  'BSCS Elective 2',                                                     3, 'restricted'),
    ('COSC305',   'CS Thesis Writing 1',                                                 3, 'public'),
    ('COMP020',   'Information Assurance and Security',                                  3, 'public'),
    ('COSC304',   'Introduction to Artificial Intelligence',                             3, 'public'),
    ('COMP021',   'Software Engineering 1',                                              3, 'public'),
    ('COMP016',   'Web Development',                                                     3, 'public'),
    -- Year 3 Summer
    ('COSC306',   'Practicum (200 hours)',                                               3, 'public'),
    -- Year 4 First Semester
    ('ELECCSE3',  'BSCS Elective 3',                                                     3, 'restricted'),
    ('COSC401',   'CS Thesis Writing 2',                                                 3, 'public'),
    ('GEED026',   'Philippine Popular Culture',                                          3, 'public'),
    ('GEED002',   'Readings in Philippine History',                                      3, 'public'),
    ('COMP022',   'Software Engineering 2',                                              3, 'public'),
    ('GEED003',   'The Contemporary World',                                              3, 'public'),
    -- Year 4 Second Semester
    ('ELECCSE4',  'BSCS Elective 4',                                                     3, 'restricted'),
    ('COSC402',   'Current Trends and Topics in Computing',                              3, 'public'),
    ('GEED037',   'Life and Works of Rizal',                                             3, 'public'),
    ('COMP023',   'Social and Professional Issues in Computing',                         3, 'public');

  INSERT INTO course_programs (course_id, program_id)
  SELECT c.id, bscs_id FROM courses c
  WHERE c.code IN ('ELECCSFE1','ELECCSFE2','ELECCSE1','ELECCSE2','ELECCSE3','ELECCSE4');

  -- ============================================================
  -- 5. PREREQUISITES
  -- ============================================================
  INSERT INTO course_prerequisites (course_id, prerequisite_id)
  SELECT c.id, p.id FROM (VALUES
    ('COMP003','COMP002'),('MATH017','GEED004'),('GEED033','GEED032'),('PATHFIT2','PATHFIT1'),
    ('COMP005','COMP004'),('COSC201','COMP001'),('COMP009','COMP003'),('PATHFIT3','PATHFIT2'),
    ('COMP008','COSC201'),('COSC203','COMP006'),('COMP010','COMP006'),('COMP007','COMP001'),('PATHFIT4','PATHFIT3'),
    ('COMP019','COMP003'),('COSC302','COMP006'),('COSC301','COMP002'),('COSC301','COSC201'),
    ('COMP015','COMP011'),('COMP013','COMP002'),('COSC303','COMP006'),
    ('COSC305','COMP015'),('COSC304','COSC302'),('COMP021','COMP009'),('COMP021','COMP010'),
    ('COMP016','COMP009'),('COMP016','COMP010'),
    ('COSC306','COMP008'),('COSC306','COMP009'),('COSC306','COMP010'),('COSC306','COMP021'),
    ('COSC401','COSC305'),('COMP022','COMP021')
  ) AS pairs(course_code, prereq_code)
  JOIN courses c ON c.code = pairs.course_code
  JOIN courses p ON p.code = pairs.prereq_code;

  -- ============================================================
  -- 6. CURRICULUM PLACEMENT  (with meetings_per_week from FUTURE_FEATURES 2.6)
  -- ============================================================
  INSERT INTO curriculum_courses (program_id, course_id, year_level, semester, display_order, meetings_per_week)
  SELECT bscs_id, c.id, p.year_level, p.semester::semester_type, p.display_order,
         -- NSTP / PATHFIT → 1 meeting/week (Sunday-style). Everything else → 2.
         CASE WHEN c.code LIKE 'NSTP%' OR c.code LIKE 'PATHFIT%' THEN 1 ELSE 2 END
  FROM (VALUES
    -- Year 1 First Semester
    ('COMP002', 1, '1', 1), ('GEED032', 1, '1', 2), ('COMP001', 1, '1', 3), ('GEED004', 1, '1', 4),
    ('NSTP001', 1, '1', 5), ('PATHFIT1', 1, '1', 6), ('GEED020', 1, '1', 7), ('GEED005', 1, '1', 8),
    -- Year 1 Second Semester
    ('COMP003', 1, '2', 1), ('MATH017', 1, '2', 2), ('COMP004', 1, '2', 3), ('NSTP002', 1, '2', 4),
    ('GEED033', 1, '2', 5), ('PATHFIT2', 1, '2', 6), ('GEED007', 1, '2', 7), ('GEED001', 1, '2', 8),
    -- Year 2 First Semester
    ('ELECCSFE1', 2, '1', 1), ('COMP006', 2, '1', 2), ('COMP005', 2, '1', 3), ('GEED008', 2, '1', 4),
    ('COSC201', 2, '1', 5), ('COSC202', 2, '1', 6), ('COMP009', 2, '1', 7), ('PATHFIT3', 2, '1', 8),
    -- Year 2 Second Semester
    ('ELECCSFE2', 2, '2', 1), ('COMP008', 2, '2', 2), ('COSC203', 2, '2', 3), ('COMP010', 2, '2', 4),
    ('COMP007', 2, '2', 5), ('GEED010', 2, '2', 6), ('PATHFIT4', 2, '2', 7), ('COMP011', 2, '2', 8),
    -- Year 3 First Semester
    ('COMP019', 3, '1', 1), ('COSC302', 3, '1', 2), ('ELECCSE1', 3, '1', 3), ('COSC301', 3, '1', 4),
    ('COMP015', 3, '1', 5), ('COMP013', 3, '1', 6), ('COSC303', 3, '1', 7),
    -- Year 3 Second Semester
    ('GEED006', 3, '2', 1), ('ELECCSE2', 3, '2', 2), ('COSC305', 3, '2', 3), ('COMP020', 3, '2', 4),
    ('COSC304', 3, '2', 5), ('COMP021', 3, '2', 6), ('COMP016', 3, '2', 7),
    -- Year 3 Summer
    ('COSC306', 3, 'summer', 1),
    -- Year 4 First Semester
    ('ELECCSE3', 4, '1', 1), ('COSC401', 4, '1', 2), ('GEED026', 4, '1', 3), ('GEED002', 4, '1', 4),
    ('COMP022', 4, '1', 5), ('GEED003', 4, '1', 6),
    -- Year 4 Second Semester
    ('ELECCSE4', 4, '2', 1), ('COSC402', 4, '2', 2), ('GEED037', 4, '2', 3), ('COMP023', 4, '2', 4)
  ) AS p(course_code, year_level, semester, display_order)
  JOIN courses c ON c.code = p.course_code;

  -- ============================================================
  -- 7. FACULTY — 40 accounts (full Mon–Sun availability)
  -- ============================================================
  FOR v_face_idx IN 1..40 LOOP
    DECLARE
      v_name TEXT; v_email TEXT; v_track TEXT; v_code TEXT;
    BEGIN
      SELECT name, email, track INTO v_name, v_email, v_track
      FROM (VALUES
        ( 1, 'Dr. Anna Lourdes Mercado',         'a.mercado@cursus.local',     'cs'),
        ( 2, 'Dr. Renato Villanueva',            'r.villanueva@cursus.local',  'cs'),
        ( 3, 'Prof. Marie Antonette Tan',        'ma.tan@cursus.local',        'cs'),
        ( 4, 'Prof. Joseph Patrick Ramos',       'j.ramos@cursus.local',       'cs'),
        ( 5, 'Engr. Cristina Manalo',            'c.manalo@cursus.local',      'cs'),
        ( 6, 'Dr. Benjamin Dimaculangan',        'b.dimaculangan@cursus.local','cs'),
        ( 7, 'Prof. Liza Marquez',               'l.marquez@cursus.local',     'cs'),
        ( 8, 'Engr. Rodel Pascual',              'r.pascual@cursus.local',     'cs'),
        ( 9, 'Mr. Aldwin Tagaro',                'a.tagaro@cursus.local',      'cs'),
        (10, 'Ms. Sarah Olivar',                 's.olivar@cursus.local',      'cs'),
        (11, 'Engr. Marco Aurelio Reyes',        'm.reyes@cursus.local',       'cs'),
        (12, 'Ms. Patricia Andrea Cruz',         'p.cruz@cursus.local',        'cs'),
        (13, 'Mr. Joel Adriano Gutierrez',       'j.gutierrez@cursus.local',   'cs'),
        (14, 'Ms. Diana Concepcion Soriano',     'd.soriano@cursus.local',     'cs'),
        (15, 'Mr. Lawrence Edmund Bautista',     'l.bautista@cursus.local',    'cs'),
        (16, 'Dr. Karina Espino',                'k.espino@cursus.local',      'cs'),
        (17, 'Prof. Edgar Solis',                'e.solis@cursus.local',       'cs'),
        (18, 'Mr. Bryan Tolentino',              'b.tolentino@cursus.local',   'cs'),
        (19, 'Ms. Geraldine Castro',             'g.castro@cursus.local',      'cs'),
        (20, 'Engr. Alfredo Cabrera',            'a.cabrera@cursus.local',     'cs'),
        (21, 'Dr. Felicidad Aguilar',            'f.aguilar@cursus.local',     'math'),
        (22, 'Prof. Andres Aquino',              'a.aquino@cursus.local',      'math'),
        (23, 'Mr. Henrico Salvador',             'h.salvador@cursus.local',    'math'),
        (24, 'Ms. Beatriz Lazaro',               'b.lazaro@cursus.local',      'math'),
        (25, 'Dr. Imelda Pamilacan',             'i.pamilacan@cursus.local',   'geed'),
        (26, 'Prof. Roselle Bayot',              'r.bayot@cursus.local',       'geed'),
        (27, 'Ms. Teresita Salvador',            't.salvador@cursus.local',    'geed'),
        (28, 'Mr. Augusto Reyes',                'augusto.reyes@cursus.local', 'geed'),
        (29, 'Mr. Vicente Macaraig',             'v.macaraig@cursus.local',    'geed'),
        (30, 'Ms. Catalina Lim',                 'c.lim@cursus.local',         'geed'),
        (31, 'Dr. Romulo Hernandez',             'romulo.hernandez@cursus.local','geed'),
        (32, 'Prof. Concepcion Fajardo',         'c.fajardo@cursus.local',     'geed'),
        (33, 'Coach Mario Castillo',             'm.castillo@cursus.local',    'pe'),
        (34, 'Coach Ricardo Mendoza',            'r.mendoza@cursus.local',     'pe'),
        (35, 'Coach Lourdes Domingo',            'l.domingo@cursus.local',     'pe'),
        (36, 'Coach Bernardo Sison',             'b.sison@cursus.local',       'pe'),
        (37, 'Capt. Eleazar Roxas',              'e.roxas@cursus.local',       'nstp'),
        (38, 'Lt. Salvador Cruz',                'sal.cruz@cursus.local',      'nstp'),
        (39, 'Lt. Maria Esperanza Ocampo',       'm.ocampo@cursus.local',      'nstp'),
        (40, 'Sgt. Florencio Garcia',            'f.garcia@cursus.local',      'nstp')
      ) AS roster(idx, name, email, track) WHERE idx = v_face_idx;

      v_code := EXTRACT(YEAR FROM now())::TEXT
              || '-' || LPAD(nextval('faculty_code_seq')::TEXT, 5, '0') || '-MN-1';

      INSERT INTO users (user_code, email, password_hash, full_name, role, branch,
                         max_teaching_units, password_must_change)
      VALUES (v_code, v_email, pw, v_name, 'faculty', 'MN', 24, FALSE)
      RETURNING id INTO v_user_id;

      -- Mon–Sun availability so 2.6 auto-assigner can place any standard pair.
      INSERT INTO faculty_availability (faculty_id, day_of_week, start_time, end_time, kind) VALUES
        (v_user_id, 'MTWThFSatSun', TIME '07:00', TIME '12:00', 'teaching'),
        (v_user_id, 'MTWThFSatSun', TIME '13:00', TIME '21:00', 'teaching');

      -- Qualifications by track.
      IF v_track = 'cs' THEN
        INSERT INTO faculty_qualifications (faculty_id, course_id, preference)
        SELECT v_user_id, c.id, 1 FROM courses c
        WHERE c.code LIKE 'COMP%' OR c.code LIKE 'COSC%' OR c.code LIKE 'ELECCS%'
        ON CONFLICT DO NOTHING;
      ELSIF v_track = 'math' THEN
        INSERT INTO faculty_qualifications (faculty_id, course_id, preference)
        SELECT v_user_id, c.id, 1 FROM courses c
        WHERE c.code LIKE 'MATH%' OR c.code IN ('COMP004','COMP005')
        ON CONFLICT DO NOTHING;
      ELSIF v_track = 'geed' THEN
        INSERT INTO faculty_qualifications (faculty_id, course_id, preference)
        SELECT v_user_id, c.id, 1 FROM courses c WHERE c.code LIKE 'GEED%'
        ON CONFLICT DO NOTHING;
      ELSIF v_track = 'pe' THEN
        INSERT INTO faculty_qualifications (faculty_id, course_id, preference)
        SELECT v_user_id, c.id, 1 FROM courses c WHERE c.code LIKE 'PATHFIT%'
        ON CONFLICT DO NOTHING;
      ELSIF v_track = 'nstp' THEN
        INSERT INTO faculty_qualifications (faculty_id, course_id, preference)
        SELECT v_user_id, c.id, 1 FROM courses c WHERE c.code LIKE 'NSTP%'
        ON CONFLICT DO NOTHING;
      END IF;
    END;
  END LOOP;

  -- ============================================================
  -- 8. REGULAR STUDENTS — 5 per year level, in block 1 of their year
  -- ============================================================
  FOR y IN 1..4 LOOP
    SELECT id INTO v_block_id FROM blocks WHERE program_id = bscs_id AND year_level = y AND block_number = 1;

    FOR v_face_idx IN 1..5 LOOP
      DECLARE
        v_name TEXT; v_email TEXT; v_code TEXT;
      BEGIN
        SELECT name, email INTO v_name, v_email
        FROM (VALUES
          (1, 1, 'Juan Miguel dela Cruz',     'juan.delacruz.y1@cursus.local'),
          (1, 2, 'Maria Concepcion Reyes',    'maria.reyes.y1@cursus.local'),
          (1, 3, 'Antonio Lopez Bautista',    'antonio.bautista.y1@cursus.local'),
          (1, 4, 'Patricia Andrea Garcia',    'patricia.garcia.y1@cursus.local'),
          (1, 5, 'Jose Rafael Hernandez',     'jose.hernandez.y1@cursus.local'),
          (2, 1, 'Andres Felipe Santos',      'andres.santos.y2@cursus.local'),
          (2, 2, 'Beatriz Ysabel Mendoza',    'beatriz.mendoza.y2@cursus.local'),
          (2, 3, 'Carlos Eduardo Aquino',     'carlos.aquino.y2@cursus.local'),
          (2, 4, 'Dolores Pilar Marquez',     'dolores.marquez.y2@cursus.local'),
          (2, 5, 'Emilio Aguinaldo Tan',      'emilio.tan.y2@cursus.local'),
          (3, 1, 'Francisco Jose Villanueva', 'francisco.villanueva.y3@cursus.local'),
          (3, 2, 'Gabriela Silang Cruz',      'gabriela.cruz.y3@cursus.local'),
          (3, 3, 'Hector Manuel Domingo',     'hector.domingo.y3@cursus.local'),
          (3, 4, 'Imelda Sofia Pascual',      'imelda.pascual.y3@cursus.local'),
          (3, 5, 'Joaquin Antonio Lim',       'joaquin.lim.y3@cursus.local'),
          (4, 1, 'Katarina Luisa Manalo',     'katarina.manalo.y4@cursus.local'),
          (4, 2, 'Lorenzo Diego Salazar',     'lorenzo.salazar.y4@cursus.local'),
          (4, 3, 'Margarita Rose Espino',     'margarita.espino.y4@cursus.local'),
          (4, 4, 'Nicolas Carlos Tagle',      'nicolas.tagle.y4@cursus.local'),
          (4, 5, 'Olivia Theresa Romualdez',  'olivia.romualdez.y4@cursus.local')
        ) AS roster(year, idx, name, email)
        WHERE year = y AND idx = v_face_idx;

        v_code := EXTRACT(YEAR FROM now())::TEXT
                || '-' || LPAD(nextval('student_code_seq')::TEXT, 5, '0') || '-MN-0';

        INSERT INTO users (user_code, email, password_hash, full_name, role, branch,
                           program_id, year_level, block_id, password_must_change)
        VALUES (v_code, v_email, pw, v_name, 'student', 'MN',
                bscs_id, y, v_block_id, FALSE);
      END;
    END LOOP;
  END LOOP;

  -- ============================================================
  -- 9. IRREGULAR STUDENTS — 3 transferees, block_id = NULL
  -- ============================================================
  -- These mimic the "transferee mid-year" reality: they have a program_id and
  -- a year_level but no permanent block, so Open Term + Promote skip them and
  -- they must be enrolled per-section manually by the admin.
  irreg_code_1 := EXTRACT(YEAR FROM now())::TEXT
                  || '-' || LPAD(nextval('student_code_seq')::TEXT, 5, '0') || '-MN-0';
  INSERT INTO users (user_code, email, password_hash, full_name, role, branch,
                     program_id, year_level, block_id, password_must_change)
  VALUES (irreg_code_1, 'paolo.transferee@cursus.local', pw,
          'Paolo Anton Buenaventura', 'student', 'MN',
          bscs_id, 2, NULL, FALSE)
  RETURNING id INTO irreg_id_1;

  irreg_code_2 := EXTRACT(YEAR FROM now())::TEXT
                  || '-' || LPAD(nextval('student_code_seq')::TEXT, 5, '0') || '-MN-0';
  INSERT INTO users (user_code, email, password_hash, full_name, role, branch,
                     program_id, year_level, block_id, password_must_change)
  VALUES (irreg_code_2, 'celine.retaker@cursus.local', pw,
          'Celine Margarita Robles', 'student', 'MN',
          bscs_id, 3, NULL, FALSE)
  RETURNING id INTO irreg_id_2;

  irreg_code_3 := EXTRACT(YEAR FROM now())::TEXT
                  || '-' || LPAD(nextval('student_code_seq')::TEXT, 5, '0') || '-MN-0';
  INSERT INTO users (user_code, email, password_hash, full_name, role, branch,
                     program_id, year_level, block_id, password_must_change)
  VALUES (irreg_code_3, 'miguel.shifter@cursus.local', pw,
          'Miguel Esteban Lacanlale', 'student', 'MN',
          bscs_id, 2, NULL, FALSE)
  RETURNING id INTO irreg_id_3;

  -- ============================================================
  -- 10. TERMS — 7 past + 1 current
  --
  -- Dates are anchored to TODAY so the seed is portable across time:
  -- the current term is always in-progress (started 6 weeks ago, ends 14
  -- weeks from now), and past terms cascade backward. AY labels are
  -- computed from the resulting start year so they always match the dates.
  -- ============================================================
  DECLARE
    cur_s          DATE := (CURRENT_DATE - INTERVAL '6 weeks')::DATE;   -- ~mid-semester
    cur_e          DATE := (CURRENT_DATE + INTERVAL '14 weeks')::DATE;  -- ends in ~3 months
    sum_s          DATE; sum_e          DATE;
    p2_1s_s        DATE; p2_1s_e        DATE;   -- 1 cycle back, 1st sem
    p2_2s_s        DATE; p2_2s_e        DATE;
    p3_1s_s        DATE; p3_1s_e        DATE;   -- 2 cycles back
    p3_2s_s        DATE; p3_2s_e        DATE;
    p4_1s_s        DATE; p4_1s_e        DATE;   -- 3 cycles back
    p4_2s_s        DATE; p4_2s_e        DATE;
  BEGIN
    -- Summer just before current 1st-sem term
    sum_e := cur_s - INTERVAL '4 weeks';
    sum_s := sum_e - INTERVAL '8 weeks';
    -- 1 cycle back: prev 2nd sem (ends just before that summer)
    p2_2s_e := sum_s - INTERVAL '4 weeks';
    p2_2s_s := p2_2s_e - INTERVAL '18 weeks';
    -- 1 cycle back: prev 1st sem
    p2_1s_e := p2_2s_s - INTERVAL '6 weeks';
    p2_1s_s := p2_1s_e - INTERVAL '18 weeks';
    -- 2 cycles back
    p3_2s_e := p2_1s_s - INTERVAL '8 weeks';
    p3_2s_s := p3_2s_e - INTERVAL '18 weeks';
    p3_1s_e := p3_2s_s - INTERVAL '6 weeks';
    p3_1s_s := p3_1s_e - INTERVAL '18 weeks';
    -- 3 cycles back
    p4_2s_e := p3_1s_s - INTERVAL '8 weeks';
    p4_2s_s := p4_2s_e - INTERVAL '18 weeks';
    p4_1s_e := p4_2s_s - INTERVAL '6 weeks';
    p4_1s_s := p4_1s_e - INTERVAL '18 weeks';

    INSERT INTO terms (name, semester, start_date, end_date, is_active) VALUES
      (
        'AY ' || EXTRACT(YEAR FROM p4_1s_s)::INT
              || '–' || (EXTRACT(YEAR FROM p4_1s_s)::INT + 1)
              || ', 1st Semester',
        '1', p4_1s_s, p4_1s_e, FALSE
      ),
      (
        'AY ' || EXTRACT(YEAR FROM p4_2s_s)::INT
              || '–' || (EXTRACT(YEAR FROM p4_2s_s)::INT + 1)
              || ', 2nd Semester',
        '2', p4_2s_s, p4_2s_e, FALSE
      ),
      (
        'AY ' || EXTRACT(YEAR FROM p3_1s_s)::INT
              || '–' || (EXTRACT(YEAR FROM p3_1s_s)::INT + 1)
              || ', 1st Semester',
        '1', p3_1s_s, p3_1s_e, FALSE
      ),
      (
        'AY ' || EXTRACT(YEAR FROM p3_2s_s)::INT
              || '–' || (EXTRACT(YEAR FROM p3_2s_s)::INT + 1)
              || ', 2nd Semester',
        '2', p3_2s_s, p3_2s_e, FALSE
      ),
      (
        'AY ' || EXTRACT(YEAR FROM p2_1s_s)::INT
              || '–' || (EXTRACT(YEAR FROM p2_1s_s)::INT + 1)
              || ', 1st Semester',
        '1', p2_1s_s, p2_1s_e, FALSE
      ),
      (
        'AY ' || EXTRACT(YEAR FROM p2_2s_s)::INT
              || '–' || (EXTRACT(YEAR FROM p2_2s_s)::INT + 1)
              || ', 2nd Semester',
        '2', p2_2s_s, p2_2s_e, FALSE
      ),
      (
        'AY ' || EXTRACT(YEAR FROM sum_s)::INT
              || '–' || (EXTRACT(YEAR FROM sum_s)::INT + 1)
              || ', Summer Term',
        'summer', sum_s, sum_e, FALSE
      ),
      (
        'AY ' || EXTRACT(YEAR FROM cur_s)::INT
              || '–' || (EXTRACT(YEAR FROM cur_s)::INT + 1)
              || ', 1st Semester',
        '1', cur_s, cur_e, TRUE
      );
  END;

  -- Resolve term ids by chronological order — terms were inserted oldest-first.
  -- Variable names keep the legacy '2022' / '2023' tags purely as labels for
  -- "3 cycles back" / "2 cycles back" / etc.; the actual dates depend on
  -- when the seed ran.
  SELECT id INTO t_2022_s1     FROM terms ORDER BY start_date LIMIT 1 OFFSET 0;
  SELECT id INTO t_2022_s2     FROM terms ORDER BY start_date LIMIT 1 OFFSET 1;
  SELECT id INTO t_2023_s1     FROM terms ORDER BY start_date LIMIT 1 OFFSET 2;
  SELECT id INTO t_2023_s2     FROM terms ORDER BY start_date LIMIT 1 OFFSET 3;
  SELECT id INTO t_2024_s1     FROM terms ORDER BY start_date LIMIT 1 OFFSET 4;
  SELECT id INTO t_2024_s2     FROM terms ORDER BY start_date LIMIT 1 OFFSET 5;
  SELECT id INTO t_2024_summer FROM terms ORDER BY start_date LIMIT 1 OFFSET 6;
  SELECT id INTO t_current     FROM terms ORDER BY start_date LIMIT 1 OFFSET 7;

  -- ============================================================
  -- 11. HISTORICAL SECTIONS + GRADES + EVALUATIONS
  --
  -- For each past term, work through every (cohort_block, curriculum_year, sem)
  -- that was active. Per (block × curriculum-course):
  --   • create the section with a deterministic faculty
  --   • create section_meetings (standard pair, or Sunday for NSTP/PATHFIT)
  --   • finalize an enrollment per student with mock numeric+letter grade
  --   • record the student's evaluation responses (all 8 questions)
  -- ============================================================

  -- Mapping table: which cohort_block was at which curriculum year level in
  -- which historical term? (block_id, year_level_then, semester_then, term_id)
  FOR v_term_id, v_block_id, v_year, v_sem IN
    SELECT * FROM (VALUES
      -- AY 2022–2023 1st Sem  — Y4-cohort was Y1
      (t_2022_s1, b_4_1, 1, '1'),
      -- AY 2022–2023 2nd Sem  — Y4-cohort was Y1
      (t_2022_s2, b_4_1, 1, '2'),
      -- AY 2023–2024 1st Sem  — Y4→Y2, Y3→Y1
      (t_2023_s1, b_4_1, 2, '1'), (t_2023_s1, b_3_1, 1, '1'),
      -- AY 2023–2024 2nd Sem  — Y4→Y2, Y3→Y1
      (t_2023_s2, b_4_1, 2, '2'), (t_2023_s2, b_3_1, 1, '2'),
      -- AY 2024–2025 1st Sem  — Y4→Y3, Y3→Y2, Y2→Y1
      (t_2024_s1, b_4_1, 3, '1'), (t_2024_s1, b_3_1, 2, '1'), (t_2024_s1, b_2_1, 1, '1'),
      -- AY 2024–2025 2nd Sem  — same trio
      (t_2024_s2, b_4_1, 3, '2'), (t_2024_s2, b_3_1, 2, '2'), (t_2024_s2, b_2_1, 1, '2'),
      -- AY 2024–2025 Summer   — Y4-cohort took Y3-Summer Practicum
      (t_2024_summer, b_4_1, 3, 'summer')
    ) AS cohorts(term_id, block_id, yr, sem)
  LOOP
    -- For each curriculum_course (BSCS, year=v_year, sem=v_sem)…
    FOR v_course_id, v_course_code, v_course_units, v_meets_per_wk, v_pattern_idx IN
      SELECT cc.course_id, c.code, c.units, cc.meetings_per_week, cc.display_order
        FROM curriculum_courses cc JOIN courses c ON c.id = cc.course_id
       WHERE cc.program_id = bscs_id
         AND cc.year_level = v_year
         AND cc.semester   = v_sem::semester_type
       ORDER BY cc.display_order
    LOOP
      -- Section code reflects the year-level the cohort was AT when they
      -- took this course (so a Y4-cohort's Y1 course reads 'BSCS 1-1', not
      -- 'BSCS 4-1'). Block number stays stable across years.
      v_section_code := 'BSCS '
        || v_year || '-'
        || (SELECT b.block_number::text FROM blocks b WHERE b.id = v_block_id)
        || ' ' || v_course_code;

      -- Pick a faculty deterministically (md5 of course || term varies per term).
      SELECT fq.faculty_id INTO v_faculty_id
        FROM faculty_qualifications fq
       WHERE fq.course_id = v_course_id
       ORDER BY md5(fq.faculty_id::text || v_term_id::text)
       LIMIT 1;

      INSERT INTO sections (block_id, course_id, term_id, faculty_id, section_code, capacity)
      VALUES (v_block_id, v_course_id, v_term_id, v_faculty_id, v_section_code, 50)
      RETURNING id INTO v_section_id;

      -- ── Meetings ─────────────────────────────────────────────
      v_dur_min := CASE WHEN v_course_units <= 2 THEN 90 ELSE 90 END;
      v_start_min := 60 * start_slots[((v_pattern_idx - 1) % array_length(start_slots, 1)) + 1];

      IF v_meets_per_wk = 1 THEN
        -- Single Sunday meeting (NSTP, PATHFIT) of double duration.
        INSERT INTO section_meetings (section_id, day_of_week, start_time, end_time)
        VALUES (
          v_section_id, 'Sun',
          make_time(v_start_min / 60, v_start_min % 60, 0),
          make_time((v_start_min + v_dur_min * 2) / 60, (v_start_min + v_dur_min * 2) % 60, 0)
        );
      ELSE
        -- Standard pair rotated by display_order: Mon+Thu / Tue+Fri / Wed+Sat.
        v_d1 := pair_days[((v_pattern_idx - 1) % 3) + 1][1];
        v_d2 := pair_days[((v_pattern_idx - 1) % 3) + 1][2];
        INSERT INTO section_meetings (section_id, day_of_week, start_time, end_time)
        VALUES
          (v_section_id, v_d1,
           make_time(v_start_min / 60, v_start_min % 60, 0),
           make_time((v_start_min + v_dur_min) / 60, (v_start_min + v_dur_min) % 60, 0)),
          (v_section_id, v_d2,
           make_time(v_start_min / 60, v_start_min % 60, 0),
           make_time((v_start_min + v_dur_min) / 60, (v_start_min + v_dur_min) % 60, 0));
      END IF;

      -- ── Enrollments + grades + evaluations ──────────────────
      -- Each student in v_block_id gets a finalized enrollment + an evaluation.
      FOR v_user_id, v_aptitude IN
        SELECT u.id,
               -- Aptitude band per student. Spread 84 → 94 across 5 students per
               -- block — high enough that a passing grade is the default and
               -- failures only happen on rare "off days" (below).
               (84 + 2.5 * ((row_number() OVER (ORDER BY u.created_at, u.id) - 1) % 5))::numeric
          FROM users u
         WHERE u.block_id = v_block_id AND u.role = 'student'
      LOOP
        -- Mock numeric grade: aptitude + tight jitter, clamped to [75, 99].
        -- Floor of 75 means a base grade is always at least a 3.00 pass.
        v_numeric := GREATEST(75, LEAST(99,
          v_aptitude + (random() - 0.5) * 6
        ))::numeric(5,2);

        -- ~3% "off day": knock the grade below 75 for a sprinkling of realistic
        -- retakes. Affects roughly 1–2 subjects across a 4-year transcript.
        IF random() < 0.03 THEN
          v_numeric := round((68 + random() * 5)::numeric, 2);
        END IF;

        -- PH letter scale (matches utils/gradeCalc.ts).
        v_letter := CASE
          WHEN v_numeric >= 98 THEN '1.00' WHEN v_numeric >= 95 THEN '1.25'
          WHEN v_numeric >= 92 THEN '1.50' WHEN v_numeric >= 89 THEN '1.75'
          WHEN v_numeric >= 86 THEN '2.00' WHEN v_numeric >= 83 THEN '2.25'
          WHEN v_numeric >= 80 THEN '2.50' WHEN v_numeric >= 77 THEN '2.75'
          WHEN v_numeric >= 75 THEN '3.00' ELSE '5.00' END;

        INSERT INTO enrollments (student_id, section_id, status, enrolled_at,
                                 numeric_grade, letter_grade,
                                 finalized_at, finalized_by)
        VALUES (v_user_id, v_section_id, 'completed',
                (SELECT start_date FROM terms WHERE id = v_term_id) - interval '14 days',
                v_numeric, v_letter,
                (SELECT end_date FROM terms WHERE id = v_term_id) + interval '3 days',
                v_faculty_id);

        -- Evaluation (anonymous from faculty's perspective).
        INSERT INTO evaluations (section_id, student_id, submitted_at)
        VALUES (v_section_id, v_user_id,
                (SELECT end_date FROM terms WHERE id = v_term_id) - interval '5 days')
        RETURNING id INTO v_eval_id;

        FOR v_q_id IN SELECT id FROM eval_questions WHERE archived_at IS NULL ORDER BY display_order
        LOOP
          IF (SELECT kind FROM eval_questions WHERE id = v_q_id) = 'likert_5' THEN
            -- Faculty-quality ~ stable; jitter per response.
            v_likert := GREATEST(1, LEAST(5,
              4 + (CASE WHEN random() < 0.15 THEN -1 WHEN random() < 0.10 THEN 1 ELSE 0 END)
            ));
            INSERT INTO eval_answers (evaluation_id, question_id, likert_value)
            VALUES (v_eval_id, v_q_id, v_likert);
          ELSE
            -- Free-text — occasional brief comment so faculty sees real content.
            INSERT INTO eval_answers (evaluation_id, question_id, text_value)
            VALUES (v_eval_id, v_q_id,
              (ARRAY[
                'Clear lectures. More hands-on activities would help.',
                'Approachable and patient with questions.',
                'Pace was a bit fast; could use more examples.',
                'Fair grading. Quizzes matched the lectures.',
                NULL, NULL, NULL  -- many students leave blank
              ])[((random() * 7)::int) + 1]);
          END IF;
        END LOOP;
      END LOOP;

      -- One eval_period per term (idempotent — set on first iteration).
      INSERT INTO eval_periods (term_id, opens_at, closes_at, min_response_n)
      VALUES (v_term_id,
              (SELECT end_date FROM terms WHERE id = v_term_id) - interval '30 days',
              (SELECT end_date FROM terms WHERE id = v_term_id) + interval '7 days',
              3)
      ON CONFLICT (term_id) DO NOTHING;
    END LOOP;
  END LOOP;

  -- ============================================================
  -- 12. CURRENT ACTIVE TERM — sections, faculty, confirmed enrollments,
  --     NO finalized grades (mid-semester feel).
  -- ============================================================
  FOR v_block_id, v_year, v_sem IN
    SELECT * FROM (VALUES
      (b_1_1, 1, '1'), (b_2_1, 2, '1'), (b_3_1, 3, '1'), (b_4_1, 4, '1')
    ) AS active(blk, yr, sem)
  LOOP
    FOR v_course_id, v_course_code, v_course_units, v_meets_per_wk, v_pattern_idx IN
      SELECT cc.course_id, c.code, c.units, cc.meetings_per_week, cc.display_order
        FROM curriculum_courses cc JOIN courses c ON c.id = cc.course_id
       WHERE cc.program_id = bscs_id
         AND cc.year_level = v_year
         AND cc.semester   = v_sem::semester_type
       ORDER BY cc.display_order
    LOOP
      v_section_code := 'BSCS '
        || (SELECT b.year_level::text FROM blocks b WHERE b.id = v_block_id)
        || '-'
        || (SELECT b.block_number::text FROM blocks b WHERE b.id = v_block_id)
        || ' ' || v_course_code;

      SELECT fq.faculty_id INTO v_faculty_id
        FROM faculty_qualifications fq
       WHERE fq.course_id = v_course_id
       ORDER BY md5(fq.faculty_id::text || t_current::text)
       LIMIT 1;

      INSERT INTO sections (block_id, course_id, term_id, faculty_id, section_code, capacity)
      VALUES (v_block_id, v_course_id, t_current, v_faculty_id, v_section_code, 50)
      RETURNING id INTO v_section_id;

      v_dur_min := 90;
      v_start_min := 60 * start_slots[((v_pattern_idx - 1) % array_length(start_slots, 1)) + 1];

      IF v_meets_per_wk = 1 THEN
        INSERT INTO section_meetings (section_id, day_of_week, start_time, end_time)
        VALUES (v_section_id, 'Sun',
                (v_start_min || ' minutes')::interval,
                ((v_start_min + v_dur_min * 2) || ' minutes')::interval);
      ELSE
        v_d1 := pair_days[((v_pattern_idx - 1) % 3) + 1][1];
        v_d2 := pair_days[((v_pattern_idx - 1) % 3) + 1][2];
        INSERT INTO section_meetings (section_id, day_of_week, start_time, end_time)
        VALUES
          (v_section_id, v_d1,
           (v_start_min || ' minutes')::interval,
           ((v_start_min + v_dur_min) || ' minutes')::interval),
          (v_section_id, v_d2,
           (v_start_min || ' minutes')::interval,
           ((v_start_min + v_dur_min) || ' minutes')::interval);
      END IF;

      -- Confirmed enrollments (status='enrolled', NO grades yet).
      INSERT INTO enrollments (student_id, section_id, status, enrolled_at)
      SELECT u.id, v_section_id, 'enrolled', now() - interval '6 weeks'
        FROM users u
       WHERE u.block_id = v_block_id AND u.role = 'student'
         AND u.graduated_at IS NULL;
    END LOOP;
  END LOOP;

  -- Eval period for the CURRENT term — open now, so user can test live submission.
  INSERT INTO eval_periods (term_id, opens_at, closes_at, min_response_n)
  VALUES (t_current,
          now() - interval '5 days',     -- already opened
          (SELECT end_date FROM terms WHERE id = t_current) + interval '7 days',
          3)
  ON CONFLICT (term_id) DO NOTHING;

  -- ============================================================
  -- 13. IRREGULAR-STUDENT SAMPLE ENROLLMENTS
  --
  -- Give each irregular a couple of current-term sections so they appear
  -- on rosters / schedules / COR. The admin can add more via the UI.
  -- ============================================================
  INSERT INTO enrollments (student_id, section_id, status, enrolled_at)
  SELECT irreg_id_1, s.id, 'enrolled', now() - interval '3 weeks'
    FROM sections s JOIN courses c ON c.id = s.course_id
   WHERE s.term_id = t_current
     AND s.block_id = b_2_1
     AND c.code IN ('COMP006', 'GEED008', 'COSC201')   -- Paolo is Y2-ish
   LIMIT 3;

  INSERT INTO enrollments (student_id, section_id, status, enrolled_at)
  SELECT irreg_id_2, s.id, 'enrolled', now() - interval '3 weeks'
    FROM sections s JOIN courses c ON c.id = s.course_id
   WHERE s.term_id = t_current
     AND s.block_id = b_3_1
     AND c.code IN ('COMP019', 'COSC301', 'COMP013')   -- Celine is Y3-ish
   LIMIT 3;

  INSERT INTO enrollments (student_id, section_id, status, enrolled_at)
  SELECT irreg_id_3, s.id, 'enrolled', now() - interval '3 weeks'
    FROM sections s JOIN courses c ON c.id = s.course_id
   WHERE s.term_id = t_current
     AND s.block_id = b_2_1
     AND c.code IN ('COMP005', 'COSC202')              -- Miguel: just two for now
   LIMIT 2;

  -- Also drop a couple of completed prior-term enrollments for the irregulars
  -- so they have *some* transcript history (transferee credit).
  INSERT INTO enrollments (student_id, section_id, status, enrolled_at,
                           numeric_grade, letter_grade, finalized_at, finalized_by)
  SELECT irreg_id_1, s.id, 'completed',
         (SELECT start_date FROM terms WHERE id = s.term_id) - interval '14 days',
         85.5, '2.00',
         (SELECT end_date FROM terms WHERE id = s.term_id) + interval '3 days',
         s.faculty_id
    FROM sections s JOIN courses c ON c.id = s.course_id
   WHERE s.term_id = t_2024_s2 AND s.block_id = b_2_1
     AND c.code IN ('COMP003', 'MATH017')
   LIMIT 2;

  INSERT INTO enrollments (student_id, section_id, status, enrolled_at,
                           numeric_grade, letter_grade, finalized_at, finalized_by)
  SELECT irreg_id_2, s.id, 'completed',
         (SELECT start_date FROM terms WHERE id = s.term_id) - interval '14 days',
         88.0, '1.75',
         (SELECT end_date FROM terms WHERE id = s.term_id) + interval '3 days',
         s.faculty_id
    FROM sections s JOIN courses c ON c.id = s.course_id
   WHERE s.term_id = t_2024_s2 AND s.block_id = b_3_1
     AND c.code IN ('ELECCSFE2', 'COMP008')
   LIMIT 2;

  -- ============================================================
  -- 14. STRATEGIC FAILURES — make 3 cohort students irregular-by-retake.
  --
  -- These overlay specific 5.00 grades so the failed-prereq → locked-
  -- downstream chain has demonstrable cases:
  --
  --   • Olivia (Y4, block 4-1): failed COSC305 (Thesis 1, Y3-S2).
  --     COSC401 (Thesis 2, Y4-S1) is now LOCKED for her this term.
  --   • Joaquin (Y3, block 3-1): failed COMP006 (Data Structures, Y2-S1).
  --     Cascades to COSC302 + COSC303 (both Y3-S1).
  --   • Emilio  (Y2, block 2-1): failed COMP004 (Discrete I, Y1-S2).
  --     COMP005 (Y2-S1) locked.
  --
  -- Then we PRUNE their current-term enrollments to match what the new
  -- Open Term logic would have produced:
  --   • drop sections whose course depends on a failed prereq (locked)
  --   • leave the rest in place (they still attend those cohort subjects)
  --   • add a retake enrollment whenever the failed course is offered
  --     in the current semester (mirrors Open Term's retake clause).
  -- ============================================================
  DECLARE
    v_id_olivia  UUID;
    v_id_joaquin UUID;
    v_id_emilio  UUID;
  BEGIN
    SELECT id INTO v_id_olivia  FROM users WHERE email = 'olivia.romualdez.y4@cursus.local';
    SELECT id INTO v_id_joaquin FROM users WHERE email = 'joaquin.lim.y3@cursus.local';
    SELECT id INTO v_id_emilio  FROM users WHERE email = 'emilio.tan.y2@cursus.local';

    UPDATE enrollments e
       SET letter_grade = '5.00', numeric_grade = 72.50
      FROM sections s JOIN courses c ON c.id = s.course_id
     WHERE e.section_id = s.id
       AND e.student_id = v_id_olivia
       AND s.term_id    = t_2024_s2
       AND c.code       = 'COSC305';

    UPDATE enrollments e
       SET letter_grade = '5.00', numeric_grade = 71.00
      FROM sections s JOIN courses c ON c.id = s.course_id
     WHERE e.section_id = s.id
       AND e.student_id = v_id_joaquin
       AND s.term_id    = t_2024_s1
       AND c.code       = 'COMP006';

    UPDATE enrollments e
       SET letter_grade = '5.00', numeric_grade = 72.00
      FROM sections s JOIN courses c ON c.id = s.course_id
     WHERE e.section_id = s.id
       AND e.student_id = v_id_emilio
       AND s.term_id    = t_2024_s2
       AND c.code       = 'COMP004';

    -- Generic prune: for each affected student, delete any current-term
    -- enrollment whose course has a prereq the student hasn't passed.
    DELETE FROM enrollments e
      USING sections s, courses c, course_prerequisites cp
     WHERE e.section_id  = s.id
       AND s.term_id     = t_current
       AND s.course_id   = c.id
       AND cp.course_id  = c.id
       AND e.student_id  IN (v_id_olivia, v_id_joaquin, v_id_emilio)
       AND NOT EXISTS (
         SELECT 1 FROM enrollments ep
           JOIN sections sp ON sp.id = ep.section_id
          WHERE ep.student_id = e.student_id
            AND sp.course_id  = cp.prerequisite_id
            AND ep.numeric_grade >= 75
       );

    -- Auto-enroll retakes IF the failed course is offered this term anywhere.
    -- The student joins the section of whichever block is taking that course
    -- now (e.g., Joaquin re-takes COMP006 alongside the current BSCS 2-1 cohort).
    INSERT INTO enrollments (student_id, section_id, status, enrolled_at)
    SELECT u.id, s.id, 'enrolled', now() - interval '6 weeks'
      FROM users u
      JOIN enrollments ef ON ef.student_id = u.id AND ef.letter_grade = '5.00'
      JOIN sections    sf ON sf.id = ef.section_id
      JOIN sections    s  ON s.term_id = t_current AND s.course_id = sf.course_id
     WHERE u.id IN (v_id_olivia, v_id_joaquin, v_id_emilio)
       AND NOT EXISTS (
         SELECT 1 FROM enrollments ep
           JOIN sections sp ON sp.id = ep.section_id
          WHERE ep.student_id = u.id
            AND sp.course_id  = sf.course_id
            AND ep.numeric_grade >= 75
       )
    ON CONFLICT (student_id, section_id) DO NOTHING;
  END;

  -- ============================================================
  -- 15. RAISE NOTICE — show the irregular student codes for testing.
  -- ============================================================
  RAISE NOTICE ' ';
  RAISE NOTICE '┌────────────────────────────────────────────────────────────────┐';
  RAISE NOTICE '│  IRREGULAR — no block (transferees / shifters)                 │';
  RAISE NOTICE '├────────────────────────────────────────────────────────────────┤';
  RAISE NOTICE '│  % │ Paolo Anton Buenaventura  │ Y2 transferee', irreg_code_1;
  RAISE NOTICE '│  % │ Celine Margarita Robles   │ Y3 re-taker',   irreg_code_2;
  RAISE NOTICE '│  % │ Miguel Esteban Lacanlale  │ Y2 shifter',    irreg_code_3;
  RAISE NOTICE '└────────────────────────────────────────────────────────────────┘';
  RAISE NOTICE ' ';
  RAISE NOTICE '┌────────────────────────────────────────────────────────────────┐';
  RAISE NOTICE '│  IRREGULAR — outstanding retakes (cohort students)             │';
  RAISE NOTICE '├────────────────────────────────────────────────────────────────┤';
  RAISE NOTICE '│  Olivia Theresa Romualdez (Y4) — failed COSC305, COSC401 locked';
  RAISE NOTICE '│  Joaquin Antonio Lim      (Y3) — failed COMP006 (cascades)';
  RAISE NOTICE '│  Emilio Aguinaldo Tan     (Y2) — failed COMP004, COMP005 locked';
  RAISE NOTICE '└────────────────────────────────────────────────────────────────┘';
  RAISE NOTICE 'All passwords: 1.PolytechnicU';
  RAISE NOTICE ' ';
END $$;


-- ============================================================
-- POST-SEED VERIFY
-- ============================================================
-- Counts by role
SELECT role, count(*) AS n FROM users GROUP BY role ORDER BY role;

-- Cohort layout (regular students only — alumni would show too)
SELECT b.year_level, b.block_number, count(u.id) AS students
  FROM blocks b
  LEFT JOIN users u ON u.block_id = b.id AND u.role = 'student' AND u.graduated_at IS NULL
 WHERE b.program_id = '11111111-1111-1111-1111-111111111111'
 GROUP BY b.year_level, b.block_number
 ORDER BY b.year_level, b.block_number;

-- Irregular roster
SELECT user_code, full_name, email, year_level, block_id IS NULL AS irregular
  FROM users WHERE role = 'student' AND block_id IS NULL
 ORDER BY full_name;

-- Term inventory (active term marked TRUE)
SELECT name, semester, start_date, end_date, is_active FROM terms ORDER BY start_date;

-- Sanity: sections + finalized enrollments per term
SELECT t.name,
       (SELECT count(*) FROM sections s WHERE s.term_id = t.id) AS sections,
       (SELECT count(*) FROM enrollments e JOIN sections s ON s.id = e.section_id
         WHERE s.term_id = t.id AND e.letter_grade IS NOT NULL) AS finalized_grades,
       (SELECT count(*) FROM evaluations ev JOIN sections s ON s.id = ev.section_id
         WHERE s.term_id = t.id) AS evaluations
  FROM terms t ORDER BY t.start_date;

-- Final-GWA preview per Y4 student (to verify the lived-in transcript)
SELECT u.full_name,
       round(
         sum(e.letter_grade::numeric * c.units) / nullif(sum(c.units), 0),
       2) AS gwa,
       sum(c.units) AS total_units
  FROM users u
  JOIN enrollments e ON e.student_id = u.id AND e.letter_grade IS NOT NULL
  JOIN sections    s ON s.id = e.section_id
  JOIN courses     c ON c.id = s.course_id
 WHERE u.role = 'student' AND u.year_level = 4
 GROUP BY u.id, u.full_name
 ORDER BY u.full_name;
