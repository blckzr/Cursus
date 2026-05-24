import { db } from '../../config/db';

// Reusable JSON aggregation: programs linked to a course via course_programs.
// Returns '[]' for public courses (which have no rows in course_programs).
const PROGRAMS_AGG = `
  COALESCE(
    (SELECT json_agg(
              json_build_object('id', p.id, 'code', p.code, 'name', p.name)
              ORDER BY p.code)
     FROM course_programs cp
     JOIN programs p ON p.id = cp.program_id
     WHERE cp.course_id = c.id),
    '[]'::json
  ) AS programs
`;

const LIST_QUERY = `SELECT c.id, c.code, c.title, c.units, c.visibility, ${PROGRAMS_AGG} FROM courses c`;

export async function listCourses(filter: { programId?: string } = {}) {
  if (filter.programId) {
    // A course is visible to a program if it is 'public' OR explicitly linked.
    const { rows } = await db.query(
      `${LIST_QUERY}
       WHERE c.visibility = 'public'
          OR EXISTS (SELECT 1 FROM course_programs cp
                     WHERE cp.course_id = c.id AND cp.program_id = $1)
       ORDER BY c.code`,
      [filter.programId],
    );
    return rows;
  }
  const { rows } = await db.query(`${LIST_QUERY} ORDER BY c.code`);
  return rows;
}

export async function getCourseById(id: string) {
  const { rows } = await db.query(`${LIST_QUERY} WHERE c.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function createCourse(data: {
  code: string; title: string; units: number;
  visibility?: 'public' | 'restricted';
  programIds?: string[];
}) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const visibility = data.visibility ?? 'public';

    const { rows } = await client.query(
      `INSERT INTO courses (code, title, units, visibility)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [data.code, data.title, data.units, visibility],
    );
    const courseId = rows[0].id;

    if (visibility === 'restricted' && data.programIds?.length) {
      await replaceProgramLinks(client, courseId, data.programIds);
    }

    await client.query('COMMIT');
    return getCourseById(courseId);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function updateCourse(id: string, data: {
  code?: string; title?: string; units?: number;
  visibility?: 'public' | 'restricted';
  programIds?: string[];
}) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (data.code       !== undefined) { sets.push(`code = $${i++}`);       vals.push(data.code); }
    if (data.title      !== undefined) { sets.push(`title = $${i++}`);      vals.push(data.title); }
    if (data.units      !== undefined) { sets.push(`units = $${i++}`);      vals.push(data.units); }
    if (data.visibility !== undefined) { sets.push(`visibility = $${i++}`); vals.push(data.visibility); }

    if (sets.length > 0) {
      vals.push(id);
      await client.query(`UPDATE courses SET ${sets.join(', ')} WHERE id = $${i}`, vals);
    }

    // Sync course_programs links:
    //   • visibility=public   → clear all program links
    //   • programIds provided → replace links
    if (data.visibility === 'public') {
      await client.query('DELETE FROM course_programs WHERE course_id = $1', [id]);
    } else if (data.programIds !== undefined) {
      await replaceProgramLinks(client, id, data.programIds);
    }

    await client.query('COMMIT');
    return getCourseById(id);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Replace a course's program links wholesale.
async function replaceProgramLinks(
  client: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  courseId: string,
  programIds: string[],
) {
  await client.query('DELETE FROM course_programs WHERE course_id = $1', [courseId]);
  if (programIds.length === 0) return;
  const placeholders = programIds.map((_, idx) => `($1, $${idx + 2})`).join(', ');
  await client.query(
    `INSERT INTO course_programs (course_id, program_id) VALUES ${placeholders}`,
    [courseId, ...programIds],
  );
}
