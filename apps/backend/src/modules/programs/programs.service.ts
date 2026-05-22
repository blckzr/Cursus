import { db } from '../../config/db';
import { syncBlocksForProgram } from '../blocks/blocks.service';

export async function listPrograms() {
  const { rows } = await db.query('SELECT * FROM programs ORDER BY code');
  return rows;
}

export async function getProgramById(id: string) {
  const { rows } = await db.query('SELECT * FROM programs WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function createProgram(data: {
  code: string; name: string; totalUnits: number;
  yearLevels?: number; blocksPerYear?: number; blockCapacity?: number;
}) {
  const { rows } = await db.query(
    `INSERT INTO programs (code, name, total_units, year_levels, blocks_per_year, block_capacity)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [data.code, data.name, data.totalUnits,
     data.yearLevels ?? 4, data.blocksPerYear ?? 3, data.blockCapacity ?? 50],
  );
  // Generate this program's block sections from its configuration
  await syncBlocksForProgram(rows[0].id);
  return rows[0];
}

export async function updateProgram(id: string, data: {
  code?: string; name?: string; totalUnits?: number;
  yearLevels?: number; blocksPerYear?: number; blockCapacity?: number;
}) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (data.code          !== undefined) { sets.push(`code = $${i++}`);            vals.push(data.code); }
  if (data.name          !== undefined) { sets.push(`name = $${i++}`);            vals.push(data.name); }
  if (data.totalUnits    !== undefined) { sets.push(`total_units = $${i++}`);     vals.push(data.totalUnits); }
  if (data.yearLevels    !== undefined) { sets.push(`year_levels = $${i++}`);     vals.push(data.yearLevels); }
  if (data.blocksPerYear !== undefined) { sets.push(`blocks_per_year = $${i++}`); vals.push(data.blocksPerYear); }
  if (data.blockCapacity !== undefined) { sets.push(`block_capacity = $${i++}`);  vals.push(data.blockCapacity); }

  if (sets.length === 0) return getProgramById(id);

  vals.push(id);
  const { rows } = await db.query(
    `UPDATE programs SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals,
  );
  // Add any blocks the (possibly changed) config now calls for. Never deletes.
  await syncBlocksForProgram(id);
  return rows[0] ?? null;
}
