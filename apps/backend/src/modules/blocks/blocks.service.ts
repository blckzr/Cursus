import { db } from '../../config/db';

/** Every block with its program info and live student count. */
export async function listBlocks() {
  const { rows } = await db.query(`
    SELECT b.id, b.program_id, b.year_level, b.block_number, b.capacity,
           p.code AS program_code, p.name AS program_name,
           COUNT(u.id)::int AS student_count
    FROM blocks b
    JOIN programs p ON p.id = b.program_id
    LEFT JOIN users u ON u.block_id = b.id AND u.role = 'student'
    GROUP BY b.id, p.code, p.name
    ORDER BY p.code, b.year_level, b.block_number
  `);
  return rows;
}

/** Create any blocks the program's config requires but that don't exist yet. */
export async function syncBlocksForProgram(programId: string) {
  await db.query(
    `INSERT INTO blocks (program_id, year_level, block_number, capacity)
     SELECT p.id, y.year_level, b.block_number, p.block_capacity
     FROM programs p
     CROSS JOIN generate_series(1, p.year_levels)     AS y(year_level)
     CROSS JOIN generate_series(1, p.blocks_per_year) AS b(block_number)
     WHERE p.id = $1
     ON CONFLICT (program_id, year_level, block_number) DO NOTHING`,
    [programId],
  );
}

/** A random block in (program, yearLevel) that still has free capacity, or null. */
export async function pickRandomBlock(programId: string, yearLevel: number): Promise<string | null> {
  const { rows } = await db.query(
    `SELECT b.id
     FROM blocks b
     LEFT JOIN users u ON u.block_id = b.id AND u.role = 'student'
     WHERE b.program_id = $1 AND b.year_level = $2
     GROUP BY b.id, b.capacity
     HAVING COUNT(u.id) < b.capacity
     ORDER BY random()
     LIMIT 1`,
    [programId, yearLevel],
  );
  return rows[0]?.id ?? null;
}

/**
 * Mark every active student in a final-year block as graduated:
 *   • is_active   → false   (they can no longer sign in)
 *   • graduated_at → now()
 *
 * Their enrollment + grade history is preserved so transcripts still work.
 * Only the final-year block of a program can graduate — other years promote.
 */
export async function graduateBlock(blockId: string, adminId: string) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: b } = await client.query(
      `SELECT b.id, b.year_level, b.block_number, b.program_id,
              p.code AS program_code, p.year_levels
       FROM blocks b
       JOIN programs p ON p.id = b.program_id
       WHERE b.id = $1`,
      [blockId],
    );
    if (!b[0]) throw Object.assign(new Error('Block not found'), { status: 404 });

    if (b[0].year_level !== b[0].year_levels) {
      throw Object.assign(
        new Error(
          `Only final-year blocks can graduate. ${b[0].program_code} ${b[0].year_level}-${b[0].block_number} ` +
          `is at year ${b[0].year_level} but the program's final year is ${b[0].year_levels}.`,
        ),
        { status: 409 },
      );
    }

    const { rows: studs } = await client.query(
      `SELECT id FROM users
       WHERE block_id = $1 AND role = 'student'
         AND is_active = TRUE AND graduated_at IS NULL`,
      [blockId],
    );
    const studentIds: string[] = studs.map((s: { id: string }) => s.id);

    if (studentIds.length === 0) {
      await client.query('COMMIT');
      return { graduated: 0 };
    }

    await client.query(
      `UPDATE users
       SET is_active = FALSE, graduated_at = now()
       WHERE id = ANY($1::uuid[])`,
      [studentIds],
    );

    const blockLabel = `${b[0].program_code} ${b[0].year_level}-${b[0].block_number}`;
    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value)
       VALUES ($1, 'GRADUATE_COHORT', 'blocks', $2, $3)`,
      [adminId, blockId, JSON.stringify({ graduated: studentIds.length, blockLabel })],
    );

    await client.query('COMMIT');
    return { graduated: studentIds.length, blockLabel };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Promote every active student in (program, yearLevel) to the next year level
 * and randomly redistribute them across that next year's blocks.
 */
export async function promoteYear(programId: string, yearLevel: number, adminId: string) {
  const nextYear = yearLevel + 1;
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const prog = await client.query('SELECT code, year_levels FROM programs WHERE id = $1', [programId]);
    if (!prog.rows[0]) throw Object.assign(new Error('Program not found'), { status: 404 });
    if (nextYear > prog.rows[0].year_levels) {
      throw Object.assign(
        new Error(`Year ${yearLevel} is the final year of ${prog.rows[0].code} — students here graduate rather than promote.`),
        { status: 409 },
      );
    }

    const studs = await client.query(
      `SELECT id FROM users
       WHERE program_id = $1 AND year_level = $2 AND role = 'student' AND is_active = true`,
      [programId, yearLevel],
    );
    const studentIds: string[] = studs.rows.map(r => r.id);

    if (studentIds.length === 0) {
      await client.query('COMMIT');
      return { promoted: 0, nextYear };
    }

    const blks = await client.query(
      `SELECT id, capacity FROM blocks
       WHERE program_id = $1 AND year_level = $2 ORDER BY block_number`,
      [programId, nextYear],
    );
    if (blks.rows.length === 0) {
      throw Object.assign(new Error(`No blocks exist for year ${nextYear}.`), { status: 409 });
    }

    const blockIds: string[] = blks.rows.map(b => b.id);
    const caps: Record<string, number> = {};
    blks.rows.forEach(b => { caps[b.id] = b.capacity; });
    const totalCap = blks.rows.reduce((s, b) => s + b.capacity, 0);
    if (studentIds.length > totalCap) {
      throw Object.assign(
        new Error(`Year ${nextYear} capacity (${totalCap}) cannot hold the ${studentIds.length} students being promoted.`),
        { status: 409 },
      );
    }

    // Fisher–Yates shuffle so block placement is random
    for (let k = studentIds.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1));
      [studentIds[k], studentIds[j]] = [studentIds[j], studentIds[k]];
    }

    // Round-robin assignment across blocks, skipping any that hit capacity
    const counts: Record<string, number> = {};
    blockIds.forEach(id => { counts[id] = 0; });
    let bi = 0;
    for (const sid of studentIds) {
      let guard = 0;
      while (counts[blockIds[bi]] >= caps[blockIds[bi]]) {
        bi = (bi + 1) % blockIds.length;
        if (++guard > blockIds.length) {
          throw Object.assign(new Error('Unable to place all students into blocks.'), { status: 409 });
        }
      }
      const target = blockIds[bi];
      counts[target]++;
      bi = (bi + 1) % blockIds.length;
      await client.query(
        'UPDATE users SET year_level = $1, block_id = $2 WHERE id = $3',
        [nextYear, target, sid],
      );
    }

    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value)
       VALUES ($1, 'PROMOTE_YEAR', 'blocks', $2, $3)`,
      [adminId, programId, JSON.stringify({ fromYear: yearLevel, toYear: nextYear, promoted: studentIds.length })],
    );

    await client.query('COMMIT');
    return { promoted: studentIds.length, nextYear };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
