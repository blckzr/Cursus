-- ============================================================
-- 017_section_meetings.sql  (FUTURE_FEATURES 2.6 — Multi-meeting section schedule)
--
-- Promotes the section schedule from a single
--   (day_of_week TEXT, start_time TIME, end_time TIME)
-- triple on `sections` to a `section_meetings` child table that can
-- hold 1 or 2 meetings per week with independent times.
--
-- Constraints (Universidad Mariana policy):
--   • At most 2 meetings per section.
--   • If both meetings share a day, they must be back-to-back —
--     no gap between them.
--   • day_of_week is one of Mon/Tue/Wed/Thu/Fri/Sat/Sun.
--   • Curriculum drives meeting count via curriculum_courses.meetings_per_week.
--
-- Backfill from existing rows:
--   • Single-day patterns ('Mon', 'Sat', 'Sun')                    → 1 meeting.
--   • 2-day patterns ('MTh', 'TF', 'MW', 'TTh', 'WSat', ...)       → 2 meetings.
--   • 3+ day patterns ('MWF', 'TThSat', ...)                       → flagged into
--     `migration_backfill_problems`; section schedule wiped to TBA.
-- ============================================================

-- ── A. curriculum_courses.meetings_per_week ─────────────────
ALTER TABLE curriculum_courses
  ADD COLUMN IF NOT EXISTS meetings_per_week INT NOT NULL DEFAULT 2
  CHECK (meetings_per_week IN (1, 2));

