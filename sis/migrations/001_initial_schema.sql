-- ============================================================
-- SIS Initial Schema — run this in Supabase SQL Editor
-- Use the DIRECT connection (port 5432) for migrations
-- ============================================================

-- ============ ENUM TYPES ============
CREATE TYPE user_role     AS ENUM ('admin', 'faculty', 'student');
CREATE TYPE enroll_status AS ENUM ('enrolled', 'dropped', 'completed');

-- ============ IDENTITY & RBAC ============
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name     TEXT NOT NULL,
    role          user_role NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ CURRICULUM ============
CREATE TABLE programs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    total_units INT  NOT NULL CHECK (total_units > 0)
);

CREATE TABLE courses (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code       TEXT NOT NULL UNIQUE,
    title      TEXT NOT NULL,
    units      INT  NOT NULL CHECK (units > 0),
    program_id UUID REFERENCES programs(id) ON DELETE SET NULL
);

-- Self-referencing prerequisite graph
CREATE TABLE course_prerequisites (
    course_id        UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    prerequisite_id  UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    PRIMARY KEY (course_id, prerequisite_id),
    CHECK (course_id <> prerequisite_id)
);

-- ============ TERMS & SECTIONS ============
CREATE TABLE terms (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date   DATE NOT NULL,
    is_active  BOOLEAN NOT NULL DEFAULT FALSE,
    CHECK (end_date > start_date)
);

CREATE TABLE sections (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id    UUID NOT NULL REFERENCES courses(id),
    term_id      UUID NOT NULL REFERENCES terms(id),
    faculty_id   UUID NOT NULL REFERENCES users(id),
    section_code TEXT NOT NULL,
    day_of_week  TEXT,
    start_time   TIME,
    end_time     TIME,
    room         TEXT,
    capacity     INT NOT NULL CHECK (capacity > 0),
    UNIQUE (term_id, section_code),
    CHECK (end_time IS NULL OR start_time IS NULL OR end_time > start_time)
);

-- ============ ENROLLMENT ============
CREATE TABLE enrollments (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id  UUID NOT NULL REFERENCES users(id),
    section_id  UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    status      enroll_status NOT NULL DEFAULT 'enrolled',
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (student_id, section_id)
);

-- ============ GRADEBOOK ============
CREATE TABLE assessment_categories (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id    UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    weight        NUMERIC(5,2) NOT NULL CHECK (weight >= 0 AND weight <= 100),
    display_order INT NOT NULL DEFAULT 0,
    UNIQUE (section_id, name)
);

CREATE TABLE assessments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id   UUID NOT NULL REFERENCES assessment_categories(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    max_score     NUMERIC(7,2) NOT NULL CHECK (max_score > 0),
    display_order INT NOT NULL DEFAULT 0
);

CREATE TABLE scores (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    score         NUMERIC(7,2) CHECK (score >= 0),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by    UUID REFERENCES users(id),
    UNIQUE (assessment_id, enrollment_id)
);

-- ============ AUDIT ============
CREATE TABLE audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID REFERENCES users(id),
    action      TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id   UUID,
    old_value   JSONB,
    new_value   JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ INDEXES ============
CREATE INDEX idx_scores_enrollment      ON scores(enrollment_id);
CREATE INDEX idx_assessments_category   ON assessments(category_id);
CREATE INDEX idx_enrollments_section    ON enrollments(section_id);
CREATE INDEX idx_categories_section     ON assessment_categories(section_id);
CREATE INDEX idx_sections_faculty       ON sections(faculty_id);
CREATE INDEX idx_sections_term          ON sections(term_id);

-- ============ WEIGHT-SUM TRIGGER ============
CREATE OR REPLACE FUNCTION check_category_weights()
RETURNS TRIGGER AS $$
DECLARE
    total NUMERIC;
    sid   UUID := COALESCE(NEW.section_id, OLD.section_id);
BEGIN
    SELECT COALESCE(SUM(weight), 0) INTO total
    FROM assessment_categories WHERE section_id = sid;

    IF total > 100 THEN
        RAISE EXCEPTION 'Category weights for section % exceed 100%% (got %)', sid, total;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_category_weights
AFTER INSERT OR UPDATE OR DELETE ON assessment_categories
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION check_category_weights();

-- ============ SEED: default admin user ============
-- Password: Admin@1234  (change immediately after first login)
-- Generated with bcrypt rounds=12
INSERT INTO users (email, password_hash, full_name, role)
VALUES (
    'admin@sis.local',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBdkGLQyj4EQKC',
    'System Administrator',
    'admin'
);
