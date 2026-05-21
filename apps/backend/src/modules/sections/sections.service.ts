import { db } from '../../config/db';

const SECTION_QUERY = `
  SELECT s.*,
    c.code  AS course_code,  c.title AS course_title, c.units AS course_units,
    t.name  AS term_name,    t.is_active AS term_is_active,
    u.full_name AS faculty_name, u.email AS faculty_email
  FROM sections s
  JOIN courses c ON c.id = s.course_id
  JOIN terms   t ON t.id = s.term_id
  JOIN users   u ON u.id = s.faculty_id
`;

export async function listSections(filter: { termId?: string; facultyId?: string }) {
  const conditions: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (filter.termId)    { conditions.push(`s.term_id = $${i++}`);    vals.push(filter.termId); }
  if (filter.facultyId) { conditions.push(`s.faculty_id = $${i++}`); vals.push(filter.facultyId); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await db.query(`${SECTION_QUERY} ${where} ORDER BY s.section_code`, vals);
  return rows;
}

export async function getSectionById(id: string) {
  const { rows } = await db.query(`${SECTION_QUERY} WHERE s.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function createSection(data: {
  courseId: string; termId: string; facultyId: string; sectionCode: string;
  dayOfWeek?: string; startTime?: string; endTime?: string; room?: string; capacity: number;
}) {
  const { rows } = await db.query(
    `INSERT INTO sections (course_id, term_id, faculty_id, section_code, day_of_week, start_time, end_time, room, capacity)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [data.courseId, data.termId, data.facultyId, data.sectionCode,
     data.dayOfWeek ?? null, data.startTime ?? null, data.endTime ?? null, data.room ?? null, data.capacity],
  );
  return rows[0];
}

export async function updateSection(id: string, data: Partial<ReturnType<typeof Object.fromEntries>>) {
  const map: Record<string, string> = {
    courseId: 'course_id', termId: 'term_id', facultyId: 'faculty_id',
    sectionCode: 'section_code', dayOfWeek: 'day_of_week', startTime: 'start_time',
    endTime: 'end_time', room: 'room', capacity: 'capacity',
  };

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  for (const [key, col] of Object.entries(map)) {
    if ((data as Record<string, unknown>)[key] !== undefined) {
      sets.push(`${col} = $${i++}`);
      vals.push((data as Record<string, unknown>)[key]);
    }
  }

  if (sets.length === 0) return getSectionById(id);

  vals.push(id);
  const { rows } = await db.query(
    `UPDATE sections SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals,
  );
  return rows[0] ?? null;
}
