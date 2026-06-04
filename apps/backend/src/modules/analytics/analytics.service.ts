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

// ─── Section fill rates ─────────────────────────────────────────────────────

interface SectionFillRow {
  sectionId:   string;
  sectionCode: string;
  courseCode:  string;
  courseTitle: string;
  units:       number;
  blockLabel:  string;
  programCode: string;
  facultyName: string | null;
  capacity:    number;
  enrolled:    number;
  fillPct:     number;                          // enrolled / capacity * 100
  status:      'over' | 'full' | 'normal' | 'under' | 'empty';
}
interface SectionFillResult {
  term: { id: string; name: string; semester: string } | null;
  sections: SectionFillRow[];
  /** Distribution histogram — 5 buckets of 20% width plus a >100% overflow bin. */
  histogram: { label: string; min: number; max: number; count: number }[];
  summary: {
    sectionsTotal:  number;
    totalCapacity:  number;
    totalEnrolled:  number;
    avgFillPct:     number;
    overCount:      number;
    fullCount:      number;
    normalCount:    number;
    underCount:     number;
    emptyCount:     number;
    /** Threshold below which a section is flagged as under-enrolled (50%). */
    underThreshold: number;
  };
}

const UNDER_THRESHOLD = 50;
const FULL_THRESHOLD  = 90;

/**
 * Section fill rates for a term. Lets the registrar spot under-enrolled
 * offerings (candidates for consolidation) and over-cap sections (candidates
 * for a second section). The histogram surfaces the distribution shape at a
 * glance — a healthy term should be heavy on the 80-100% bucket; a long tail
 * on the left signals sections to merge.
 */
export async function getSectionFill(opts: { termId?: string }): Promise<SectionFillResult> {
  // Resolve term, same convention as faculty-load.
  let term: SectionFillResult['term'] = null;
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

  if (!term) {
    return {
      term: null, sections: [], histogram: emptyHistogram(),
      summary: {
        sectionsTotal: 0, totalCapacity: 0, totalEnrolled: 0, avgFillPct: 0,
        overCount: 0, fullCount: 0, normalCount: 0, underCount: 0, emptyCount: 0,
        underThreshold: UNDER_THRESHOLD,
      },
    };
  }

  // Pull every section in the term + enrolled count via aggregate join.
  const { rows } = await db.query(
    `SELECT s.id              AS section_id,
            s.section_code,
            s.capacity,
            c.code             AS course_code,
            c.title            AS course_title,
            c.units,
            p.code             AS program_code,
            p.code || ' ' || b.year_level || '-' || b.block_number AS block_label,
            f.full_name        AS faculty_name,
            COUNT(e.id) FILTER (WHERE e.status = 'enrolled')::int   AS enrolled
     FROM sections s
     JOIN courses    c ON c.id = s.course_id
     JOIN blocks     b ON b.id = s.block_id
     JOIN programs   p ON p.id = b.program_id
     LEFT JOIN users f ON f.id = s.faculty_id
     LEFT JOIN enrollments e ON e.section_id = s.id
     WHERE s.term_id = $1
     GROUP BY s.id, c.code, c.title, c.units, p.code, b.year_level, b.block_number, f.full_name`,
    [term.id],
  );

  const sections: SectionFillRow[] = rows.map((r: any) => {
    const capacity = Number(r.capacity) || 0;
    const enrolled = Number(r.enrolled) || 0;
    const fillPct  = capacity === 0 ? 0 : Math.round((enrolled / capacity) * 1000) / 10;
    return {
      sectionId:   r.section_id,
      sectionCode: r.section_code,
      courseCode:  r.course_code,
      courseTitle: r.course_title,
      units:       Number(r.units),
      blockLabel:  r.block_label,
      programCode: r.program_code,
      facultyName: r.faculty_name,
      capacity, enrolled, fillPct,
      status: statusFor(fillPct, enrolled),
    };
  }).sort((a: SectionFillRow, b: SectionFillRow) => b.fillPct - a.fillPct);

  // 5 buckets × 20% + an over-cap overflow.
  const histogram = emptyHistogram();
  for (const s of sections) {
    const bucket = histogram.find(h => s.fillPct >= h.min && s.fillPct < h.max)
                ?? histogram[histogram.length - 1];     // >100% falls into the overflow
    bucket.count++;
  }

  const summary = sections.reduce(
    (acc, s) => {
      acc.totalCapacity += s.capacity;
      acc.totalEnrolled += s.enrolled;
      if (s.status === 'over')   acc.overCount++;
      if (s.status === 'full')   acc.fullCount++;
      if (s.status === 'normal') acc.normalCount++;
      if (s.status === 'under')  acc.underCount++;
      if (s.status === 'empty')  acc.emptyCount++;
      return acc;
    },
    {
      sectionsTotal: sections.length,
      totalCapacity: 0, totalEnrolled: 0, avgFillPct: 0,
      overCount: 0, fullCount: 0, normalCount: 0, underCount: 0, emptyCount: 0,
      underThreshold: UNDER_THRESHOLD,
    },
  );
  summary.avgFillPct = summary.totalCapacity === 0
    ? 0
    : Math.round((summary.totalEnrolled / summary.totalCapacity) * 1000) / 10;

  return { term, sections, histogram, summary };
}

