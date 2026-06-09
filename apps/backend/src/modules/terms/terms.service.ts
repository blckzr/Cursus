import { db } from '../../config/db';
import { createMany as createNotifications } from '../notifications/notifications.service';

export async function listTerms() {
  const { rows } = await db.query('SELECT * FROM terms ORDER BY start_date DESC');
  return rows;
}

export async function getTermById(id: string) {
  const { rows } = await db.query('SELECT * FROM terms WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function createTerm(data: {
  name: string; semester: '1' | '2' | 'summer';
  startDate: string; endDate: string; isActive: boolean;
}) {
  const { rows } = await db.query(
    `INSERT INTO terms (name, semester, start_date, end_date, is_active)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [data.name, data.semester, data.startDate, data.endDate, data.isActive],
  );
  return rows[0];
}

export async function updateTerm(id: string, data: {
  name?: string; semester?: '1' | '2' | 'summer';
  startDate?: string; endDate?: string; isActive?: boolean;
}) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (data.name      !== undefined) { sets.push(`name = $${i++}`);       vals.push(data.name); }
  if (data.semester  !== undefined) { sets.push(`semester = $${i++}`);   vals.push(data.semester); }
  if (data.startDate !== undefined) { sets.push(`start_date = $${i++}`); vals.push(data.startDate); }
  if (data.endDate   !== undefined) { sets.push(`end_date = $${i++}`);   vals.push(data.endDate); }
  if (data.isActive  !== undefined) { sets.push(`is_active = $${i++}`);  vals.push(data.isActive); }

  if (sets.length === 0) return getTermById(id);

  vals.push(id);
  const { rows } = await db.query(
    `UPDATE terms SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals,
  );
  return rows[0] ?? null;
}

/**
 * "Open Term" — the headline automation. For each program × year level in scope,
 * materialise the curriculum for this term's semester into:
 *   • one `sections` row per (block, course, term)   — TBA faculty/schedule
 *   • one `enrollments` row per (student, section)   — for every student in each block
 *
 * Idempotent: ON CONFLICT skips anything already created on a prior run.
 * Irregular students (block_id IS NULL) are intentionally not auto-enrolled.
 */
