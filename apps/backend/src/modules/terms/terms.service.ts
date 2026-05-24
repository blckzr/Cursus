import { db } from '../../config/db';

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

            // Auto-enroll every active student in this block (regular students only)
            const enrollRes = await client.query(
              `INSERT INTO enrollments (student_id, section_id)
               SELECT u.id, $2
               FROM users u
               WHERE u.block_id = $1 AND u.role = 'student' AND u.is_active = true
               ON CONFLICT (student_id, section_id) DO NOTHING
               RETURNING id`,
              [block.id, sectionId],
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

    await client.query('COMMIT');
    return { sectionsCreated, sectionsSkipped, enrollmentsCreated };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