-- ── B. section_meetings ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS section_meetings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id  UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL
              CHECK (day_of_week IN ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS idx_section_meetings_section ON section_meetings(section_id);
CREATE INDEX IF NOT EXISTS idx_section_meetings_day     ON section_meetings(day_of_week);

-- ── C. Cap trigger: 1-or-2 meetings; same-day pair must be back-to-back ─────
CREATE OR REPLACE FUNCTION check_section_meeting_rules() RETURNS TRIGGER AS $$
DECLARE
  v_section_id UUID;
  v_count      INT;
  v_rec        RECORD;
  v_first      RECORD;
  v_second     RECORD;
BEGIN
  v_section_id := COALESCE(NEW.section_id, OLD.section_id);

  SELECT count(*) INTO v_count FROM section_meetings WHERE section_id = v_section_id;
  IF v_count > 2 THEN
    RAISE EXCEPTION 'A section can have at most 2 meetings per week (section_id=%)', v_section_id;
  END IF;

  -- If both meetings share a day, the earlier one's end_time must equal
  -- the later one's start_time (no gap, no overlap).
  IF v_count = 2 THEN
    SELECT day_of_week, start_time, end_time INTO v_first
      FROM section_meetings WHERE section_id = v_section_id ORDER BY start_time LIMIT 1;
    SELECT day_of_week, start_time, end_time INTO v_second
      FROM section_meetings WHERE section_id = v_section_id ORDER BY start_time OFFSET 1 LIMIT 1;

    IF v_first.day_of_week = v_second.day_of_week THEN
      IF v_first.end_time <> v_second.start_time THEN
        RAISE EXCEPTION
          'Same-day meetings must be back-to-back (no gap) for section %: % %–% then %–%',
          v_section_id,
          v_first.day_of_week, v_first.start_time, v_first.end_time,
          v_second.start_time, v_second.end_time;
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_section_meeting_rules ON section_meetings;
CREATE CONSTRAINT TRIGGER trg_section_meeting_rules
  AFTER INSERT OR UPDATE OR DELETE ON section_meetings
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION check_section_meeting_rules();

-- ── D. Problem log for backfill ─────────────────────────────
CREATE TABLE IF NOT EXISTS migration_backfill_problems (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration   TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   UUID NOT NULL,
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── E. Backfill from legacy columns ─────────────────────────
DO $$
DECLARE
  s          RECORD;
  rest       TEXT;
  days       TEXT[];
  d          TEXT;
  ok_count   INT := 0;
  flag_count INT := 0;
BEGIN
  FOR s IN
    SELECT id, day_of_week, start_time, end_time
      FROM sections
     WHERE day_of_week IS NOT NULL
       AND start_time  IS NOT NULL
       AND end_time    IS NOT NULL
  LOOP
    rest := REPLACE(s.day_of_week, ' ', '');
    days := ARRAY[]::TEXT[];

    -- Multi-char tokens first so 'Th' doesn't consume the T from TF.
    WHILE rest ~* 'sun' LOOP
      days := array_append(days, 'Sun');
      rest := regexp_replace(rest, 'sun', '', 'i');
    END LOOP;
    WHILE rest ~* 'sat' LOOP
      days := array_append(days, 'Sat');
      rest := regexp_replace(rest, 'sat', '', 'i');
    END LOOP;
    WHILE rest ~* 'th' LOOP
      days := array_append(days, 'Thu');
      rest := regexp_replace(rest, 'th', '', 'i');
    END LOOP;
    -- Singles
    FOREACH d IN ARRAY string_to_array(upper(rest), NULL) LOOP
      IF d = 'M' THEN days := array_append(days, 'Mon');
      ELSIF d = 'T' THEN days := array_append(days, 'Tue');
      ELSIF d = 'W' THEN days := array_append(days, 'Wed');
      ELSIF d = 'F' THEN days := array_append(days, 'Fri');
      END IF;
    END LOOP;

    -- Deduplicate, preserve order
    days := ARRAY(SELECT DISTINCT unnest(days));

    IF array_length(days, 1) IS NULL OR array_length(days, 1) = 0 THEN
      -- Couldn't parse anything — flag.
      INSERT INTO migration_backfill_problems (migration, entity_type, entity_id, detail)
        VALUES ('017_section_meetings', 'sections', s.id,
                jsonb_build_object('reason','unparseable_days','raw',s.day_of_week));
      flag_count := flag_count + 1;
      CONTINUE;
    END IF;

    IF array_length(days, 1) > 2 THEN
      -- 3+ day pattern violates the cap.
      INSERT INTO migration_backfill_problems (migration, entity_type, entity_id, detail)
        VALUES ('017_section_meetings', 'sections', s.id,
                jsonb_build_object(
                  'reason','too_many_days','raw',s.day_of_week,
                  'parsed_days', to_jsonb(days),
                  'start_time', s.start_time::text, 'end_time', s.end_time::text));
      flag_count := flag_count + 1;
      CONTINUE;
    END IF;

    -- 1 or 2 days — backfill one row each, same times for both.
    FOREACH d IN ARRAY days LOOP
      INSERT INTO section_meetings (section_id, day_of_week, start_time, end_time)
        VALUES (s.id, d, s.start_time, s.end_time);
    END LOOP;
    ok_count := ok_count + 1;
  END LOOP;

  RAISE NOTICE '[017_section_meetings] backfill complete: % sections OK, % sections flagged',
    ok_count, flag_count;
END $$;

-- ── F. Drop legacy columns ──────────────────────────────────
-- `section_meetings` is now the only source of truth for schedules.
--
-- `sections_full_v` (migration 016) references the legacy columns, so we drop
-- the view first, drop the columns from both `sections` and `sections_archive`
-- (which inherited them via LIKE), and rebuild the view without them.

DROP VIEW IF EXISTS sections_full_v;

ALTER TABLE sections         DROP COLUMN IF EXISTS day_of_week;
ALTER TABLE sections         DROP COLUMN IF EXISTS start_time;
ALTER TABLE sections         DROP COLUMN IF EXISTS end_time;
ALTER TABLE sections_archive DROP COLUMN IF EXISTS day_of_week;
ALTER TABLE sections_archive DROP COLUMN IF EXISTS start_time;
ALTER TABLE sections_archive DROP COLUMN IF EXISTS end_time;

CREATE VIEW sections_full_v AS
  SELECT id, block_id, course_id, term_id, faculty_id, section_code,
         room, capacity, created_at,
         FALSE AS is_archived
    FROM sections
  UNION ALL
  SELECT id, block_id, course_id, term_id, faculty_id, section_code,
         room, capacity, created_at,
         TRUE  AS is_archived
    FROM sections_archive;
