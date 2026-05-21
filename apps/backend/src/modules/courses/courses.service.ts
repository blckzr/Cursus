import { db } from '../../config/db';

export async function listCourses(programId?: string) {
  const { rows } = programId
    ? await db.query(
        'SELECT c.*, p.name AS program_name FROM courses c LEFT JOIN programs p ON p.id = c.program_id WHERE c.program_id = $1 ORDER BY c.code',
        [programId],
      )
    : await db.query(
        'SELECT c.*, p.name AS program_name FROM courses c LEFT JOIN programs p ON p.id = c.program_id ORDER BY c.code',
      );
  return rows;
}

export async function getCourseById(id: string) {
  const { rows } = await db.query(
    'SELECT c.*, p.name AS program_name FROM courses c LEFT JOIN programs p ON p.id = c.program_id WHERE c.id = $1',
    [id],
  );
  return rows[0] ?? null;
}

export async function createCourse(data: { code: string; title: string; units: number; programId?: string }) {
  const { rows } = await db.query(
    'INSERT INTO courses (code, title, units, program_id) VALUES ($1, $2, $3, $4) RETURNING *',
    [data.code, data.title, data.units, data.programId ?? null],
  );
  return rows[0];
}

export async function updateCourse(id: string, data: { code?: string; title?: string; units?: number; programId?: string }) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (data.code !== undefined)      { sets.push(`code = $${i++}`);       vals.push(data.code); }
  if (data.title !== undefined)     { sets.push(`title = $${i++}`);      vals.push(data.title); }
  if (data.units !== undefined)     { sets.push(`units = $${i++}`);      vals.push(data.units); }
  if (data.programId !== undefined) { sets.push(`program_id = $${i++}`); vals.push(data.programId); }

  if (sets.length === 0) return getCourseById(id);

  vals.push(id);
  const { rows } = await db.query(
    `UPDATE courses SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals,
  );
  return rows[0] ?? null;
}
