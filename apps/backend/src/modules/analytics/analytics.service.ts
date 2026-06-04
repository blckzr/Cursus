import { db } from '../../config/db';

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
