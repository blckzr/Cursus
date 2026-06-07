/**
 * Auto-assign faculty + schedule to TBA sections in a term.
 *
 * Post-2.6: sections now use the `section_meetings` model. The auto-assigner
 * enumerates candidates as 1-meeting or 2-meeting templates based on
 * `curriculum_courses.meetings_per_week` for the (program, course, semester)
 * the section belongs to. Standard 2-meeting pairs: Mon+Thu, Tue+Fri,
 * Wed+Sat. 1-meeting candidates lead with Sun so NSTP-style courses prefer it.
 */

import { db } from '../../config/db';
import { parseDays, type DayCode, type Meeting } from './sections.service';

export type Strategy = 'balanced' | 'prefer-grouped-days' | 'prefer-mornings';

export interface AssignmentProposal {
  sectionId:   string;
  sectionCode: string;
  courseCode:  string;
  courseTitle: string;
  units:       number;
  blockLabel:  string;
  // null faculty means we couldn't find any assignment.
  facultyId:   string | null;
  facultyName: string | null;
  meetings:    Meeting[];           // empty when unfilled
  room:        string | null;
  score:       number;
  reason:      string;
}

export interface AutoAssignResult {
  proposals: AssignmentProposal[];
  summary: {
    total:        number;
    filled:       number;
    unfilled:     number;
    facultyUsed:  number;
    avgScore:     number;
  };
}

export interface AutoAssignOptions {
  termId:   string;
  strategy: Strategy;
  /** When true, leave sections that already have a faculty alone. Default true. */
  onlyTba:  boolean;
}

// ─── Tunables ────────────────────────────────────────────────────────────────

/** Standard 2-meeting day pairs (institutional policy). */
const STANDARD_PAIRS: [DayCode, DayCode][] = [
  ['Mon', 'Thu'],
  ['Tue', 'Fri'],
  ['Wed', 'Sat'],
];

