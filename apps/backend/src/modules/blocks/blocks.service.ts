import { db } from '../../config/db';
import type { PoolClient } from 'pg';

/**
 * Every block with its program info and live student count.
 *
 * Excludes graduates from the count — they still have their `block_id` set so
 * transcripts can reference the cohort they came from, but they shouldn't
 * inflate the "students in block X" capacity number.
 */
export async function listBlocks() {
  const { rows } = await db.query(`
    SELECT b.id, b.program_id, b.year_level, b.block_number, b.capacity,
           p.code AS program_code, p.name AS program_name,
           COUNT(u.id)::int AS student_count
    FROM blocks b
    JOIN programs p ON p.id = b.program_id
    LEFT JOIN users u ON u.block_id = b.id
                      AND u.role = 'student'
                      AND u.graduated_at IS NULL
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
     LEFT JOIN users u ON u.block_id = b.id
                       AND u.role = 'student'
                       AND u.graduated_at IS NULL
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
 *   • graduated_at → now()    (alumni-mode flag — see auth.service.ts)
 *
 * `is_active` is intentionally left TRUE so graduates can still sign in to
 * the read-only alumni portal (transcript + certificate of graduation).
 * Their enrollment + grade history is preserved so transcripts still work.
 * Only the final-year block of a program can graduate — other years promote.
 */
export async function graduateBlock(blockId: string, adminId: string) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await graduateBlockInTxn(client, blockId, adminId);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Shared transaction body for graduateBlock + advanceAcademicYear. */
async function graduateBlockInTxn(client: PoolClient, blockId: string, adminId: string) {
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

  // Final-year students with outstanding retakes (failed subjects not yet
  // re-passed) are held back — they're still in the block but can't graduate
  // until the registrar resolves their retakes.
  const { rows: studs } = await client.query(
    `SELECT id FROM users u
     WHERE block_id = $1 AND role = 'student'
       AND is_active = TRUE AND graduated_at IS NULL
       AND NOT EXISTS (
         SELECT 1
           FROM enrollments ef
           JOIN sections    sf ON sf.id = ef.section_id
          WHERE ef.student_id  = u.id
            AND ef.letter_grade = '5.00'
            AND NOT EXISTS (
              SELECT 1 FROM enrollments ep
                JOIN sections sp ON sp.id = ep.section_id
               WHERE ep.student_id   = u.id
                 AND sp.course_id    = sf.course_id
                 AND ep.numeric_grade >= 75
            )
       )`,
    [blockId],
  );
  const studentIds: string[] = studs.map((s: { id: string }) => s.id);

  if (studentIds.length === 0) {
    return { graduated: 0, blockLabel: `${b[0].program_code} ${b[0].year_level}-${b[0].block_number}` };
  }

  await client.query(
    `UPDATE users
     SET graduated_at = now()
     WHERE id = ANY($1::uuid[]) AND graduated_at IS NULL`,
    [studentIds],
  );

  // Notify each graduate so they see a welcome message on next sign-in.
  await client.query(
    `INSERT INTO notifications (user_id, kind, title, body, link)
     SELECT id, 'cohort_graduated',
            'Congratulations — you''ve graduated!',
            'You can still sign in to download your final transcript and certificate of graduation. Other features are now read-only.',
            '/student'
       FROM users WHERE id = ANY($1::uuid[])`,
    [studentIds],
  );

  const blockLabel = `${b[0].program_code} ${b[0].year_level}-${b[0].block_number}`;
  await client.query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value)
     VALUES ($1, 'GRADUATE_COHORT', 'blocks', $2, $3)`,
    [adminId, blockId, JSON.stringify({ graduated: studentIds.length, blockLabel })],
  );

  return { graduated: studentIds.length, blockLabel };
}

/**
 * End-of-academic-year batch: promote Y(N) → Y(N+1) for every non-final year
 * in the program, then graduate every Y(final) block. Runs as ONE transaction
 * — if any step fails the whole thing rolls back, so the cohorts never end up
 * partially advanced.
 *
 * This is what an admin clicks once per academic year. It replaces the
 * per-year promote buttons.
 */
