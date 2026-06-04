import { db } from '../../config/db';
import { parseDays } from '../sections/sections.service';

/** Default overload threshold when a faculty member has no personal cap set. */
const DEFAULT_OVERLOAD_UNITS = 24;
/** Anything below this is "underloaded" — surfaces idle faculty as a warning. */
const UNDERLOAD_UNITS = 12;

/**
 * Cohort retention.
 *
 * A "cohort" is the set of students who entered in the same academic year, as
 * determined by the first four characters of their `user_code` (which the
 * system stamps at creation — `2026-00001-MN-0`). For each cohort + program
 * combo we report:
 *   • total      — anyone with that cohort code in the program
 *   • active     — is_active = TRUE and not graduated
 *   • graduated  — graduated_at IS NOT NULL
 *   • inactive   — is_active = FALSE and not graduated (dropped / withdrew)
 *
 * Limitations (mirrors the v1 scope in FUTURE_FEATURES.md):
 *   • We don't have an explicit "transferred" marker, so transferees are
 *     bucketed by their assigned cohort year like everyone else.
 *   • Year-leveled-up students stay under their original cohort year — that's
 *     the entire point of this view.
 */

interface CohortRow {
  cohortYear: string;
  total:      number;
  active:     number;
  graduated:  number;
  inactive:   number;
  retention:  number;             // (active + graduated) / total, 0-100
}

interface RetentionResult {
  cohorts: CohortRow[];
  summary: {
    totalStudents:     number;
    activeStudents:    number;
    graduatedStudents: number;
    inactiveStudents:  number;
    overallRetention:  number;
    cohortsCovered:    number;
  };
  program: { id: string; code: string; name: string } | null;
}

export async function getRetention(opts: { programId?: string }): Promise<RetentionResult> {
  // Resolve program meta for the response header (so the UI can show it
  // without an extra round-trip).
  let program: RetentionResult['program'] = null;
  if (opts.programId) {
    const { rows } = await db.query(
      `SELECT id, code, name FROM programs WHERE id = $1`,
      [opts.programId],
    );
    program = rows[0] ?? null;
  }

  // Bucket students by cohort year (first 4 chars of user_code). The regex
  // guard skips legacy or imported rows without the canonical code shape.
  const { rows } = await db.query(
    `SELECT SUBSTRING(u.user_code FROM 1 FOR 4) AS cohort_year,
            COUNT(*)::int                                                                  AS total,
            COUNT(*) FILTER (WHERE u.is_active = TRUE  AND u.graduated_at IS NULL)::int   AS active,
            COUNT(*) FILTER (WHERE u.graduated_at IS NOT NULL)::int                       AS graduated,
            COUNT(*) FILTER (WHERE u.is_active = FALSE AND u.graduated_at IS NULL)::int   AS inactive
     FROM users u
     WHERE u.role = 'student'
       AND u.user_code ~ '^[0-9]{4}-'
       AND ($1::uuid IS NULL OR u.program_id = $1)
     GROUP BY cohort_year
     ORDER BY cohort_year DESC`,
    [opts.programId ?? null],
  );

  const cohorts: CohortRow[] = rows.map((r: {
    cohort_year: string; total: number; active: number; graduated: number; inactive: number;
  }) => ({
    cohortYear: r.cohort_year,
    total:      r.total,
    active:     r.active,
    graduated:  r.graduated,
    inactive:   r.inactive,
    retention:  r.total === 0 ? 0 : Math.round(((r.active + r.graduated) / r.total) * 1000) / 10,
  }));

  // Roll up to a single summary block — totals across every cohort returned.
  const summary = cohorts.reduce(
    (acc, c) => {
      acc.totalStudents     += c.total;
      acc.activeStudents    += c.active;
      acc.graduatedStudents += c.graduated;
      acc.inactiveStudents  += c.inactive;
      return acc;
    },
    { totalStudents: 0, activeStudents: 0, graduatedStudents: 0, inactiveStudents: 0,
      overallRetention: 0, cohortsCovered: cohorts.length },
  );
  summary.overallRetention = summary.totalStudents === 0
    ? 0
    : Math.round(((summary.activeStudents + summary.graduatedStudents) / summary.totalStudents) * 1000) / 10;

  return { cohorts, summary, program };
}

// ─── Faculty teaching load ───────────────────────────────────────────────────

interface SectionForLoad {
  sectionId:   string;
  sectionCode: string;
  courseCode:  string;
  courseTitle: string;
  units:       number;
  dayOfWeek:   string | null;
  startTime:   string | null;
  endTime:     string | null;
  room:        string | null;
  hoursPerWeek: number;
}
interface FacultyLoadRow {
  facultyId:        string;
  fullName:         string;
  userCode:         string | null;
  email:            string;
  maxTeachingUnits: number | null;
  sectionCount:     number;
  totalUnits:       number;
  hoursPerWeek:     number;
  utilization:      number;                          // pct of effective cap (0-200)
  status:           'overload' | 'normal' | 'underload' | 'idle';
  sections:         SectionForLoad[];
}
interface FacultyLoadResult {
  term: { id: string; name: string; semester: string } | null;
  faculty: FacultyLoadRow[];
  summary: {
    facultyTotal:     number;
    overloadedCount:  number;
    underloadedCount: number;
    idleCount:        number;
    totalUnits:       number;
    totalHours:       number;
    avgUnits:         number;
    overloadThreshold: number;
  };
}

