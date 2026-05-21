import { db } from '../../config/db';

export async function listTerms() {
  const { rows } = await db.query('SELECT * FROM terms ORDER BY start_date DESC');
  return rows;
}

export async function getTermById(id: string) {
  const { rows } = await db.query('SELECT * FROM terms WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function createTerm(data: { name: string; startDate: string; endDate: string; isActive: boolean }) {
  const { rows } = await db.query(
    'INSERT INTO terms (name, start_date, end_date, is_active) VALUES ($1, $2, $3, $4) RETURNING *',
    [data.name, data.startDate, data.endDate, data.isActive],
  );
  return rows[0];
}

export async function updateTerm(id: string, data: { name?: string; startDate?: string; endDate?: string; isActive?: boolean }) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (data.name !== undefined)      { sets.push(`name = $${i++}`);       vals.push(data.name); }
  if (data.startDate !== undefined) { sets.push(`start_date = $${i++}`); vals.push(data.startDate); }
  if (data.endDate !== undefined)   { sets.push(`end_date = $${i++}`);   vals.push(data.endDate); }
  if (data.isActive !== undefined)  { sets.push(`is_active = $${i++}`);  vals.push(data.isActive); }

  if (sets.length === 0) return getTermById(id);

  vals.push(id);
  const { rows } = await db.query(
    `UPDATE terms SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals,
  );
  return rows[0] ?? null;
}
