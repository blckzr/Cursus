-- ============================================================
-- Migration 005: BSCS Curriculum (Bachelor of Science in Computer Science)
--
-- Seeds the full 4-year + summer curriculum from the reference handbook
-- along with every prerequisite link.
--
-- Course codes preserve the institute's "DEPT NNN" format
-- (e.g. 'COMP 001', 'GEED 032'). Codes with spaces are intentional.
--
-- General-Ed and PE courses (GEED / NSTP / PATHFIT / MATH) are linked
-- to BSCS here for simplicity — if you later want them shared with other
-- programs, run an UPDATE to set their program_id to NULL.
--
-- Unit summary
--   Y1 S1 23 · Y1 S2 23
--   Y2 S1 23 · Y2 S2 23
--   Y3 S1 21 · Y3 S2 21 · Y3 Summer 3
--   Y4 S1 18 · Y4 S2 12
--   Total: 167 units (57 courses)
--
-- Prerequisite: migration 003 must already have inserted the BSCS program.
-- Safe to re-run: every insert is guarded with ON CONFLICT DO NOTHING.
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM programs WHERE code = 'BSCS') THEN
        RAISE EXCEPTION 'BSCS program not found — run migrations/003_student_program.sql first.';
    END IF;
END $$;

-- ============================================================
-- Courses
-- ============================================================
INSERT INTO courses (code, title, units, program_id) VALUES
    -- ── YEAR 1, FIRST SEMESTER ─────────────────────────────
    ('COMP 002',    'Computer Programming 1',                                            3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('GEED 032',    'Filipinolohiya at Pambansang Kaunlaran',                            3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('COMP 001',    'Introduction to Computing',                                         3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('GEED 004',    'Mathematics in the Modern World/Matematika sa Makabagong Daigdig',  3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('NSTP 001',    'National Service Training Program 1',                               3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('PATHFIT 1',   'Physical Activity Towards Health and Fitness 1',                    2, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('GEED 020',    'Politics, Governance and Citizenship',                              3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('GEED 005',    'Purposive Communication/Malayuning Komunikasyon',                   3, (SELECT id FROM programs WHERE code = 'BSCS')),

    -- ── YEAR 1, SECOND SEMESTER ────────────────────────────
    ('COMP 003',    'Computer Programming 2',                                            3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('MATH 017',    'Differential Calculus for Computer Science Students',               3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('COMP 004',    'Discrete Structures 1',                                             3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('NSTP 002',    'National Service Training Program 2',                               3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('GEED 033',    'Pagsasalin sa Kontekstong Filipino',                                3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('PATHFIT 2',   'Physical Activity Towards Health and Fitness 2',                    2, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('GEED 007',    'Science, Technology and Society/Agham, Teknolohiya, at Lipunan',    3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('GEED 001',    'Understanding the Self/Pag-unawa sa Sarili',                        3, (SELECT id FROM programs WHERE code = 'BSCS')),

    -- ── YEAR 2, FIRST SEMESTER ─────────────────────────────
    ('ELEC CS-FE1', 'BSCS Free Elective 1',                                              3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('COMP 006',    'Data Structures and Algorithms',                                    3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('COMP 005',    'Discrete Structures 2',                                             3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('GEED 008',    'Ethics/Etika',                                                      3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('COSC 201',    'Logic Design and Digital Computer Circuits',                        3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('COSC 202',    'Modeling and Simulation',                                           3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('COMP 009',    'Object Oriented Programming',                                       3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('PATHFIT 3',   'Physical Activity Towards Health and Fitness 3',                    2, (SELECT id FROM programs WHERE code = 'BSCS')),

    -- ── YEAR 2, SECOND SEMESTER ────────────────────────────
    ('ELEC CS-FE2', 'BSCS Free Elective 2',                                              3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('COMP 008',    'Data Communications and Networking',                                3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('COSC 203',    'Design and Analysis of Algorithms',                                 3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('COMP 010',    'Information Management',                                            3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('COMP 007',    'Operating Systems',                                                 3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('GEED 010',    'People and the Earth''s Ecosystems',                                3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('PATHFIT 4',   'Physical Activity Towards Health and Fitness 4',                    2, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('COMP 011',    'Technical Documentation and Presentation Skills in ICT',            3, (SELECT id FROM programs WHERE code = 'BSCS')),

    -- ── YEAR 3, FIRST SEMESTER ─────────────────────────────
    ('COMP 019',    'Applications Development and Emerging Technologies',                3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('COSC 302',    'Automata and Language Theory',                                      3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('ELEC CS-E1',  'BSCS Elective 1',                                                   3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('COSC 301',    'Computer Organization and Assembly Language',                       3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('COMP 015',    'Fundamentals of Research',                                          3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('COMP 013',    'Human Computer Interaction',                                        3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('COSC 303',    'Principles of Programming Languages',                               3, (SELECT id FROM programs WHERE code = 'BSCS')),

    -- ── YEAR 3, SECOND SEMESTER ────────────────────────────
    ('GEED 006',    'Art Appreciation/Pagpapahalaga sa Sining',                          3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('ELEC CS-E2',  'BSCS Elective 2',                                                   3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('COSC 305',    'CS Thesis Writing 1',                                               3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('COMP 020',    'Information Assurance and Security',                                3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('COSC 304',    'Introduction to Artificial Intelligence',                           3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('COMP 021',    'Software Engineering 1',                                            3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('COMP 016',    'Web Development',                                                   3, (SELECT id FROM programs WHERE code = 'BSCS')),

    -- ── YEAR 3, SUMMER SEMESTER ────────────────────────────
    ('COSC 306',    'Practicum (200 hours)',                                             3, (SELECT id FROM programs WHERE code = 'BSCS')),

    -- ── YEAR 4, FIRST SEMESTER ─────────────────────────────
    ('ELEC CS-E3',  'BSCS Elective 3',                                                   3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('COSC 401',    'CS Thesis Writing 2',                                               3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('GEED 026',    'Philippine Popular Culture',                                        3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('GEED 002',    'Readings in Philippine History/Mga Babasahin Hinggil sa Kasaysayan ng Pilipinas', 3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('COMP 022',    'Software Engineering 2',                                            3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('GEED 003',    'The Contemporary World/Ang Kasalukuyang Daigdig',                   3, (SELECT id FROM programs WHERE code = 'BSCS')),

    -- ── YEAR 4, SECOND SEMESTER ────────────────────────────
    ('ELEC CS-E4',  'BSCS Elective 4',                                                   3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('COSC 402',    'Current Trends and Topics in Computing',                            3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('GEED 037',    'Life and Works of Rizal/Buhay at Mga Gawa ni Rizal',                3, (SELECT id FROM programs WHERE code = 'BSCS')),
    ('COMP 023',    'Social and Professional Issues in Computing',                       3, (SELECT id FROM programs WHERE code = 'BSCS'))
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- Prerequisites
-- ============================================================
WITH prereqs (course_code, prereq_code) AS (VALUES
    -- Year 1, Sem 2
    ('COMP 003',  'COMP 002'),     -- Programming 2          ← Programming 1
    ('MATH 017',  'GEED 004'),     -- Differential Calculus  ← Math in Modern World
    ('COMP 004',  'GEED 004'),     -- Discrete Structures 1  ← Math in Modern World
    ('GEED 033',  'GEED 032'),     -- Pagsasalin             ← Filipinolohiya
    ('PATHFIT 2', 'PATHFIT 1'),

    -- Year 2, Sem 1
    ('COMP 005',  'COMP 004'),     -- Discrete 2             ← Discrete 1
    ('COSC 201',  'COMP 001'),     -- Logic Design           ← Intro to Computing
    ('COMP 009',  'COMP 003'),     -- OOP                    ← Programming 2
    ('PATHFIT 3', 'PATHFIT 2'),

    -- Year 2, Sem 2
    ('COMP 008',  'COSC 201'),     -- Data Comms             ← Logic Design
    ('COSC 203',  'COMP 006'),     -- Algorithms             ← Data Structures
    ('COMP 010',  'COMP 006'),     -- Info Management        ← Data Structures
    ('COMP 007',  'COMP 001'),     -- OS                     ← Intro to Computing
    ('PATHFIT 4', 'PATHFIT 3'),

    -- Year 3, Sem 1
    ('COMP 019',  'COMP 009'),     -- App Dev                ← OOP
    ('COSC 302',  'COMP 006'),     -- Automata               ← Data Structures
    ('COSC 301',  'COMP 002'),     -- Computer Org           ← Programming 1
    ('COSC 301',  'COSC 201'),     -- Computer Org           ← Logic Design
    ('COMP 015',  'COMP 011'),     -- Research               ← Tech Documentation
    ('COMP 013',  'COMP 002'),     -- HCI                    ← Programming 1
    ('COSC 303',  'COMP 006'),     -- PL                     ← Data Structures

    -- Year 3, Sem 2
    ('COSC 305',  'COMP 015'),     -- Thesis 1               ← Research
    ('COSC 304',  'COSC 302'),     -- AI                     ← Automata
    ('COMP 021',  'COMP 009'),     -- SE 1                   ← OOP
    ('COMP 021',  'COMP 010'),     -- SE 1                   ← Info Management
    ('COMP 016',  'COMP 009'),     -- Web Dev                ← OOP
    ('COMP 016',  'COMP 010'),     -- Web Dev                ← Info Management

    -- Year 3, Summer
    ('COSC 306',  'COMP 008'),     -- Practicum              ← Data Comms
    ('COSC 306',  'COMP 009'),     -- Practicum              ← OOP
    ('COSC 306',  'COMP 010'),     -- Practicum              ← Info Management
    ('COSC 306',  'COMP 021'),     -- Practicum              ← SE 1

    -- Year 4, Sem 1
    ('COSC 401',  'COSC 305'),     -- Thesis 2               ← Thesis 1
    ('COMP 022',  'COMP 021')      -- SE 2                   ← SE 1
)
INSERT INTO course_prerequisites (course_id, prerequisite_id)
SELECT c.id, p.id
FROM prereqs pr
JOIN courses c ON c.code = pr.course_code
JOIN courses p ON p.code = pr.prereq_code
ON CONFLICT DO NOTHING;

-- ============================================================
-- Set BSCS total_units to match the curriculum
-- ============================================================
UPDATE programs SET total_units = 167 WHERE code = 'BSCS';
