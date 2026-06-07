import { db } from '../../config/db';
import { createMany as createNotifications } from '../notifications/notifications.service';
import type { PoolClient } from 'pg';

// ============================================================================
// Section schedule shape (post-2.6 refactor — FUTURE_FEATURES 2.6)
//
// A section has 1 OR 2 meetings per week, each with its own day + start + end.
// `day_of_week` is one of: Mon Tue Wed Thu Fri Sat Sun
// When two meetings share a day, they must be back-to-back (end of meeting 1
// == start of meeting 2) — enforced by a constraint trigger in the DB.
// ============================================================================

export const DAY_CODES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] as const;
export type DayCode = (typeof DAY_CODES)[number];

export interface Meeting {
  dayOfWeek: DayCode;
  startTime: string;   // 'HH:MM'
  endTime:   string;   // 'HH:MM'
}

/** Every section read attaches this aggregate of section_meetings rows. */
const SECTION_SELECT = `
  SELECT s.*,
    c.code  AS course_code,    c.title AS course_title, c.units AS course_units,
    t.name  AS term_name,      t.semester AS term_semester, t.is_active AS term_is_active,
    b.id    AS block_id_full,  b.year_level AS block_year_level, b.block_number,
    p.id    AS program_id,     p.code AS program_code, p.name AS program_name,
    u.full_name AS faculty_name, u.email AS faculty_email,
    p.code || ' ' || b.year_level || '-' || b.block_number AS block_label,
    COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
                'dayOfWeek', m.day_of_week,
                'startTime', to_char(m.start_time, 'HH24:MI'),
                'endTime',   to_char(m.end_time,   'HH24:MI')
              ) ORDER BY
                array_position(ARRAY['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], m.day_of_week),
                m.start_time)
       FROM section_meetings m WHERE m.section_id = s.id),
      '[]'::jsonb
    ) AS meetings
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
    `${SECTION_SELECT} ${where} ORDER BY p.code, b.year_level, b.block_number, c.code`,
    vals,
  );
  return rows;
}

export async function getSectionById(id: string) {
  const { rows } = await db.query(`${SECTION_SELECT} WHERE s.id = $1`, [id]);
  return rows[0] ?? null;
}

// ============================================================================
// Meetings array validation
// ============================================================================

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Reject obvious shape errors up front so we don't even hit the DB trigger.
 * Returns a friendly error string or null when OK.
 */
export function validateMeetings(meetings: Meeting[] | undefined | null): string | null {
  if (!meetings || meetings.length === 0) return null;   // TBA section — allowed
  if (meetings.length > 2) return 'A section can have at most 2 meetings per week.';

  for (const m of meetings) {
    if (!DAY_CODES.includes(m.dayOfWeek as DayCode)) return `Invalid day: ${m.dayOfWeek}`;
    if (!HHMM.test(m.startTime)) return `Invalid start time: ${m.startTime}`;
    if (!HHMM.test(m.endTime))   return `Invalid end time: ${m.endTime}`;
    if (m.startTime >= m.endTime) return `Meeting end (${m.endTime}) must be after start (${m.startTime}).`;
  }

  if (meetings.length === 2) {
    const [a, b] = [...meetings].sort((x, y) => x.startTime.localeCompare(y.startTime));
    if (a.dayOfWeek === b.dayOfWeek && a.endTime !== b.startTime) {
      return `Same-day meetings must be back-to-back. Meeting 1 ends at ${a.endTime}, Meeting 2 starts at ${b.startTime}.`;
    }
  }
  return null;
}

/** Replace ALL meetings for a section in one transaction. */
async function replaceMeetings(client: PoolClient, sectionId: string, meetings: Meeting[]) {
  await client.query(`DELETE FROM section_meetings WHERE section_id = $1`, [sectionId]);
  for (const m of meetings) {
    await client.query(
      `INSERT INTO section_meetings (section_id, day_of_week, start_time, end_time)
       VALUES ($1, $2, $3, $4)`,
      [sectionId, m.dayOfWeek, m.startTime, m.endTime],
    );
  }
}

// ============================================================================
// Create / update
// ============================================================================

export async function createSection(data: {
  blockId: string; courseId: string; termId: string;
  facultyId?: string;
  meetings?: Meeting[];
  room?: string; capacity?: number;
}) {
  const meetErr = validateMeetings(data.meetings);
  if (meetErr) throw Object.assign(new Error(meetErr), { status: 400 });

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

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO sections (block_id, course_id, term_id, faculty_id, section_code, room, capacity)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [data.blockId, data.courseId, data.termId, data.facultyId ?? null, sectionCode,
       data.room ?? null, capacity],
    );
    const sectionId = rows[0].id;
    if (data.meetings && data.meetings.length > 0) {
      await replaceMeetings(client, sectionId, data.meetings);
    }
    await client.query('COMMIT');
    return getSectionById(sectionId);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function updateSection(id: string, data: {
  facultyId?: string | null;
  meetings?: Meeting[];
  room?: string | null; capacity?: number;
}) {
  const meetErr = validateMeetings(data.meetings);
  if (meetErr) throw Object.assign(new Error(meetErr), { status: 400 });

  // Pull current state so we can compute the post-update snapshot for conflict checking.
  const { rows: cur } = await db.query(
    'SELECT term_id, faculty_id, room FROM sections WHERE id = $1',
    [id],
  );
  if (!cur[0]) throw Object.assign(new Error('Section not found'), { status: 404 });

  const curMeetings = await getMeetings(id);

  const mergedFacultyId: string | null =
    data.facultyId !== undefined ? data.facultyId : (cur[0].faculty_id as string | null);
  const mergedMeetings: Meeting[] =
    data.meetings !== undefined ? data.meetings : curMeetings;

  // ── Schedule conflict checks — only when the section has a complete assignment.
  if (mergedFacultyId && mergedMeetings.length > 0) {
    // 1. Clash with another section taught by this faculty in the same term.
    const clash = await findScheduleConflict({
      sectionId: id,
      facultyId: mergedFacultyId,
      termId:    cur[0].term_id as string,
      meetings:  mergedMeetings,
    });
    if (clash) {
      throw Object.assign(
        new Error(
          `Schedule conflict: faculty already teaches ${clash.sectionCode} on ` +
          `${clash.meeting.dayOfWeek} ${clash.meeting.startTime}–${clash.meeting.endTime}.`,
        ),
        { status: 409 },
      );
    }

    // 2. Faculty must be available to teach in this slot — and not during office hours.
    const avail = await checkAvailability({
      facultyId: mergedFacultyId,
      meetings:  mergedMeetings,
    });
    if (avail) {
      throw Object.assign(new Error(avail.message), { status: 409 });
    }
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const map: Record<string, string> = {
      facultyId: 'faculty_id', room: 'room', capacity: 'capacity',
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
    if (sets.length > 0) {
      vals.push(id);
      await client.query(
        `UPDATE sections SET ${sets.join(', ')} WHERE id = $${i}`,
        vals,
      );
    }
    if (data.meetings !== undefined) {
      await replaceMeetings(client, id, data.meetings);
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  const updated = await getSectionById(id);

  // ── Schedule-change notifications ───────────────────────────────────────────
  // Fire only when something a student/faculty would *care* about changed:
  // meetings/room/faculty. Capacity tweaks aren't schedule-relevant.
  if (updated) {
    const meetingsChanged = !meetingsEqual(curMeetings, await getMeetings(id));
    const facultyChanged  = String(cur[0].faculty_id ?? '') !== String(updated.faculty_id ?? '');
    const roomChanged     = String(cur[0].room ?? '')       !== String(updated.room ?? '');

    if (meetingsChanged || facultyChanged || roomChanged) {
      const courseTitle = updated.course_title ?? 'Your section';
      const sectionCode = updated.section_code ?? '';
      const when = (updated.meetings as Meeting[]).length > 0
        ? (updated.meetings as Meeting[]).map(m => `${m.dayOfWeek} ${m.startTime}–${m.endTime}`).join(', ')
        : 'TBA';
      const where = updated.room ?? 'TBA';

      const recipients = await db.query(
        `SELECT u.id AS user_id, u.role
         FROM enrollments e JOIN users u ON u.id = e.student_id
         WHERE e.section_id = $1 AND e.status = 'enrolled'
         UNION
         SELECT u.id AS user_id, u.role
         FROM sections s JOIN users u ON u.id = s.faculty_id
         WHERE s.id = $1`,
        [id],
      );

      const changed: string[] = [];
      if (meetingsChanged) changed.push('meetings');
      if (facultyChanged)  changed.push('faculty_id');
      if (roomChanged)     changed.push('room');

      await createNotifications(
        recipients.rows.map((r: { user_id: string; role: string }) => ({
          userId: r.user_id,
          kind:   'schedule_changed',
          title:  'Schedule updated',
          body:   `${courseTitle}${sectionCode ? ` (${sectionCode})` : ''} — now ${when}, ${where}.`,
          link:   r.role === 'faculty' ? `/faculty/sections/${id}` : '/student/schedule',
          data:   { sectionId: id, changed },
        })),
      );
    }
  }

  return updated;
}

// ============================================================================
// Schedule overlap helpers (shared with auto-assigner)
// ============================================================================

export async function getMeetings(sectionId: string): Promise<Meeting[]> {
  const { rows } = await db.query(
    `SELECT day_of_week,
            to_char(start_time,'HH24:MI') AS start_time,
            to_char(end_time,  'HH24:MI') AS end_time
       FROM section_meetings WHERE section_id = $1
       ORDER BY day_of_week, start_time`,
    [sectionId],
  );
  return rows.map(r => ({
    dayOfWeek: r.day_of_week, startTime: r.start_time, endTime: r.end_time,
  }));
}

function meetingsEqual(a: Meeting[], b: Meeting[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => `${x.dayOfWeek}${x.startTime}`.localeCompare(`${y.dayOfWeek}${y.startTime}`));
  const sb = [...b].sort((x, y) => `${x.dayOfWeek}${x.startTime}`.localeCompare(`${y.dayOfWeek}${y.startTime}`));
  return sa.every((m, i) => m.dayOfWeek === sb[i].dayOfWeek && m.startTime === sb[i].startTime && m.endTime === sb[i].endTime);
}

function overlaps(a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }): boolean {
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

/**
 * Returns the FIRST overlap (other section + which meeting) for `facultyId`
 * in `termId` against the proposed meeting list, or null when there's no clash.
 */
async function findScheduleConflict(opts: {
  sectionId: string;
  facultyId: string;
  termId: string;
  meetings: Meeting[];
}): Promise<{ sectionCode: string; meeting: Meeting } | null> {
  const { rows } = await db.query(
    `SELECT s.id, s.section_code,
            m.day_of_week,
            to_char(m.start_time,'HH24:MI') AS start_time,
            to_char(m.end_time,  'HH24:MI') AS end_time
       FROM sections         s
       JOIN section_meetings m ON m.section_id = s.id
      WHERE s.faculty_id = $1 AND s.term_id = $2 AND s.id <> $3`,
    [opts.facultyId, opts.termId, opts.sectionId],
  );
  for (const r of rows) {
    const otherMeet: Meeting = { dayOfWeek: r.day_of_week, startTime: r.start_time, endTime: r.end_time };
    for (const newMeet of opts.meetings) {
      if (newMeet.dayOfWeek === otherMeet.dayOfWeek && overlaps(newMeet, otherMeet)) {
        return { sectionCode: r.section_code, meeting: otherMeet };
      }
    }
  }
  return null;
}

/**
 * Validate that the proposed meetings fit the faculty's declared weekly
 * availability:
 *   • Each meeting must lie inside at least one `teaching` slot for its day.
 *   • No meeting may overlap any `office_hour` slot.
 *
 * Returns null if all good, or { message } if a rule fails. Skipped entirely
 * when the faculty has no availability rows yet (admin can still assign).
 */
async function checkAvailability(opts: {
  facultyId: string;
  meetings: Meeting[];
}): Promise<{ message: string } | null> {
  const { rows: slots } = await db.query(
    `SELECT day_of_week,
            to_char(start_time,'HH24:MI') AS start_time,
            to_char(end_time,  'HH24:MI') AS end_time,
            kind
       FROM faculty_availability
      WHERE faculty_id = $1`,
    [opts.facultyId],
  );
  if (slots.length === 0) return null;

  for (const m of opts.meetings) {
    const dayMatch = (s: { day_of_week: string }) => parseDays(s.day_of_week).includes(m.dayOfWeek);

    const teaching = slots.filter((s: { kind: string }) => s.kind === 'teaching').filter(dayMatch);
    const covered = teaching.some(
      (s: { start_time: string; end_time: string }) =>
        s.start_time <= m.startTime && s.end_time >= m.endTime,
    );
    if (!covered) {
      return { message: `Faculty is not available to teach ${m.startTime}–${m.endTime} on ${m.dayOfWeek}. Update their teaching availability first.` };
    }

    const office = slots.filter((s: { kind: string }) => s.kind === 'office_hour').filter(dayMatch);
    const overlap = office.find(
      (s: { start_time: string; end_time: string }) =>
        s.start_time < m.endTime && s.end_time > m.startTime,
    );
    if (overlap) {
      return { message: `Conflicts with faculty's office hours on ${m.dayOfWeek} (${overlap.start_time}–${overlap.end_time}).` };
    }
  }
  return null;
}

/**
 * Parse a legacy/availability day string (still used by faculty_availability
 * which stores compact tokens like 'MWF', 'TTh', 'SunSat'). Returns the
 * canonical 3-letter codes our meetings model uses.
 */
export function parseDays(s: string): DayCode[] {
  let rest = s.replace(/\s+/g, '');
  const out = new Set<DayCode>();
  while (/sun/i.test(rest)) { out.add('Sun'); rest = rest.replace(/sun/i, ''); }
  while (/sat/i.test(rest)) { out.add('Sat'); rest = rest.replace(/sat/i, ''); }
  while (/th/i.test(rest))  { out.add('Thu'); rest = rest.replace(/th/i,  ''); }
  for (const c of rest.toUpperCase()) {
    if (c === 'M') out.add('Mon');
    else if (c === 'T') out.add('Tue');
    else if (c === 'W') out.add('Wed');
    else if (c === 'F') out.add('Fri');
  }
  return [...out];
}
