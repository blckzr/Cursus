-- ============================================================
-- SIS Seed Data
--
-- Run this AFTER migrations/schema.sql on a fresh database.
-- Inserts:
--   • Admin user (admin@sis.local / Admin@1234)
--   • 6 degree programs (BSCS, BSIT, BSN, BSME, BSCE, BSBIO)
--   • Block sections auto-generated for each program
--   • Full BSCS course catalog with visibility tagging
--     (GE/NSTP/PATHFIT are 'public', everything else 'restricted' to BSCS)
--   • BSCS curriculum placement (year + semester for every course)
--   • All prerequisite links
-- ============================================================


-- ─── Admin user ─────────────────────────────────────────────
-- Password: Admin@1234  (bcrypt cost-12 hash)
INSERT INTO users (email, password_hash, full_name, role, branch, user_code)
VALUES (
    'admin@sis.local',
    '$2a$12$a54Ntg6pq4X3A.HFvs7h9OGXFUyzFI9ZtkbeydkFBlKgDAT3TPOSq',
    'System Administrator',
    'admin',
    'MN',
    CONCAT(
        EXTRACT(YEAR FROM NOW())::TEXT, '-',
        LPAD(nextval('admin_code_seq')::TEXT, 5, '0'), '-MN-2'
    )
);


-- ─── Programs ───────────────────────────────────────────────
INSERT INTO programs (code, name, total_units, year_levels, blocks_per_year, block_capacity) VALUES
    ('BSCS',  'Bachelor of Science in Computer Science',       167, 4, 3, 50),
    ('BSIT',  'Bachelor of Science in Information Technology', 150, 4, 3, 50),
    ('BSN',   'Bachelor of Science in Nursing',                200, 4, 3, 50),
    ('BSME',  'Bachelor of Science in Mechanical Engineering', 175, 5, 3, 50),
    ('BSCE',  'Bachelor of Science in Civil Engineering',      175, 5, 3, 50),
    ('BSBIO', 'Bachelor of Science in Biology',                160, 4, 3, 50);


-- ─── Block sections (auto-generated) ────────────────────────
INSERT INTO block_sections (program_id, year_level, block_number, capacity)
SELECT p.id, y.year_level, b.block_number, p.block_capacity
FROM programs p
CROSS JOIN generate_series(1, p.year_levels)     AS y(year_level)
CROSS JOIN generate_series(1, p.blocks_per_year) AS b(block_number);


-- ============================================================
-- BSCS Course Catalog
-- ============================================================

-- ── Public courses (open to all programs) ──────────────────
INSERT INTO courses (code, title, units, visibility) VALUES
    ('GEED 001', 'Understanding the Self/Pag-unawa sa Sarili',                                    3, 'public'),
    ('GEED 002', 'Readings in Philippine History/Mga Babasahin Hinggil sa Kasaysayan ng Pilipinas', 3, 'public'),
    ('GEED 003', 'The Contemporary World/Ang Kasalukuyang Daigdig',                               3, 'public'),
    ('GEED 004', 'Mathematics in the Modern World/Matematika sa Makabagong Daigdig',              3, 'public'),
    ('GEED 005', 'Purposive Communication/Malayuning Komunikasyon',                               3, 'public'),
    ('GEED 006', 'Art Appreciation/Pagpapahalaga sa Sining',                                      3, 'public'),
    ('GEED 007', 'Science, Technology and Society/Agham, Teknolohiya, at Lipunan',                3, 'public'),
    ('GEED 008', 'Ethics/Etika',                                                                  3, 'public'),
    ('GEED 010', 'People and the Earth''s Ecosystems',                                            3, 'public'),
    ('GEED 020', 'Politics, Governance and Citizenship',                                          3, 'public'),
    ('GEED 026', 'Philippine Popular Culture',                                                    3, 'public'),
    ('GEED 032', 'Filipinolohiya at Pambansang Kaunlaran',                                        3, 'public'),
    ('GEED 033', 'Pagsasalin sa Kontekstong Filipino',                                            3, 'public'),
    ('GEED 037', 'Life and Works of Rizal/Buhay at Mga Gawa ni Rizal',                            3, 'public'),
    ('NSTP 001', 'National Service Training Program 1',                                           3, 'public'),
    ('NSTP 002', 'National Service Training Program 2',                                           3, 'public'),
    ('PATHFIT 1', 'Physical Activity Towards Health and Fitness 1',                               2, 'public'),
    ('PATHFIT 2', 'Physical Activity Towards Health and Fitness 2',                               2, 'public'),
    ('PATHFIT 3', 'Physical Activity Towards Health and Fitness 3',                               2, 'public'),
    ('PATHFIT 4', 'Physical Activity Towards Health and Fitness 4',                               2, 'public');


