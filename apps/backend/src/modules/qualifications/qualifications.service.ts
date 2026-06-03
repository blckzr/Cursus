import { db } from '../../config/db';

// ─── Listing ─────────────────────────────────────────────────────────────────

/**
 * Every qualified course for a faculty member, joined to the course catalog.
 * Used by both the faculty-self page and the (future) admin viewer.
 */
export async function listForFaculty(facultyId: string) {
  const { rows } = await db.query(
    `SELECT fq.id, fq.course_id, fq.preference, fq.notes, fq.created_at,
            c.code, c.title, c.units, c.visibility
     FROM faculty_qualifications fq
     JOIN courses c ON c.id = fq.course_id
     WHERE fq.faculty_id = $1
     ORDER BY fq.preference ASC, c.code`,
    [facultyId],
  );
  return rows;
}

/**
 * Bundle the qualification list with the faculty's load cap so the frontend
 * can render both in one round-trip.
 */
export async function getFacultyPrefs(facultyId: string) {
  const { rows: u } = await db.query(
    `SELECT id, full_name, max_teaching_units FROM users WHERE id = $1 AND role = 'faculty'`,
    [facultyId],
  );
  if (!u[0]) throw Object.assign(new Error('Faculty not found'), { status: 404 });

  const items = await listForFaculty(facultyId);
  return {
    facultyId:        u[0].id,
    fullName:         u[0].full_name,
    maxTeachingUnits: u[0].max_teaching_units,
    items,
  };
}

// ─── Bulk replace (one transaction) ──────────────────────────────────────────

interface ReplaceItem {
  courseId:   string;
  preference: number;
  notes?:     string;
}

/**
 * Atomically replaces a faculty's qualifications list. Optionally updates
 * `max_teaching_units` in the same transaction.
 */
export async function replaceForFaculty(
  facultyId: string,
  items: ReplaceItem[],
  maxTeachingUnits?: number | null,
) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows: u } = await client.query(
      `SELECT role FROM users WHERE id = $1`,
      [facultyId],
    );
    if (!u[0]) throw Object.assign(new Error('Faculty not found'), { status: 404 });
    if (u[0].role !== 'faculty') {
      throw Object.assign(
        new Error('Qualifications can only be set for faculty users.'),
        { status: 400 },
      );
    }

    await client.query(`DELETE FROM faculty_qualifications WHERE faculty_id = $1`, [facultyId]);
    for (const it of items) {
      await client.query(
        `INSERT INTO faculty_qualifications (faculty_id, course_id, preference, notes)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (faculty_id, course_id)
           DO UPDATE SET preference = EXCLUDED.preference, notes = EXCLUDED.notes`,
        [facultyId, it.courseId, it.preference, it.notes ?? null],
      );
    }

    if (maxTeachingUnits !== undefined) {
      await client.query(
        `UPDATE users SET max_teaching_units = $1 WHERE id = $2`,
        [maxTeachingUnits, facultyId],
      );
    }

    await client.query('COMMIT');
    return await getFacultyPrefs(facultyId);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ─── Single-row helpers (used by the toggle button on the picker) ────────────

export async function upsertOne(
  facultyId: string,
  data: { courseId: string; preference: number; notes?: string },
) {
  const { rows: u } = await db.query(`SELECT role FROM users WHERE id = $1`, [facultyId]);
  if (!u[0]) throw Object.assign(new Error('Faculty not found'), { status: 404 });
  if (u[0].role !== 'faculty') {
    throw Object.assign(new Error('Qualifications can only be set for faculty users.'), { status: 400 });
  }
  const { rows } = await db.query(
    `INSERT INTO faculty_qualifications (faculty_id, course_id, preference, notes)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (faculty_id, course_id)
       DO UPDATE SET preference = EXCLUDED.preference, notes = EXCLUDED.notes
     RETURNING *`,
    [facultyId, data.courseId, data.preference, data.notes ?? null],
  );
  return rows[0];
}

export async function updateOne(
  facultyId: string,
  id: string,
  data: { preference?: number; notes?: string | null },
) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (data.preference !== undefined) { sets.push(`preference = $${i++}`); vals.push(data.preference); }
  if (data.notes      !== undefined) { sets.push(`notes      = $${i++}`); vals.push(data.notes); }
  if (sets.length === 0) {
    const { rows } = await db.query(
      `SELECT * FROM faculty_qualifications WHERE id = $1 AND faculty_id = $2`,
      [id, facultyId],
    );
    return rows[0] ?? null;
  }
  vals.push(id, facultyId);
  const { rows } = await db.query(
    `UPDATE faculty_qualifications SET ${sets.join(', ')}
     WHERE id = $${i++} AND faculty_id = $${i}
     RETURNING *`,
    vals,
  );
  return rows[0] ?? null;
}

export async function deleteOne(facultyId: string, id: string) {
  await db.query(
    `DELETE FROM faculty_qualifications WHERE id = $1 AND faculty_id = $2`,
    [id, facultyId],
  );
}
