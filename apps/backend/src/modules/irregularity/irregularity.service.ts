/**
 * Irregularity service — derives whether a student is "irregular" from their
 * current academic situation (no_block OR has failed subjects awaiting retake).
 *
 * Why derived (not stored): `block_id` and `letter_grade` are the source of
 * truth. Caching a flag would just go stale. The check is one SELECT per
 * student and the queries hit indexed columns.
 *
 * The irregular semantics:
 *   • `no_block`         — student has block_id IS NULL (transferee, shifter).
 *   • `pending_retakes`  — student has ≥1 finalized 5.00 grade for a course
 *                          they haven't subsequently re-passed (numeric ≥ 75).
 *                          They're off-cycle: next term they retake instead
 *                          of advancing with their cohort.
 *   • `none`             — regular student on the standard track.
 *
 * `no_block` wins over `pending_retakes` in the label because it's the
 * structural classification; we still report retake counts on top of it.
 */
import { db } from '../../config/db';
import type { PoolClient } from 'pg';

export type IrregularityReason = 'none' | 'no_block' | 'pending_retakes';

export interface IrregularityStatus {
  isIrregular:        boolean;
  reason:             IrregularityReason;
  pendingRetakes:     number;            // count of distinct courses awaiting retake
  pendingRetakeCodes: string[];          // up to 6 course codes for tooltips/banners
}

/** SQL that computes the per-student retake set. Reused by single-row + bulk. */
const RETAKES_CTE = `
  WITH failed AS (
    -- distinct courses the student has a 5.00 on
    SELECT DISTINCT s.course_id, c.code
      FROM enrollments e
      JOIN sections s ON s.id = e.section_id
      JOIN courses  c ON c.id = s.course_id
     WHERE e.student_id = $1
       AND e.letter_grade = '5.00'
  ),
  retaken AS (
    -- of those, the ones they've subsequently passed (numeric ≥ 75)
    SELECT DISTINCT s2.course_id
      FROM enrollments e2
      JOIN sections s2 ON s2.id = e2.section_id
      JOIN failed   f  ON f.course_id = s2.course_id
     WHERE e2.student_id = $1
       AND e2.numeric_grade IS NOT NULL
       AND e2.numeric_grade >= 75
  )
  SELECT f.code
    FROM failed f
    WHERE NOT EXISTS (SELECT 1 FROM retaken r WHERE r.course_id = f.course_id)
    ORDER BY f.code
`;

/** Compute the irregularity status for a single student. */
export async function getStatus(
  studentId: string,
  client?: PoolClient,
): Promise<IrregularityStatus> {
  const db_ = client ?? db;

  // 1) Resolve block_id + role in one query so we can early-return for non-students.
  const u = await db_.query<{ role: string; block_id: string | null }>(
    `SELECT role, block_id FROM users WHERE id = $1`,
    [studentId],
  );
  if (!u.rows[0] || u.rows[0].role !== 'student') {
    return { isIrregular: false, reason: 'none', pendingRetakes: 0, pendingRetakeCodes: [] };
  }
  const noBlock = u.rows[0].block_id === null;

  // 2) Compute pending retakes.
  const r = await db_.query<{ code: string }>(RETAKES_CTE, [studentId]);
  const codes = r.rows.map(x => x.code);

  if (noBlock) {
    return {
      isIrregular: true,
      reason: 'no_block',
      pendingRetakes: codes.length,
      pendingRetakeCodes: codes.slice(0, 6),
    };
  }
  if (codes.length > 0) {
    return {
      isIrregular: true,
      reason: 'pending_retakes',
      pendingRetakes: codes.length,
      pendingRetakeCodes: codes.slice(0, 6),
    };
  }
  return { isIrregular: false, reason: 'none', pendingRetakes: 0, pendingRetakeCodes: [] };
}

/**
 * Bulk variant for the admin Users list. Returns a Map of studentId → status
 * with one round-trip. Skips non-students.
 */
export async function getStatusBulk(studentIds: string[]): Promise<Map<string, IrregularityStatus>> {
  const out = new Map<string, IrregularityStatus>();
  if (studentIds.length === 0) return out;

  // Pull all non-block + per-course-failed info in one query.
  const r = await db.query<{ user_id: string; block_id: string | null; code: string | null }>(
    `
    SELECT u.id AS user_id, u.block_id, fail.code
      FROM users u
      LEFT JOIN LATERAL (
        SELECT f.code FROM (
          SELECT DISTINCT s.course_id, c.code
            FROM enrollments e
            JOIN sections s ON s.id = e.section_id
            JOIN courses  c ON c.id = s.course_id
           WHERE e.student_id = u.id AND e.letter_grade = '5.00'
        ) f
        WHERE NOT EXISTS (
          SELECT 1 FROM enrollments e2
            JOIN sections s2 ON s2.id = e2.section_id
           WHERE e2.student_id = u.id
             AND s2.course_id  = f.course_id
             AND e2.numeric_grade >= 75
        )
        ORDER BY f.code
      ) fail ON TRUE
     WHERE u.role = 'student' AND u.id = ANY($1::uuid[])
    `,
    [studentIds],
  );

  // First pass: collect block info + failed code lists.
  const blocks = new Map<string, string | null>();
  const codes  = new Map<string, string[]>();
  for (const row of r.rows) {
    if (!blocks.has(row.user_id)) blocks.set(row.user_id, row.block_id);
    if (row.code) {
      const arr = codes.get(row.user_id) ?? [];
      arr.push(row.code);
      codes.set(row.user_id, arr);
    }
  }

  for (const id of studentIds) {
    const noBlock = blocks.get(id) === null && blocks.has(id);
    const retakeCodes = codes.get(id) ?? [];
    if (!blocks.has(id)) {
      // Wasn't returned by the query — not a student.
      out.set(id, { isIrregular: false, reason: 'none', pendingRetakes: 0, pendingRetakeCodes: [] });
      continue;
    }
    if (noBlock) {
      out.set(id, {
        isIrregular: true, reason: 'no_block',
        pendingRetakes: retakeCodes.length, pendingRetakeCodes: retakeCodes.slice(0, 6),
      });
    } else if (retakeCodes.length > 0) {
      out.set(id, {
        isIrregular: true, reason: 'pending_retakes',
        pendingRetakes: retakeCodes.length, pendingRetakeCodes: retakeCodes.slice(0, 6),
      });
    } else {
      out.set(id, { isIrregular: false, reason: 'none', pendingRetakes: 0, pendingRetakeCodes: [] });
    }
  }
  return out;
}