function statusFor(pct: number, enrolled: number): SectionFillRow['status'] {
  if (enrolled === 0)            return 'empty';
  if (pct > 100)                 return 'over';
  if (pct >= FULL_THRESHOLD)     return 'full';
  if (pct < UNDER_THRESHOLD)     return 'under';
  return 'normal';
}

function emptyHistogram() {
  return [
    { label: '0–20%',   min:   0, max:  20, count: 0 },
    { label: '20–40%',  min:  20, max:  40, count: 0 },
    { label: '40–60%',  min:  40, max:  60, count: 0 },
    { label: '60–80%',  min:  60, max:  80, count: 0 },
    { label: '80–100%', min:  80, max: 101, count: 0 },     // inclusive of 100
    { label: '>100%',   min: 101, max: Infinity, count: 0 },
  ];
}

// ─── GWA stats per cohort / per term ────────────────────────────────────────

interface GwaGroupRow {
  groupKey:   string;          // cohort year ('2024') or term id (uuid)
  groupLabel: string;          // display label
  /** Sort key for the X axis. For cohorts: the year. For terms: start_date. */
  sortKey:    string;
  studentsCount:  number;
  avgGwa:         number | null;        // simple mean of student GWAs
  bestGwa:        number | null;        // min (PH scale: lower is better)
  worstGwa:       number | null;        // max
  /** Standing distribution (counts of students). */
  presidents:     number;               // ≤ 1.25
  deans:          number;               // ≤ 1.50
  good:           number;               // ≤ 2.50
  warning:        number;               // ≤ 3.00
  failing:        number;               // > 3.00
}
interface GwaStatsResult {
  groupBy: 'cohort' | 'term';
  program: { id: string; code: string; name: string } | null;
  groups:  GwaGroupRow[];
  summary: {
    studentsTracked:   number;
    overallAvg:        number | null;
    bestGroup:         { label: string; avgGwa: number } | null;
    worstGroup:        { label: string; avgGwa: number } | null;
    groupCount:        number;
  };
}

/**
 * Average GWA per program × (cohort | term).
 *
 * GWA per student is the units-weighted mean of their finalized letter
 * grades. We treat every row with a non-null letter_grade as finalized — PH
 * letter grades are numeric strings ('1.00' … '5.00') so the math is direct.
 *
 * Per-group "average" is the **simple mean of student GWAs** rather than a
 * unit-weighted enrollment-level mean. This matches how registrars talk about
 * cohort strength ("the 2024 batch GWA is 1.85") — each student gets equal
 * weight even if some carried heavier loads.
 *
 * Standing buckets mirror the rest of the app (see Student Dashboard's
 * `describeGWA` helper).
 */