/**
 * Per-faculty teaching load for a term.
 *
 * Strategy:
 *   1. Resolve the target term (URL param → active term → 404).
 *   2. Fetch every active faculty with a LEFT JOIN onto their sections in this
 *      term so idle faculty show up in the report (an idle Year-3 specialist
 *      mid-semester is often the most actionable signal).
 *   3. For each section, compute hours/week by parsing `day_of_week` and
 *      multiplying the day count by the session duration. We rely on the
 *      existing `parseDays` helper from sections.service so the logic stays
 *      consistent with the auto-assigner.
 *   4. Compare load against `users.max_teaching_units` (the per-faculty cap
 *      set on the My Subjects page) or the system default of 24.
 */
export async function getFacultyLoad(opts: { termId?: string }): Promise<FacultyLoadResult> {
  // 1) Resolve term
  let term: FacultyLoadResult['term'] = null;
  if (opts.termId) {
    const { rows } = await db.query(
      `SELECT id, name, semester FROM terms WHERE id = $1`,
      [opts.termId],
    );
    term = rows[0] ?? null;
    if (!term) throw Object.assign(new Error('Term not found'), { status: 404 });
  } else {
    const { rows } = await db.query(
      `SELECT id, name, semester FROM terms WHERE is_active = TRUE ORDER BY start_date DESC LIMIT 1`,
    );
    term = rows[0] ?? null;
  }

  // 2) Pull faculty + their sections (LEFT JOIN keeps idle faculty visible)
  const { rows } = await db.query(
    `SELECT u.id              AS faculty_id,
            u.full_name,
            u.user_code,
            u.email,
            u.max_teaching_units,
            s.id              AS section_id,
            s.section_code,
            s.day_of_week,
            s.start_time::text AS start_time,
            s.end_time::text   AS end_time,
            s.room,
            c.code             AS course_code,
            c.title            AS course_title,
            c.units
     FROM users u
     LEFT JOIN sections s ON s.faculty_id = u.id AND s.term_id = $1
     LEFT JOIN courses  c ON c.id = s.course_id
     WHERE u.role = 'faculty' AND u.is_active = TRUE
     ORDER BY u.full_name, s.section_code`,
    [term?.id ?? null],
  );

  // 3) Roll up by faculty
  const byFaculty = new Map<string, FacultyLoadRow>();
  for (const r of rows as any[]) {
    let row = byFaculty.get(r.faculty_id);
    if (!row) {
      row = {
        facultyId:        r.faculty_id,
        fullName:         r.full_name,
        userCode:         r.user_code,
        email:            r.email,
        maxTeachingUnits: r.max_teaching_units,
        sectionCount:     0,
        totalUnits:       0,
        hoursPerWeek:     0,
        utilization:      0,
        status:           'idle',
        sections:         [],
      };
      byFaculty.set(r.faculty_id, row);
    }
    if (r.section_id) {
      const units    = Number(r.units || 0);
      const hours    = computeHoursPerWeek(r.day_of_week, r.start_time, r.end_time);
      row.sections.push({
        sectionId:    r.section_id,
        sectionCode:  r.section_code,
        courseCode:   r.course_code,
        courseTitle:  r.course_title,
        units,
        dayOfWeek:    r.day_of_week,
        startTime:    r.start_time,
        endTime:      r.end_time,
        room:         r.room,
        hoursPerWeek: hours,
      });
      row.sectionCount++;
      row.totalUnits   += units;
      row.hoursPerWeek += hours;
    }
  }

  // 4) Status + utilization
  for (const row of byFaculty.values()) {
    const cap = row.maxTeachingUnits ?? DEFAULT_OVERLOAD_UNITS;
    row.utilization = cap > 0 ? Math.round((row.totalUnits / cap) * 1000) / 10 : 0;
    if (row.sectionCount === 0)           row.status = 'idle';
    else if (row.totalUnits > cap)        row.status = 'overload';
    else if (row.totalUnits < UNDERLOAD_UNITS) row.status = 'underload';
    else                                  row.status = 'normal';
  }

  const faculty = [...byFaculty.values()].sort((a, b) => b.totalUnits - a.totalUnits);

  const summary = faculty.reduce(
    (acc, r) => {
      acc.totalUnits  += r.totalUnits;
      acc.totalHours  += r.hoursPerWeek;
      if (r.status === 'overload')   acc.overloadedCount++;
      if (r.status === 'underload')  acc.underloadedCount++;
      if (r.status === 'idle')       acc.idleCount++;
      return acc;
    },
    {
      facultyTotal:     faculty.length,
      overloadedCount:  0,
      underloadedCount: 0,
      idleCount:        0,
      totalUnits:       0,
      totalHours:       0,
      avgUnits:         0,
      overloadThreshold: DEFAULT_OVERLOAD_UNITS,
    },
  );
  summary.avgUnits   = faculty.length === 0 ? 0 : Math.round((summary.totalUnits / faculty.length) * 10) / 10;
  summary.totalHours = Math.round(summary.totalHours * 10) / 10;

  return { term, faculty, summary };
}

/**
 * Sum of (day-count × session length) for a section. Returns 0 if any field
 * is missing or malformed so partial schedules don't pollute the total.
 */
function computeHoursPerWeek(dayOfWeek: string | null, startTime: string | null, endTime: string | null): number {
  if (!dayOfWeek || !startTime || !endTime) return 0;
  const days = parseDays(dayOfWeek).length;
  if (days === 0) return 0;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const minutes = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
  if (minutes <= 0) return 0;
  return Math.round((days * minutes / 60) * 10) / 10;
}