/** 1-meeting day candidates — Sun-first so NSTP-style courses gravitate there. */
const SINGLE_DAYS: DayCode[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Session-grid start times (hour granularity, 7am to 5pm). */
const START_TIMES = [
  '07:00', '08:00', '09:00', '10:00', '11:00',
  '13:00', '14:00', '15:00', '16:00', '17:00',
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function toHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface AvailabilitySlot {
  day_of_week: string;
  start_time:  string;
  end_time:    string;
  kind:        'teaching' | 'office_hour';
}

/**
 * Per-meeting availability check: the meeting must lie inside some teaching
 * slot for its day, and must not overlap any office-hour slot on that day.
 */
function meetingFitsAvailability(
  slots: AvailabilitySlot[],
  m: Meeting,
): boolean {
  const teaching = slots.filter(s => s.kind === 'teaching' && parseDays(s.day_of_week).includes(m.dayOfWeek));
  if (!teaching.some(s => toMin(s.start_time) <= toMin(m.startTime) && toMin(s.end_time) >= toMin(m.endTime))) {
    return false;
  }
  const office = slots.filter(s => s.kind === 'office_hour' && parseDays(s.day_of_week).includes(m.dayOfWeek));
  if (office.some(s => toMin(s.start_time) < toMin(m.endTime) && toMin(s.end_time) > toMin(m.startTime))) {
    return false;
  }
  return true;
}

interface OccupiedSlot { dayOfWeek: DayCode; startTime: string; endTime: string }

function meetingClashesWithLocked(locked: OccupiedSlot[], m: Meeting): boolean {
  return locked.some(s => {
    if (s.dayOfWeek !== m.dayOfWeek) return false;
    return toMin(s.startTime) < toMin(m.endTime) && toMin(s.endTime) > toMin(m.startTime);
  });
}

function anyMeetingClashes(locked: OccupiedSlot[], meetings: Meeting[]): boolean {
  return meetings.some(m => meetingClashesWithLocked(locked, m));
}

// ─── Main algorithm ──────────────────────────────────────────────────────────

export async function runAutoAssign(opts: AutoAssignOptions): Promise<AutoAssignResult> {
  // ── 1. Load sections that need work, plus their meetings_per_week from curriculum ──
  const { rows: sectionRows } = await db.query(
    `SELECT s.id, s.section_code, s.faculty_id, s.block_id, s.room,
            c.id AS course_id, c.code AS course_code, c.title AS course_title, c.units,
            p.code || ' ' || b.year_level || '-' || b.block_number AS block_label,
            COALESCE(cc.meetings_per_week, 2) AS meetings_per_week,
            COALESCE(
              (SELECT jsonb_agg(jsonb_build_object(
                        'dayOfWeek', m.day_of_week,
                        'startTime', to_char(m.start_time, 'HH24:MI'),
                        'endTime',   to_char(m.end_time,   'HH24:MI'))
                      ORDER BY m.day_of_week, m.start_time)
               FROM section_meetings m WHERE m.section_id = s.id),
              '[]'::jsonb
            ) AS meetings
       FROM sections s
       JOIN courses  c ON c.id = s.course_id
       JOIN blocks   b ON b.id = s.block_id
       JOIN programs p ON p.id = b.program_id
       JOIN terms    t ON t.id = s.term_id
       LEFT JOIN curriculum_courses cc
         ON cc.program_id = b.program_id
        AND cc.course_id  = s.course_id
        AND cc.year_level = b.year_level
        AND cc.semester   = t.semester
      WHERE s.term_id = $1
      ORDER BY c.units DESC, c.code`,
    [opts.termId],
  );
  if (sectionRows.length === 0) {
    return {
      proposals: [],
      summary:   { total: 0, filled: 0, unfilled: 0, facultyUsed: 0, avgScore: 0 },
    };
  }

  const targetSections = opts.onlyTba
    ? sectionRows.filter((s: { faculty_id: string | null }) => !s.faculty_id)
    : sectionRows;

  // ── 2. Load faculty + qualifications + availability + load cap ────────
  const { rows: facultyRows } = await db.query(
    `SELECT u.id, u.full_name, u.max_teaching_units
       FROM users u WHERE u.role = 'faculty' AND u.is_active = TRUE`,
  );
  const { rows: qualRows } = await db.query(
    `SELECT fq.faculty_id, fq.course_id, fq.preference
       FROM faculty_qualifications fq
       JOIN users u ON u.id = fq.faculty_id WHERE u.is_active = TRUE`,
  );
  const { rows: availRows } = await db.query(
    `SELECT fa.faculty_id, fa.day_of_week,
            to_char(fa.start_time,'HH24:MI') AS start_time,
            to_char(fa.end_time,  'HH24:MI') AS end_time, fa.kind
       FROM faculty_availability fa
       JOIN users u ON u.id = fa.faculty_id WHERE u.is_active = TRUE`,
  );

  // ── 3. Index for fast lookup ───────────────────────────────────────────
  type FacultyMeta = {
    id: string; name: string;
    maxUnits: number | null;
    qualByCourse: Map<string, number>;
    availability: AvailabilitySlot[];
    locked:       OccupiedSlot[];
    unitsTaken:   number;
  };
  const faculty = new Map<string, FacultyMeta>(facultyRows.map((f: any) => [f.id, {
    id: f.id, name: f.full_name, maxUnits: f.max_teaching_units,
    qualByCourse: new Map(), availability: [], locked: [], unitsTaken: 0,
  }]));
  for (const q of qualRows) {
    const m = faculty.get(q.faculty_id);
    if (m) m.qualByCourse.set(q.course_id, q.preference);
  }
  for (const a of availRows) {
    const m = faculty.get(a.faculty_id);
    if (m) m.availability.push(a);
  }

  // Per-block lock list. A block can't physically attend two classes
  // at once even if they're taught by different faculty.
  const blockLocked = new Map<string, OccupiedSlot[]>();

  // Seed locked + units + blockLocked from existing assignments.
  for (const s of sectionRows) {
    const meetings: Meeting[] = s.meetings as Meeting[];
    if (s.faculty_id && meetings.length > 0) {
      const m = faculty.get(s.faculty_id);
      if (m) {
        for (const meet of meetings) {
          m.locked.push({ dayOfWeek: meet.dayOfWeek, startTime: meet.startTime, endTime: meet.endTime });
        }
        m.unitsTaken += Number(s.units || 0);
      }
    }
    if (s.block_id && meetings.length > 0) {
      const list = blockLocked.get(s.block_id) ?? [];
      for (const meet of meetings) {
        list.push({ dayOfWeek: meet.dayOfWeek, startTime: meet.startTime, endTime: meet.endTime });
      }
      blockLocked.set(s.block_id, list);
    }
  }

  // ── 4. Build candidate list per section ───────────────────────────────
  interface Candidate {
    facultyId:   string;
    facultyName: string;
    meetings:    Meeting[];
    preference:  number;
    facultyMeta: FacultyMeta;
  }

  function buildMeetingTemplates(meetingsPerWeek: number, units: number): Meeting[][] {
    // Total contact time per week scales with units (PH norm: 1 hr / unit / week).
    // Round to a 30-min boundary, floor at 60 min.
    const totalMin = Math.max(60, Math.round(units * 60 / 30) * 30);
    const out: Meeting[][] = [];

    if (meetingsPerWeek === 1) {
      // Single meeting: total minutes per session.
      for (const day of SINGLE_DAYS) {
        for (const start of START_TIMES) {
          const end = toHHMM(toMin(start) + totalMin);
          if (toMin(end) > toMin('21:00')) continue;
          out.push([{ dayOfWeek: day, startTime: start, endTime: end }]);
        }
      }
    } else {
      // Two meetings, equal length, on standard pair days.
      const perMin = Math.max(60, Math.round(totalMin / 2 / 30) * 30);
      for (const [d1, d2] of STANDARD_PAIRS) {
        for (const start of START_TIMES) {
          const end = toHHMM(toMin(start) + perMin);
          if (toMin(end) > toMin('21:00')) continue;
          out.push([
            { dayOfWeek: d1, startTime: start, endTime: end },
            { dayOfWeek: d2, startTime: start, endTime: end },
          ]);
        }
      }
    }
    return out;
  }

  function candidatesFor(section: any): Candidate[] {
    const out: Candidate[] = [];
    const units = Number(section.units);
    const mpw = Number(section.meetings_per_week) === 1 ? 1 : 2;
    const templates = buildMeetingTemplates(mpw, units);
    const ownBlockLocks = blockLocked.get(section.block_id) ?? [];

    for (const fac of faculty.values()) {
      const pref = fac.qualByCourse.get(section.course_id);
      if (pref === undefined) continue;                              // not qualified
      if (fac.maxUnits != null && fac.unitsTaken + units > fac.maxUnits) continue;
      if (fac.availability.filter(a => a.kind === 'teaching').length === 0) continue;

      for (const meetings of templates) {
        const fits = meetings.every(m => meetingFitsAvailability(fac.availability, m));
        if (!fits) continue;
        if (anyMeetingClashes(fac.locked, meetings)) continue;
        if (anyMeetingClashes(ownBlockLocks, meetings)) continue;

        out.push({
          facultyId:   fac.id,
          facultyName: fac.name,
          meetings,
          preference:  pref,
          facultyMeta: fac,
        });
      }
    }
    return out;
  }

  // ── 5. Score candidates ───────────────────────────────────────────────
  function score(c: Candidate, section: any): number {
    let s = 0;

    s += (6 - c.preference) * 10;     // preference 1→+50, 5→+10

    if (c.facultyMeta.maxUnits != null) {
      const remaining = c.facultyMeta.maxUnits - c.facultyMeta.unitsTaken;
      s += Math.min(20, remaining);
    }

    // Strategy bumps
    const firstStart = c.meetings[0]?.startTime ?? '08:00';
    const onStandardPair = c.meetings.length === 2 &&
      STANDARD_PAIRS.some(([a, b]) =>
        c.meetings.some(m => m.dayOfWeek === a) && c.meetings.some(m => m.dayOfWeek === b));

    if (opts.strategy === 'prefer-grouped-days' && onStandardPair) s += 8;
    if (opts.strategy === 'prefer-mornings' && toMin(firstStart) <= toMin('11:00')) s += 8;
    if (opts.strategy === 'balanced' && c.facultyMeta.maxUnits != null) {
      const utilPct = (c.facultyMeta.unitsTaken + Number(section.units)) / c.facultyMeta.maxUnits;
      if (utilPct >= 0.6 && utilPct <= 0.8) s += 6;
      if (utilPct > 0.9) s -= 6;
    }
    return s;
  }

  // ── 6. Sort sections by candidate-count ASC (tightest first) ──────────
  const withCandidates = targetSections.map((section: any) => ({
    section,
    candidates: candidatesFor(section),
  }));
  withCandidates.sort((a, b) => a.candidates.length - b.candidates.length);

  // ── 7. Greedy assignment ──────────────────────────────────────────────
  const proposals: AssignmentProposal[] = [];

  for (const { section, candidates } of withCandidates) {
    const ownBlockLocks = blockLocked.get(section.block_id) ?? [];
    const live = candidates
      .filter(c => !anyMeetingClashes(c.facultyMeta.locked, c.meetings))
      .filter(c => !anyMeetingClashes(ownBlockLocks,        c.meetings))
      .filter(c => c.facultyMeta.maxUnits == null || c.facultyMeta.unitsTaken + Number(section.units) <= c.facultyMeta.maxUnits);

    if (live.length === 0) {
      proposals.push({
        sectionId:   section.id,
        sectionCode: section.section_code,
        courseCode:  section.course_code,
        courseTitle: section.course_title,
        units:       Number(section.units),
        blockLabel:  section.block_label,
        facultyId:   null,
        facultyName: null,
        meetings:    [],
        room:        section.room ?? null,
        score:       0,
        reason:      candidates.length === 0
          ? 'No qualified faculty (or none have availability matching this section).'
          : 'All compatible faculty would clash with the faculty\'s or block\'s other assignments.',
      });
      continue;
    }

    const scored = live.map(c => ({ c, s: score(c, section) }));
    scored.sort((a, b) => b.s - a.s);
    const winner = scored[0];

    for (const meet of winner.c.meetings) {
      winner.c.facultyMeta.locked.push({ dayOfWeek: meet.dayOfWeek, startTime: meet.startTime, endTime: meet.endTime });
    }
    winner.c.facultyMeta.unitsTaken += Number(section.units);

    const blockList = blockLocked.get(section.block_id) ?? [];
    for (const meet of winner.c.meetings) {
      blockList.push({ dayOfWeek: meet.dayOfWeek, startTime: meet.startTime, endTime: meet.endTime });
    }
    blockLocked.set(section.block_id, blockList);

    proposals.push({
      sectionId:   section.id,
      sectionCode: section.section_code,
      courseCode:  section.course_code,
      courseTitle: section.course_title,
      units:       Number(section.units),
      blockLabel:  section.block_label,
      facultyId:   winner.c.facultyId,
      facultyName: winner.c.facultyName,
      meetings:    winner.c.meetings,
      room:        section.room ?? null,
      score:       winner.s,
      reason:      `Preference ${winner.c.preference}/5${live.length > 1 ? ` · ${live.length} options` : ''}`,
    });
  }

  const filled = proposals.filter(p => p.facultyId);
  const facultiesUsed = new Set(filled.map(p => p.facultyId)).size;
  const avgScore = filled.length === 0
    ? 0
    : Math.round(filled.reduce((s, p) => s + p.score, 0) / filled.length);

  return {
    proposals,
    summary: {
      total:       proposals.length,
      filled:      filled.length,
      unfilled:    proposals.length - filled.length,
      facultyUsed: facultiesUsed,
      avgScore,
    },
  };
}

// ─── Apply ───────────────────────────────────────────────────────────────────

/**
 * Persist a proposal list as section updates. Skips unfilled proposals.
 * Wraps everything in a transaction so a single bad row doesn't leave the
 * section table half-updated.
 */
export async function applyProposals(
  proposals: AssignmentProposal[],
  adminId: string,
): Promise<{ applied: number; skipped: number }> {
  const fillable = proposals.filter(p => p.facultyId && p.meetings.length > 0);
  if (fillable.length === 0) return { applied: 0, skipped: proposals.length };

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const p of fillable) {
      await client.query(`UPDATE sections SET faculty_id = $1 WHERE id = $2`,
        [p.facultyId, p.sectionId]);
      await client.query(`DELETE FROM section_meetings WHERE section_id = $1`, [p.sectionId]);
      for (const m of p.meetings) {
        await client.query(
          `INSERT INTO section_meetings (section_id, day_of_week, start_time, end_time)
           VALUES ($1, $2, $3, $4)`,
          [p.sectionId, m.dayOfWeek, m.startTime, m.endTime],
        );
      }
      await client.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value)
         VALUES ($1, 'AUTO_ASSIGN_SECTION', 'sections', $2, $3)`,
        [adminId, p.sectionId, JSON.stringify({ facultyId: p.facultyId, meetings: p.meetings })],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  return { applied: fillable.length, skipped: proposals.length - fillable.length };
}
