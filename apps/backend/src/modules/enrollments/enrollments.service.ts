import { db } from '../../config/db';

const ENROLLMENT_QUERY = `
  SELECT e.*,
    u.full_name AS student_name, u.email AS student_email,
    s.section_code, c.code AS course_code, c.title AS course_title,
    t.name AS term_name
  FROM enrollments e
  JOIN users    u ON u.id = e.student_id
  JOIN sections s ON s.id = e.section_id
  JOIN courses  c ON c.id = s.course_id
  JOIN terms    t ON t.id = s.term_id
`;

export async function listEnrollments(filter: { sectionId?: string; studentId?: string }) {
  const conditions: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (filter.sectionId) { conditions.push(`e.section_id = $${i++}`); vals.push(filter.sectionId); }
  if (filter.studentId) { conditions.push(`e.student_id = $${i++}`); vals.push(filter.studentId); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await db.query(`${ENROLLMENT_QUERY} ${where} ORDER BY u.full_name`, vals);
  return rows;
}

export async function createEnrollment(data: { studentId: string; sectionId: string }) {
  // Check capacity
  const { rows: cap } = await db.query(
    `SELECT s.capacity,
       (SELECT COUNT(*) FROM enrollments WHERE section_id = s.id AND status = 'enrolled') AS enrolled
     FROM sections s WHERE s.id = $1`,
    [data.sectionId],
  );
  if (!cap[0]) throw Object.assign(new Error('Section not found'), { status: 404 });
  if (parseInt(cap[0].enrolled) >= parseInt(cap[0].capacity)) {
    throw Object.assign(new Error('Section is at full capacity'), { status: 409 });
  }

  const { rows } = await db.query(
    'INSERT INTO enrollments (student_id, section_id) VALUES ($1, $2) RETURNING *',
    [data.studentId, data.sectionId],
  );
  return rows[0];
}

export async function updateEnrollment(id: string, status: string) {
  const { rows } = await db.query(
    `UPDATE enrollments SET status = $1 WHERE id = $2
     RETURNING *`,
    [status, id],
  );
  return rows[0] ?? null;
}