-- ── Restricted courses (BSCS-specific) ─────────────────────
INSERT INTO courses (code, title, units, visibility) VALUES
    ('COMP 001', 'Introduction to Computing',                                3, 'restricted'),
    ('COMP 002', 'Computer Programming 1',                                   3, 'restricted'),
    ('COMP 003', 'Computer Programming 2',                                   3, 'restricted'),
    ('COMP 004', 'Discrete Structures 1',                                    3, 'restricted'),
    ('COMP 005', 'Discrete Structures 2',                                    3, 'restricted'),
    ('COMP 006', 'Data Structures and Algorithms',                           3, 'restricted'),
    ('COMP 007', 'Operating Systems',                                        3, 'restricted'),
    ('COMP 008', 'Data Communications and Networking',                       3, 'restricted'),
    ('COMP 009', 'Object Oriented Programming',                              3, 'restricted'),
    ('COMP 010', 'Information Management',                                   3, 'restricted'),
    ('COMP 011', 'Technical Documentation and Presentation Skills in ICT',   3, 'restricted'),
    ('COMP 013', 'Human Computer Interaction',                               3, 'restricted'),
    ('COMP 015', 'Fundamentals of Research',                                 3, 'restricted'),
    ('COMP 016', 'Web Development',                                          3, 'restricted'),
    ('COMP 019', 'Applications Development and Emerging Technologies',       3, 'restricted'),
    ('COMP 020', 'Information Assurance and Security',                       3, 'restricted'),
    ('COMP 021', 'Software Engineering 1',                                   3, 'restricted'),
    ('COMP 022', 'Software Engineering 2',                                   3, 'restricted'),
    ('COMP 023', 'Social and Professional Issues in Computing',              3, 'restricted'),
    ('COSC 201', 'Logic Design and Digital Computer Circuits',               3, 'restricted'),
    ('COSC 202', 'Modeling and Simulation',                                  3, 'restricted'),
    ('COSC 203', 'Design and Analysis of Algorithms',                        3, 'restricted'),
    ('COSC 301', 'Computer Organization and Assembly Language',              3, 'restricted'),
    ('COSC 302', 'Automata and Language Theory',                             3, 'restricted'),
    ('COSC 303', 'Principles of Programming Languages',                      3, 'restricted'),
    ('COSC 304', 'Introduction to Artificial Intelligence',                  3, 'restricted'),
    ('COSC 305', 'CS Thesis Writing 1',                                      3, 'restricted'),
    ('COSC 306', 'Practicum (200 hours)',                                    3, 'restricted'),
    ('COSC 401', 'CS Thesis Writing 2',                                      3, 'restricted'),
    ('COSC 402', 'Current Trends and Topics in Computing',                   3, 'restricted'),
    ('MATH 017', 'Differential Calculus for Computer Science Students',      3, 'restricted'),
    ('ELEC CS-FE1', 'BSCS Free Elective 1',                                  3, 'restricted'),
    ('ELEC CS-FE2', 'BSCS Free Elective 2',                                  3, 'restricted'),
    ('ELEC CS-E1',  'BSCS Elective 1',                                       3, 'restricted'),
    ('ELEC CS-E2',  'BSCS Elective 2',                                       3, 'restricted'),
    ('ELEC CS-E3',  'BSCS Elective 3',                                       3, 'restricted'),
    ('ELEC CS-E4',  'BSCS Elective 4',                                       3, 'restricted');


-- ── Link restricted courses to BSCS ────────────────────────
INSERT INTO course_programs (course_id, program_id)
SELECT c.id, p.id
FROM courses c, programs p
WHERE c.visibility = 'restricted' AND p.code = 'BSCS';