export async function getGwaStats(opts: {
  programId?: string;
  groupBy:    'cohort' | 'term';
}): Promise<GwaStatsResult> {
  // Resolve program meta for the response header.
  let program: GwaStatsResult['program'] = null;
  if (opts.programId) {
    const { rows } = await db.query(
      `SELECT id, code, name FROM programs WHERE id = $1`,
      [opts.programId],
    );
    program = rows[0] ?? null;
  }

  if (opts.groupBy === 'cohort') {
    // For each (student, cohort year), compute their overall units-weighted
    // GWA across all finalized enrollments. Then bucket by cohort year and
    // mean those.
    const { rows } = await db.query(
      `WITH per_student AS (
         SELECT u.id                                          AS student_id,
                SUBSTRING(u.user_code FROM 1 FOR 4)           AS cohort_year,
                SUM(e.letter_grade::numeric * COALESCE(c.units, 3))
                  / NULLIF(SUM(COALESCE(c.units, 3)), 0)      AS gwa
         FROM users u
         JOIN enrollments e ON e.student_id = u.id
         JOIN sections    s ON s.id = e.section_id
         JOIN courses     c ON c.id = s.course_id
         WHERE u.role = 'student'
           AND u.user_code ~ '^[0-9]{4}-'
           AND e.letter_grade IS NOT NULL
           AND ($1::uuid IS NULL OR u.program_id = $1)
         GROUP BY u.id, cohort_year
       )
       SELECT cohort_year                                     AS group_key,
              COUNT(*)::int                                   AS students_count,
              ROUND(AVG(gwa)::numeric, 3)                     AS avg_gwa,
              ROUND(MIN(gwa)::numeric, 3)                     AS best_gwa,
              ROUND(MAX(gwa)::numeric, 3)                     AS worst_gwa,
              COUNT(*) FILTER (WHERE gwa <= 1.25)::int        AS presidents,
              COUNT(*) FILTER (WHERE gwa >  1.25 AND gwa <= 1.50)::int AS deans,
              COUNT(*) FILTER (WHERE gwa >  1.50 AND gwa <= 2.50)::int AS good,
              COUNT(*) FILTER (WHERE gwa >  2.50 AND gwa <= 3.00)::int AS warning,
              COUNT(*) FILTER (WHERE gwa >  3.00)::int        AS failing
       FROM per_student
       GROUP BY cohort_year
       ORDER BY cohort_year`,
      [opts.programId ?? null],
    );
    return finalize(rows.map((r: any) => ({
      groupKey:      r.group_key,
      groupLabel:    r.group_key,
      sortKey:       r.group_key,
      studentsCount: r.students_count,
      avgGwa:        r.avg_gwa  != null ? Number(r.avg_gwa)  : null,
      bestGwa:       r.best_gwa != null ? Number(r.best_gwa) : null,
      worstGwa:      r.worst_gwa!= null ? Number(r.worst_gwa): null,
      presidents:    r.presidents, deans: r.deans, good: r.good,
      warning:       r.warning, failing: r.failing,
    })), 'cohort', program);
  }

  // groupBy === 'term'
  // For each (student, term), compute term GWA, then average across students
  // per term. Terms with no graded enrollments are excluded.
  const { rows } = await db.query(
    `WITH per_student_term AS (
       SELECT t.id   AS term_id,
              t.name AS term_name,
              t.start_date,
              t.semester,
              u.id   AS student_id,
              SUM(e.letter_grade::numeric * COALESCE(c.units, 3))
                / NULLIF(SUM(COALESCE(c.units, 3)), 0) AS gwa
       FROM enrollments e
       JOIN sections s ON s.id = e.section_id
       JOIN terms    t ON t.id = s.term_id
       JOIN courses  c ON c.id = s.course_id
       JOIN users    u ON u.id = e.student_id
       WHERE u.role = 'student'
         AND e.letter_grade IS NOT NULL
         AND ($1::uuid IS NULL OR u.program_id = $1)
       GROUP BY t.id, t.name, t.start_date, t.semester, u.id
     )
     SELECT term_id                                          AS group_key,
            term_name                                        AS group_label,
            start_date::text                                  AS sort_key,
            COUNT(*)::int                                    AS students_count,
            ROUND(AVG(gwa)::numeric, 3)                      AS avg_gwa,
            ROUND(MIN(gwa)::numeric, 3)                      AS best_gwa,
            ROUND(MAX(gwa)::numeric, 3)                      AS worst_gwa,
            COUNT(*) FILTER (WHERE gwa <= 1.25)::int         AS presidents,
            COUNT(*) FILTER (WHERE gwa >  1.25 AND gwa <= 1.50)::int AS deans,
            COUNT(*) FILTER (WHERE gwa >  1.50 AND gwa <= 2.50)::int AS good,
            COUNT(*) FILTER (WHERE gwa >  2.50 AND gwa <= 3.00)::int AS warning,
            COUNT(*) FILTER (WHERE gwa >  3.00)::int         AS failing
     FROM per_student_term
     GROUP BY term_id, term_name, start_date, semester
     ORDER BY start_date`,
    [opts.programId ?? null],
  );
  return finalize(rows.map((r: any) => ({
    groupKey:      r.group_key,
    groupLabel:    r.group_label,
    sortKey:       r.sort_key,
    studentsCount: r.students_count,
    avgGwa:        r.avg_gwa  != null ? Number(r.avg_gwa)  : null,
    bestGwa:       r.best_gwa != null ? Number(r.best_gwa) : null,
    worstGwa:      r.worst_gwa!= null ? Number(r.worst_gwa): null,
    presidents:    r.presidents, deans: r.deans, good: r.good,
    warning:       r.warning, failing: r.failing,
  })), 'term', program);
}

function finalize(
  groups: GwaGroupRow[],
  groupBy: 'cohort' | 'term',
  program: GwaStatsResult['program'],
): GwaStatsResult {
  const studentsTracked = groups.reduce((s, g) => s + g.studentsCount, 0);
  const withGwa = groups.filter(g => g.avgGwa != null);
  const overallAvg = withGwa.length === 0
    ? null
    : Math.round((withGwa.reduce((s, g) => s + g.avgGwa!, 0) / withGwa.length) * 1000) / 1000;

  // PH scale: lower is better, so "best group" = MIN avg.
  let bestGroup: { label: string; avgGwa: number } | null = null;
  let worstGroup: { label: string; avgGwa: number } | null = null;
  for (const g of withGwa) {
    if (!bestGroup  || g.avgGwa! < bestGroup.avgGwa)  bestGroup  = { label: g.groupLabel, avgGwa: g.avgGwa! };
    if (!worstGroup || g.avgGwa! > worstGroup.avgGwa) worstGroup = { label: g.groupLabel, avgGwa: g.avgGwa! };
  }

  return {
    groupBy,
    program,
    groups,
    summary: {
      studentsTracked,
      overallAvg,
      bestGroup,
      worstGroup,
      groupCount: groups.length,
    },
  };
}