export async function advanceAcademicYear(programId: string, adminId: string) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const prog = await client.query(
      `SELECT code, year_levels FROM programs WHERE id = $1`,
      [programId],
    );
    if (!prog.rows[0]) throw Object.assign(new Error('Program not found'), { status: 404 });
    const finalYear = Number(prog.rows[0].year_levels);
    const programCode = prog.rows[0].code;

    // ORDER MATTERS: graduate the final year FIRST so it's vacated before
    // Y(N−1) gets promoted into it. Otherwise the freshly-promoted Y(N−1)
    // students would be caught by the graduation sweep and become alumni
    // on the very same day they advanced into final year.
    //
    // After graduation, promote in reverse (Y(N−1)→Y(N), Y(N−2)→Y(N−1), …)
    // so every step lands in a year-level that's already empty.

    // 1. Graduate every final-year block.
    const finalBlocks = await client.query(
      `SELECT id FROM blocks WHERE program_id = $1 AND year_level = $2 ORDER BY block_number`,
      [programId, finalYear],
    );
    let totalGraduated = 0;
    for (const b of finalBlocks.rows) {
      const r = await graduateBlockInTxn(client, b.id, adminId);
      totalGraduated += r.graduated;
    }

    // 2. Promote in reverse, each year level into the now-vacated next one.
    let totalPromoted = 0;
    const perYearPromoted: Record<number, number> = {};
    for (let y = finalYear - 1; y >= 1; y--) {
      const r = await promoteYearInTxn(client, programId, y, adminId);
      perYearPromoted[y] = r.promoted;
      totalPromoted += r.promoted;
    }

    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value)
       VALUES ($1, 'ADVANCE_ACADEMIC_YEAR', 'programs', $2, $3)`,
      [adminId, programId,
       JSON.stringify({ programCode, promoted: perYearPromoted, totalPromoted, totalGraduated })],
    );

    await client.query('COMMIT');
    return { programCode, promoted: perYearPromoted, totalPromoted, totalGraduated };
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
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await promoteYearInTxn(client, programId, yearLevel, adminId);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** Shared transaction body for promoteYear + advanceAcademicYear. */
async function promoteYearInTxn(client: PoolClient, programId: string, yearLevel: number, adminId: string) {
  const nextYear = yearLevel + 1;
  {
    const prog = await client.query('SELECT code, year_levels FROM programs WHERE id = $1', [programId]);
    if (!prog.rows[0]) throw Object.assign(new Error('Program not found'), { status: 404 });
    if (nextYear > prog.rows[0].year_levels) {
      throw Object.assign(
        new Error(`Year ${yearLevel} is the final year of ${prog.rows[0].code} — students here graduate rather than promote.`),
        { status: 409 },
      );
    }

    // Skip students with outstanding retakes — they stay in their current
    // year until the registrar resolves the retakes.
    const studs = await client.query(
      `SELECT id FROM users u
       WHERE u.program_id = $1 AND u.year_level = $2
         AND u.role = 'student' AND u.is_active = true
         AND NOT EXISTS (
           SELECT 1
             FROM enrollments ef
             JOIN sections    sf ON sf.id = ef.section_id
            WHERE ef.student_id  = u.id
              AND ef.letter_grade = '5.00'
              AND NOT EXISTS (
                SELECT 1 FROM enrollments ep
                  JOIN sections sp ON sp.id = ep.section_id
                 WHERE ep.student_id   = u.id
                   AND sp.course_id    = sf.course_id
                   AND ep.numeric_grade >= 75
              )
         )`,
      [programId, yearLevel],
    );
    const studentIds: string[] = studs.rows.map(r => r.id);

    if (studentIds.length === 0) {
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

    return { promoted: studentIds.length, nextYear };
  }
}