-- ============================================================
-- BSCS Curriculum (year + semester placement)
-- ============================================================
WITH curr (course_code, year_level, semester, display_order) AS (VALUES
    -- Year 1, First Semester
    ('COMP 002',   1, '1', 1),
    ('GEED 032',   1, '1', 2),
    ('COMP 001',   1, '1', 3),
    ('GEED 004',   1, '1', 4),
    ('NSTP 001',   1, '1', 5),
    ('PATHFIT 1',  1, '1', 6),
    ('GEED 020',   1, '1', 7),
    ('GEED 005',   1, '1', 8),
    -- Year 1, Second Semester
    ('COMP 003',   1, '2', 1),
    ('MATH 017',   1, '2', 2),
    ('COMP 004',   1, '2', 3),
    ('NSTP 002',   1, '2', 4),
    ('GEED 033',   1, '2', 5),
    ('PATHFIT 2',  1, '2', 6),
    ('GEED 007',   1, '2', 7),
    ('GEED 001',   1, '2', 8),
    -- Year 2, First Semester
    ('ELEC CS-FE1', 2, '1', 1),
    ('COMP 006',    2, '1', 2),
    ('COMP 005',    2, '1', 3),
    ('GEED 008',    2, '1', 4),
    ('COSC 201',    2, '1', 5),
    ('COSC 202',    2, '1', 6),
    ('COMP 009',    2, '1', 7),
    ('PATHFIT 3',   2, '1', 8),
    -- Year 2, Second Semester
    ('ELEC CS-FE2', 2, '2', 1),
    ('COMP 008',    2, '2', 2),
    ('COSC 203',    2, '2', 3),
    ('COMP 010',    2, '2', 4),
    ('COMP 007',    2, '2', 5),
    ('GEED 010',    2, '2', 6),
    ('PATHFIT 4',   2, '2', 7),
    ('COMP 011',    2, '2', 8),
    -- Year 3, First Semester
    ('COMP 019',    3, '1', 1),
    ('COSC 302',    3, '1', 2),
    ('ELEC CS-E1',  3, '1', 3),
    ('COSC 301',    3, '1', 4),
    ('COMP 015',    3, '1', 5),
    ('COMP 013',    3, '1', 6),
    ('COSC 303',    3, '1', 7),
    -- Year 3, Second Semester
    ('GEED 006',    3, '2', 1),
    ('ELEC CS-E2',  3, '2', 2),
    ('COSC 305',    3, '2', 3),
    ('COMP 020',    3, '2', 4),
    ('COSC 304',    3, '2', 5),
    ('COMP 021',    3, '2', 6),
    ('COMP 016',    3, '2', 7),
    -- Year 3, Summer
    ('COSC 306',    3, 'summer', 1),
    -- Year 4, First Semester
    ('ELEC CS-E3',  4, '1', 1),
    ('COSC 401',    4, '1', 2),
    ('GEED 026',    4, '1', 3),
    ('GEED 002',    4, '1', 4),
    ('COMP 022',    4, '1', 5),
    ('GEED 003',    4, '1', 6),
    -- Year 4, Second Semester
    ('ELEC CS-E4',  4, '2', 1),
    ('COSC 402',    4, '2', 2),
    ('GEED 037',    4, '2', 3),
    ('COMP 023',    4, '2', 4)
)
INSERT INTO curriculum_courses (program_id, course_id, year_level, semester, display_order)
SELECT (SELECT id FROM programs WHERE code = 'BSCS'),
       c.id, cu.year_level, cu.semester::semester_type, cu.display_order
FROM curr cu
JOIN courses c ON c.code = cu.course_code;


-- ============================================================
-- BSCS Prerequisites
-- ============================================================
WITH prereqs (course_code, prereq_code) AS (VALUES
    -- Year 1, Sem 2
    ('COMP 003',  'COMP 002'),
    ('MATH 017',  'GEED 004'),
    ('COMP 004',  'GEED 004'),
    ('GEED 033',  'GEED 032'),
    ('PATHFIT 2', 'PATHFIT 1'),
    -- Year 2, Sem 1
    ('COMP 005',  'COMP 004'),
    ('COSC 201',  'COMP 001'),
    ('COMP 009',  'COMP 003'),
    ('PATHFIT 3', 'PATHFIT 2'),
    -- Year 2, Sem 2
    ('COMP 008',  'COSC 201'),
    ('COSC 203',  'COMP 006'),
    ('COMP 010',  'COMP 006'),
    ('COMP 007',  'COMP 001'),
    ('PATHFIT 4', 'PATHFIT 3'),
    -- Year 3, Sem 1
    ('COMP 019',  'COMP 009'),
    ('COSC 302',  'COMP 006'),
    ('COSC 301',  'COMP 002'),
    ('COSC 301',  'COSC 201'),
    ('COMP 015',  'COMP 011'),
    ('COMP 013',  'COMP 002'),
    ('COSC 303',  'COMP 006'),
    -- Year 3, Sem 2
    ('COSC 305',  'COMP 015'),
    ('COSC 304',  'COSC 302'),
    ('COMP 021',  'COMP 009'),
    ('COMP 021',  'COMP 010'),
    ('COMP 016',  'COMP 009'),
    ('COMP 016',  'COMP 010'),
    -- Year 3, Summer
    ('COSC 306',  'COMP 008'),
    ('COSC 306',  'COMP 009'),
    ('COSC 306',  'COMP 010'),
    ('COSC 306',  'COMP 021'),
    -- Year 4, Sem 1
    ('COSC 401',  'COSC 305'),
    ('COMP 022',  'COMP 021')
)
INSERT INTO course_prerequisites (course_id, prerequisite_id)
SELECT c.id, p.id
FROM prereqs pr
JOIN courses c ON c.code = pr.course_code
JOIN courses p ON p.code = pr.prereq_code;
