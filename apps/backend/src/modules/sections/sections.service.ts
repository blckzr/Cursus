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
  // Pull current state so we can compute the post-update snapshot for conflict checking.
  const { rows: cur } = await db.query(
    'SELECT term_id, faculty_id, day_of_week, start_time, end_time FROM sections WHERE id = $1',
    [id],
  );
  if (!cur[0]) throw Object.assign(new Error('Section not found'), { status: 404 });

  const merged = {
    termId:     cur[0].term_id as string,
    facultyId:  data.facultyId !== undefined ? data.facultyId : (cur[0].faculty_id as string | null),
    dayOfWeek:  data.dayOfWeek !== undefined ? data.dayOfWeek : (cur[0].day_of_week as string | null),
    startTime:  data.startTime !== undefined ? data.startTime : (cur[0].start_time as string | null),
    endTime:    data.endTime   !== undefined ? data.endTime   : (cur[0].end_time   as string | null),
  };

  // Schedule conflict checks — only when the section has a complete assignment.
  if (merged.facultyId && merged.dayOfWeek && merged.startTime && merged.endTime) {
    // 1. Clash with another section taught by this faculty in the same term.
    const clash = await findScheduleConflict({
      sectionId:  id,
      facultyId:  merged.facultyId,
      termId:     merged.termId,
      dayOfWeek:  merged.dayOfWeek,
      startTime:  merged.startTime,
      endTime:    merged.endTime,
    });
    if (clash) {
      throw Object.assign(
        new Error(
          `Schedule conflict: faculty already teaches ${clash.section_code} ` +
          `on ${clash.day_of_week} ${String(clash.start_time).slice(0, 5)}–${String(clash.end_time).slice(0, 5)}.`,
        ),
        { status: 409 },
      );
    }

    // 2. Faculty must be available to teach in this slot — and not during office hours.
    const avail = await checkAvailability({
      facultyId: merged.facultyId,
      dayOfWeek: merged.dayOfWeek,
      startTime: merged.startTime,
      endTime:   merged.endTime,
    });
    if (avail) {
      throw Object.assign(new Error(avail.message), { status: 409 });
    }
  }

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

// ============================================================================
// Schedule overlap helpers
// ============================================================================

/**
 * Parse a day-of-week string like 'MWF' or 'TTh' into the canonical day tokens.
 * Multi-char tokens ('Th', 'Sat') are matched first so single-letter day codes
 * don't accidentally capture letters that belong to them.
 */
export function parseDays(s: string): string[] {
  let rest = s.replace(/\s+/g, '');
  const out = new Set<string>();
  // Multi-char first (longest before shortest)
  while (/sun/i.test(rest)) { out.add('Sun'); rest = rest.replace(/sun/i, ''); }
  while (/sat/i.test(rest)) { out.add('Sat'); rest = rest.replace(/sat/i, ''); }
  while (/th/i.test(rest))  { out.add('Th');  rest = rest.replace(/th/i,  ''); }
  for (const c of rest.toUpperCase()) {
    if ('MTWF'.includes(c)) out.add(c);
  }
  return [...out];
}

/**
 * Returns the FIRST other section taught by `facultyId` in `termId` whose
 * day + time overlaps the given window, or null if there's no clash.
 *
 * Time overlap: A.start < B.end  AND  B.start < A.end
 * Day overlap:  parsed day-token sets share at least one element
 */
async function findScheduleConflict(opts: {
  sectionId: string;
  facultyId: string;
  termId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
}) {
  const { rows } = await db.query(
    `SELECT s.id, s.section_code, s.day_of_week, s.start_time, s.end_time
     FROM sections s
     WHERE s.faculty_id = $1
       AND s.term_id = $2
       AND s.id <> $3
       AND s.day_of_week IS NOT NULL
       AND s.start_time IS NOT NULL
       AND s.end_time   IS NOT NULL
       AND s.start_time < $5::time
       AND s.end_time   > $4::time`,
    [opts.facultyId, opts.termId, opts.sectionId, opts.startTime, opts.endTime],
  );

  const newDays = parseDays(opts.dayOfWeek);
  for (const r of rows) {
    const otherDays = parseDays(r.day_of_week);
    if (newDays.some(d => otherDays.includes(d))) return r;
  }
  return null;
}

/**
 * Validate that a proposed (faculty, day, time) slot fits the faculty's declared
 * weekly availability:
 *   • The full window must lie inside at least one `teaching` slot for each day.
 *   • The window must not overlap any `office_hour` slot.
 *
 * Returns null if all good, or { message } if a rule fails.
 * If the faculty has NO availability rows yet, validation is skipped (admins can
 * still assign sections; this only kicks in once availability is configured).
 */
async function checkAvailability(opts: {
  facultyId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
}): Promise<{ message: string } | null> {
  const { rows: slots } = await db.query(
    `SELECT day_of_week, start_time::text AS start_time, end_time::text AS end_time, kind
     FROM faculty_availability
     WHERE faculty_id = $1`,
    [opts.facultyId],
  );
  if (slots.length === 0) return null;

  const newDays = parseDays(opts.dayOfWeek);

  for (const day of newDays) {
    // Must lie inside at least one teaching slot on this day
    const teachingOnDay = slots.filter(
      (s: { kind: string; day_of_week: string }) =>
        s.kind === 'teaching' && parseDays(s.day_of_week).includes(day),
    );
    const covered = teachingOnDay.some(
      (s: { start_time: string; end_time: string }) =>
        s.start_time <= opts.startTime && s.end_time >= opts.endTime,
    );
    if (!covered) {
      return {
        message: `Faculty is not available to teach ${opts.startTime.slice(0, 5)}–${opts.endTime.slice(0, 5)} on ${day}. Update their teaching availability first.`,
      };
    }

    // Must NOT overlap any office-hour slot on this day
    const officeOnDay = slots.filter(
      (s: { kind: string; day_of_week: string }) =>
        s.kind === 'office_hour' && parseDays(s.day_of_week).includes(day),
    );
    const overlap = officeOnDay.find(
      (s: { start_time: string; end_time: string }) =>
        s.start_time < opts.endTime && s.end_time > opts.startTime,
    );
    if (overlap) {
      return {
        message: `Conflicts with faculty's office hours on ${day} (${overlap.start_time.slice(0, 5)}–${overlap.end_time.slice(0, 5)}).`,
      };
    }
  }

  return null;
}
