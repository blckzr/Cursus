import { db } from '../../config/db';
import { syncBlocksForProgram } from '../blocks/blocks.service';

/**
 * SELECT for programs that returns `total_units` as the LIVE sum of
 * curriculum-course units rather than the stored cache (which is left at 0
 * for new programs). The LEFT JOIN keeps programs with no curriculum visible
 * with total_units = 0.
 */
const PROGRAM_SELECT = `
  SELECT p.id, p.code, p.name,
         p.year_levels, p.blocks_per_year, p.block_capacity,
         COALESCE(SUM(c.units), 0)::int AS total_units
  FROM programs p
  LEFT JOIN curriculum_courses cc ON cc.program_id = p.id
  LEFT JOIN courses c             ON c.id = cc.course_id
`;

export async function listPrograms() {
  const { rows } = await db.query(
    `${PROGRAM_SELECT}
     GROUP BY p.id, p.code, p.name, p.year_levels, p.blocks_per_year, p.block_capacity
     ORDER BY p.code`,
  );
  return rows;
}

export async function getProgramById(id: string) {
  const { rows } = await db.query(
    `${PROGRAM_SELECT}
     WHERE p.id = $1
     GROUP BY p.id, p.code, p.name, p.year_levels, p.blocks_per_year, p.block_capacity`,
    [id],
  );
  return rows[0] ?? null;
}

export async function createProgram(data: {
  code: string; name: string;
  yearLevels?: number; blocksPerYear?: number; blockCapacity?: number;
}) {
  // `total_units` is intentionally not accepted — it's derived on read from
  // the curriculum. We store a placeholder 0 in the cache column.
  const { rows } = await db.query(
    `INSERT INTO programs (code, name, total_units, year_levels, blocks_per_year, block_capacity)
     VALUES ($1, $2, 0, $3, $4, $5) RETURNING id`,
    [data.code, data.name,
     data.yearLevels ?? 4, data.blocksPerYear ?? 3, data.blockCapacity ?? 50],
  );
  // Generate this program's block sections from its configuration
  await syncBlocksForProgram(rows[0].id);
  // Return the program through the same computed-total query for consistency.
  return getProgramById(rows[0].id);
}

export async function updateProgram(id: string, data: {
  code?: string; name?: string;
  yearLevels?: number; blocksPerYear?: number; blockCapacity?: number;
}) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (data.code          !== undefined) { sets.push(`code = $${i++}`);            vals.push(data.code); }
  if (data.name          !== undefined) { sets.push(`name = $${i++}`);            vals.push(data.name); }
  if (data.yearLevels    !== undefined) { sets.push(`year_levels = $${i++}`);     vals.push(data.yearLevels); }
  if (data.blocksPerYear !== undefined) { sets.push(`blocks_per_year = $${i++}`); vals.push(data.blocksPerYear); }
  if (data.blockCapacity !== undefined) { sets.push(`block_capacity = $${i++}`);  vals.push(data.blockCapacity); }

  if (sets.length > 0) {
    vals.push(id);
    await db.query(
      `UPDATE programs SET ${sets.join(', ')} WHERE id = $${i}`,
      vals,
    );
  }
  // Add any blocks the (possibly changed) config now calls for. Never deletes.
  await syncBlocksForProgram(id);
  return getProgramById(id);
}
