import { db } from '../../config/db';

export interface Slot {
  dayOfWeek: string;
  startTime: string;
  endTime:   string;
  kind:      'teaching' | 'office_hour';
}

/** Every availability slot for a faculty member, ordered by day then start. */
export async function listForFaculty(facultyId: string) {
  const { rows } = await db.query(
    `SELECT id, day_of_week, start_time::text AS start_time, end_time::text AS end_time, kind
     FROM faculty_availability
     WHERE faculty_id = $1
     ORDER BY day_of_week, start_time`,
    [facultyId],
  );
  return rows;
}

/**
 * Replace a faculty member's entire weekly availability in one transaction.
 * This is the canonical "save the grid" operation called from the UI.
 */
export async function replaceForFaculty(facultyId: string, slots: Slot[]) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Validate that the user exists and is a faculty member.
    const { rows: u } = await client.query(
      `SELECT role FROM users WHERE id = $1`,
      [facultyId],
    );
    if (!u[0]) throw Object.assign(new Error('Faculty not found'), { status: 404 });
    if (u[0].role !== 'faculty') {
      throw Object.assign(new Error('Availability can only be set for faculty users.'), { status: 400 });
    }

    await client.query(`DELETE FROM faculty_availability WHERE faculty_id = $1`, [facultyId]);

    for (const s of slots) {
      if (s.endTime <= s.startTime) {
        throw Object.assign(
          new Error(`Slot end time must be after start time (${s.startTime}–${s.endTime}).`),
          { status: 400 },
        );
      }
      await client.query(
        `INSERT INTO faculty_availability (faculty_id, day_of_week, start_time, end_time, kind)
         VALUES ($1, $2, $3, $4, $5)`,
        [facultyId, s.dayOfWeek, s.startTime, s.endTime, s.kind],
      );
    }

    await client.query('COMMIT');
    return await listForFaculty(facultyId);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
