import { db } from '../../config/db';

const SECTION_QUERY = `
  SELECT s.*,
    c.code  AS course_code,    c.title AS course_title, c.units AS course_units,
    t.name  AS term_name,      t.semester AS term_semester, t.is_active AS term_is_active,
    b.id    AS block_id_full,  b.year_level AS block_year_level, b.block_number,
    p.id    AS program_id,     p.code AS program_code, p.name AS program_name,
    u.full_name AS faculty_name, u.email AS faculty_email,
    p.code || ' ' || b.year_level || '-' || b.block_number AS block_label
  FROM sections s
  JOIN courses  c ON c.id = s.course_id
  JOIN terms    t ON t.id = s.term_id
  JOIN blocks   b ON b.id = s.block_id
  JOIN programs p ON p.id = b.program_id
  LEFT JOIN users u ON u.id = s.faculty_id
`;

export async function listSections(filter: { termId?: string; facultyId?: string; blockId?: string }) {
  const conditions: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (filter.termId)    { conditions.push(`s.term_id = $${i++}`);    vals.push(filter.termId); }
  if (filter.facultyId) { conditions.push(`s.faculty_id = $${i++}`); vals.push(filter.facultyId); }
  if (filter.blockId)   { conditions.push(`s.block_id = $${i++}`);   vals.push(filter.blockId); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await db.query(
    `${SECTION_QUERY} ${where} ORDER BY p.code, b.year_level, b.block_number, c.code`,
    vals,
  );
  return rows;
}

export async function getSectionById(id: string) {
  const { rows } = await db.query(`${SECTION_QUERY} WHERE s.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function createSection(data: {
  blockId: string; courseId: string; termId: string;
  facultyId?: string;
  dayOfWeek?: string; startTime?: string; endTime?: string;
  room?: string; capacity?: number;
}) {
  // Derive the section code + default capacity from the block + course.
  const { rows: meta } = await db.query(
    `SELECT p.code AS program_code, b.year_level, b.block_number,
            b.capacity AS block_capacity, c.code AS course_code
     FROM blocks b
     JOIN programs p ON p.id = b.program_id
     JOIN courses c  ON c.id = $2
     WHERE b.id = $1`,
    [data.blockId, data.courseId],
  );
  if (!meta[0]) throw Object.assign(new Error('Block or course not found'), { status: 404 });
  const sectionCode = `${meta[0].program_code} ${meta[0].year_level}-${meta[0].block_number} ${meta[0].course_code}`;
  const capacity    = data.capacity ?? meta[0].block_capacity;

  const { rows } = await db.query(
    `INSERT INTO sections (block_id, course_id, term_id, faculty_id, section_code,
                           day_of_week, start_time, end_time, room, capacity)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [data.blockId, data.courseId, data.termId, data.facultyId ?? null, sectionCode,
     data.dayOfWeek ?? null, data.startTime ?? null, data.endTime ?? null,
     data.room ?? null, capacity],
  );
  return rows[0];
}

export async function updateSection(id: string, data: {
  facultyId?: string | null;
  dayOfWeek?: string | null; startTime?: string | null; endTime?: string | null;
  room?: string | null; capacity?: number;
}) {
  const map: Record<string, string> = {
    facultyId: 'faculty_id',
    dayOfWeek: 'day_of_week', startTime: 'start_time', endTime: 'end_time',
    room: 'room', capacity: 'capacity',
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
