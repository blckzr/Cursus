import { db } from '../../config/db';

export async function listPrograms() {
  const { rows } = await db.query('SELECT * FROM programs ORDER BY code');
  return rows;
}

export async function getProgramById(id: string) {
  const { rows } = await db.query('SELECT * FROM programs WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function createProgram(data: { code: string; name: string; totalUnits: number }) {
  const { rows } = await db.query(
    'INSERT INTO programs (code, name, total_units) VALUES ($1, $2, $3) RETURNING *',
    [data.code, data.name, data.totalUnits],
  );
  return rows[0];
}

export async function updateProgram(id: string, data: { code?: string; name?: string; totalUnits?: number }) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (data.code !== undefined) { sets.push(`code = $${i++}`); vals.push(data.code); }
  if (data.name !== undefined) { sets.push(`name = $${i++}`); vals.push(data.name); }
  if (data.totalUnits !== undefined) { sets.push(`total_units = $${i++}`); vals.push(data.totalUnits); }

  if (sets.length === 0) return getProgramById(id);

  vals.push(id);
  const { rows } = await db.query(
    `UPDATE programs SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals,
  );
  return rows[0] ?? null;
}