export async function openTerm(termId: string, scope: { programIds?: string[] }, adminId: string) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const termRes = await client.query('SELECT id, semester FROM terms WHERE id = $1', [termId]);
    if (!termRes.rows[0]) throw Object.assign(new Error('Term not found'), { status: 404 });
    const term = termRes.rows[0];

    const progRes = scope.programIds && scope.programIds.length > 0
      ? await client.query('SELECT id, code, year_levels FROM programs WHERE id = ANY($1::uuid[])', [scope.programIds])
      : await client.query('SELECT id, code, year_levels FROM programs');
    const programs = progRes.rows;

    let sectionsCreated = 0;
    let sectionsSkipped = 0;
    let enrollmentsCreated = 0;

    for (const prog of programs) {
      for (let year = 1; year <= prog.year_levels; year++) {
        // Curriculum courses for this (program, year, term.semester)
        const curr = await client.query(
          `SELECT cc.course_id, c.code AS course_code
           FROM curriculum_courses cc
           JOIN courses c ON c.id = cc.course_id
           WHERE cc.program_id = $1 AND cc.year_level = $2 AND cc.semester = $3
           ORDER BY cc.display_order, c.code`,
          [prog.id, year, term.semester],
        );
        if (curr.rows.length === 0) continue;

        // Blocks at this (program, year) level
        const blks = await client.query(
          `SELECT id, year_level, block_number, capacity
           FROM blocks
           WHERE program_id = $1 AND year_level = $2
           ORDER BY block_number`,
          [prog.id, year],
        );

        for (const block of blks.rows) {
          for (const course of curr.rows) {
            const sectionCode =
              `${prog.code} ${block.year_level}-${block.block_number} ${course.course_code}`;

            // Create section (TBA faculty/schedule) — skip if already exists for this block/course/term.
            const ins = await client.query(
              `INSERT INTO sections (block_id, course_id, term_id, section_code, capacity)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (block_id, course_id, term_id) DO NOTHING
               RETURNING id`,
              [block.id, course.course_id, termId, sectionCode, block.capacity],
            );

            let sectionId: string;
            if (ins.rows[0]) {
              sectionId = ins.rows[0].id;
              sectionsCreated++;
            } else {
              const existing = await client.query(
                `SELECT id FROM sections WHERE block_id = $1 AND course_id = $2 AND term_id = $3`,
                [block.id, course.course_id, termId],
              );
              sectionId = existing.rows[0].id;
              sectionsSkipped++;
            }

            // Speculatively enroll every active student in this block, but
            // leave the row PENDING — the student must explicitly confirm via
            // the COR page. Until they do, gradebook / roster / schedule all
            // ignore the row (those views filter status = 'enrolled').
            // Smart per-student enrollment. A student is enrolled in this
            // section if ANY of:
            //
            //   (a) Regular cohort path — they're in this block AND haven't
            //       already passed this course AND every prerequisite has
            //       been passed (no failing 5.00 hanging in the chain).
            //
            //   (b) Retake path — they have an outstanding 5.00 on THIS
            //       course (failed and never re-passed). This catches a
            //       Y2 student who failed COMP004 in Y1 and is now eligible
            //       to retake when COMP004 is offered to the new Y1 cohort.
            //
            // Locked courses (failing prereq → unmet) naturally drop out
            // of clause (a) because the prereq isn't in the passed set.
            // Already-completed courses drop out because of the
            // "haven't already passed" check.
            const enrollRes = await client.query(
              `INSERT INTO enrollments (student_id, section_id, status)
               SELECT u.id, $2, 'pending'::enroll_status
               FROM users u
               WHERE u.role         = 'student'
                 AND u.is_active    = true
                 AND u.graduated_at IS NULL
                 AND (
                   -- (a) Regular cohort enrollment
                   (
                     u.block_id = $1
                     AND NOT EXISTS (
                       SELECT 1 FROM enrollments ep
                         JOIN sections sp ON sp.id = ep.section_id
                        WHERE ep.student_id = u.id
                          AND sp.course_id  = $3
                          AND ep.numeric_grade IS NOT NULL
                          AND ep.numeric_grade >= 75
                     )
                     AND NOT EXISTS (
                       -- A prereq is unmet (no passed enrollment for it)
                       SELECT 1 FROM course_prerequisites cp
                        WHERE cp.course_id = $3
                          AND NOT EXISTS (
                            SELECT 1 FROM enrollments ep2
                              JOIN sections sp2 ON sp2.id = ep2.section_id
                             WHERE ep2.student_id = u.id
                               AND sp2.course_id  = cp.prerequisite_id
                               AND ep2.numeric_grade >= 75
                          )
                     )
                   )
                   OR
                   -- (b) Retake — has a 5.00 on this course's course_id and
                   --     never subsequently re-passed it. Works for students
                   --     from any block, so a Y2 student joins the Y1 section
                   --     of their failed subject.
                   EXISTS (
                     SELECT 1 FROM enrollments ef
                       JOIN sections sf ON sf.id = ef.section_id
                      WHERE ef.student_id  = u.id
                        AND sf.course_id   = $3
                        AND ef.letter_grade = '5.00'
                        AND NOT EXISTS (
                          SELECT 1 FROM enrollments ep3
                            JOIN sections sp3 ON sp3.id = ep3.section_id
                           WHERE ep3.student_id = u.id
                             AND sp3.course_id  = $3
                             AND ep3.numeric_grade >= 75
                        )
                   )
                 )
               ON CONFLICT (student_id, section_id) DO NOTHING
               RETURNING id`,
              [block.id, sectionId, course.course_id],
            );
            enrollmentsCreated += enrollRes.rowCount || 0;
          }
        }
      }
    }

    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value)
       VALUES ($1, 'OPEN_TERM', 'terms', $2, $3)`,
      [adminId, termId, JSON.stringify({ sectionsCreated, sectionsSkipped, enrollmentsCreated })],
    );

    // Notify every student who now has at least one *pending* enrollment in
    // this term so they know to confirm. (Confirmed enrollees pre-existing
    // from a re-run also get notified — same message, same link.)
    const termNameRes = await client.query('SELECT name FROM terms WHERE id = $1', [termId]);
    const termName = termNameRes.rows[0]?.name ?? 'A new term';
    const recipientsRes = await client.query(
      `SELECT DISTINCT e.student_id
       FROM enrollments e
       JOIN sections   s ON s.id = e.section_id
       WHERE s.term_id = $1 AND e.status IN ('pending', 'enrolled')`,
      [termId],
    );
    await createNotifications(
      recipientsRes.rows.map((r: { student_id: string }) => ({
        userId: r.student_id,
        kind:   'term_opened',
        title:  `${termName} is open — please confirm your enrollment`,
        body:   `Open your Certificate of Registration and tap "Confirm enrollment" to attend ${termName}.`,
        link:   '/student/cor',
        data:   { termId },
      })),
      client,
    );

    await client.query('COMMIT');
    return { sectionsCreated, sectionsSkipped, enrollmentsCreated };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
