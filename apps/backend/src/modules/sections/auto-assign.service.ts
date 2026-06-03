/**
 * Auto-assign faculty + schedule to TBA sections in a term.
 *
 * Approach: weighted greedy with constraint-tightness ordering.
 *   1. Build candidate (section, faculty, day-pattern, time-window) tuples
 *      that satisfy every HARD constraint (qualification, availability,
 *      load cap).
 *   2. Sort sections by candidate count ASC so the most-constrained sections
 *      get first pick of scarce resources (avoids paint-yourself-into-corner
 *      failures).
 *   3. For each section, pick the highest-scoring candidate. Soft constraints
 *      (preference rating, load balance, strategy-specific day grouping) feed
 *      the score.
 *   4. Lock the chosen slot — subsequent candidates that would overlap it for
 *      the same faculty are removed from the pool.
 *
 * The result is a list of proposals the caller can preview before applying.
 */

import { db } from '../../config/db';
import { parseDays } from './sections.service';

export type Strategy = 'balanced' | 'prefer-grouped-days' | 'prefer-mornings';

export interface AssignmentProposal {
  sectionId:   string;
  sectionCode: string;
  courseCode:  string;
  courseTitle: string;
  units:       number;
  blockLabel:  string;
  // null faculty + null schedule means we couldn't find any assignment.
  facultyId:   string | null;
  facultyName: string | null;
  dayOfWeek:   string | null;
  startTime:   string | null;
  endTime:     string | null;
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

/** Candidate session lengths in minutes. The algorithm tries each. */
const SESSION_LENGTHS_MIN = [90, 60, 120, 180];

/**
 * Day-pattern templates. Mapped per units to a list of (#sessions, day-pattern)
 * pairs the algorithm will try. PH standard: 3-unit lecture = MWF 1h each OR
 * TTh 1.5h each.
 */
function patternsFor(units: number): Array<{ days: string; sessions: number }> {
  if (units <= 1) return [{ days: 'M', sessions: 1 }, { days: 'T', sessions: 1 }];
  if (units === 2) return [{ days: 'TTh', sessions: 2 }, { days: 'MW', sessions: 2 }];
  if (units === 3) return [{ days: 'MWF', sessions: 3 }, { days: 'TTh', sessions: 2 }];
  if (units === 4) return [{ days: 'TTh', sessions: 2 }, { days: 'MWF', sessions: 3 }];
  // 5+ units: spread on MWF or stretch on TTh
  return [{ days: 'MWF', sessions: 3 }, { days: 'TTh', sessions: 2 }];
}

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
 * True iff the given window lies inside *some* teaching slot for every day
 * required by `dayPattern`, AND doesn't overlap any office_hour slot on those
 * days.
 */
function windowFitsAvailability(
  slots: AvailabilitySlot[],
  dayPattern: string,
  startTime: string,
  endTime: string,
): boolean {
  const days = parseDays(dayPattern);
  const startM = toMin(startTime);
  const endM   = toMin(endTime);

  for (const day of days) {
    const teaching = slots.filter(s => s.kind === 'teaching' && parseDays(s.day_of_week).includes(day));
    const insideSome = teaching.some(s => toMin(s.start_time) <= startM && toMin(s.end_time) >= endM);
    if (!insideSome) return false;

    const office = slots.filter(s => s.kind === 'office_hour' && parseDays(s.day_of_week).includes(day));
    const overlaps = office.some(s => toMin(s.start_time) < endM && toMin(s.end_time) > startM);
    if (overlaps) return false;
  }
  return true;
}

/** Day-set overlap test. */
function daysOverlap(a: string, b: string): boolean {
  const da = parseDays(a);
  const db = parseDays(b);
  return da.some(d => db.includes(d));
}

interface OccupiedSlot { dayOfWeek: string; startTime: string; endTime: string }

/** True iff (day, start, end) overlaps any already-locked slot for this faculty. */
function clashesWithLocked(
  locked: OccupiedSlot[],
  dayOfWeek: string,
  startTime: string,
  endTime: string,
): boolean {
  const startM = toMin(startTime);
  const endM   = toMin(endTime);
  return locked.some(s => {
    if (!daysOverlap(s.dayOfWeek, dayOfWeek)) return false;
    const sStart = toMin(s.startTime);
    const sEnd   = toMin(s.endTime);
    return sStart < endM && sEnd > startM;
  });
}

// ─── Main algorithm ──────────────────────────────────────────────────────────

export async function runAutoAssign(opts: AutoAssignOptions): Promise<AutoAssignResult> {
  // ── 1. Load sections that need work ────────────────────────────────────
  const { rows: sectionRows } = await db.query(
    `SELECT s.id, s.section_code, s.faculty_id,
            s.day_of_week, s.start_time::text AS start_time, s.end_time::text AS end_time, s.room,
            c.id AS course_id, c.code AS course_code, c.title AS course_title, c.units,
            p.code || ' ' || b.year_level || '-' || b.block_number AS block_label
     FROM sections s
     JOIN courses c  ON c.id = s.course_id
     JOIN blocks  b  ON b.id = s.block_id
     JOIN programs p ON p.id = b.program_id
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

  // Filter to TBA sections only (default behaviour). If `onlyTba=false`, every
  // section is open for re-assignment — useful as a "wipe and re-fill" pass.
  const targetSections = opts.onlyTba
    ? sectionRows.filter((s: { faculty_id: string | null }) => !s.faculty_id)
    : sectionRows;

  // ── 2. Load faculty + qualifications + availability + load cap ────────
  const { rows: facultyRows } = await db.query(
    `SELECT u.id, u.full_name, u.max_teaching_units
     FROM users u
     WHERE u.role = 'faculty' AND u.is_active = TRUE`,
  );

  const { rows: qualRows } = await db.query(
    `SELECT fq.faculty_id, fq.course_id, fq.preference
     FROM faculty_qualifications fq
     JOIN users u ON u.id = fq.faculty_id
     WHERE u.is_active = TRUE`,
  );

  const { rows: availRows } = await db.query(
    `SELECT fa.faculty_id, fa.day_of_week,
            fa.start_time::text AS start_time, fa.end_time::text AS end_time, fa.kind
     FROM faculty_availability fa
     JOIN users u ON u.id = fa.faculty_id
     WHERE u.is_active = TRUE`,
  );

  // ── 3. Index those for fast lookup ────────────────────────────────────
  type FacultyMeta = {
    id: string; name: string;
    maxUnits: number | null;
    qualByCourse: Map<string, number>;        // course_id → preference (1–5)
    availability: AvailabilitySlot[];
    locked:       OccupiedSlot[];             // grows as we assign
    unitsTaken:   number;                      // current load in this term
  };
  const faculty = new Map<string, FacultyMeta>(facultyRows.map((f: any) => [f.id, {
    id:           f.id,
    name:         f.full_name,
    maxUnits:     f.max_teaching_units,
    qualByCourse: new Map(),
    availability: [],
    locked:       [],
    unitsTaken:   0,
  }]));
  for (const q of qualRows) {
    const m = faculty.get(q.faculty_id);
    if (m) m.qualByCourse.set(q.course_id, q.preference);
  }
  for (const a of availRows) {
    const m = faculty.get(a.faculty_id);
    if (m) m.availability.push(a);
  }

  // Seed `locked` + `unitsTaken` from existing assignments in this term.
  // (For sections we're keeping as-is, we still need to block their slot so we
  // don't double-book the faculty.)
  for (const s of sectionRows) {
    if (s.faculty_id && s.day_of_week && s.start_time && s.end_time) {
      const m = faculty.get(s.faculty_id);
      if (m) {
        m.locked.push({
          dayOfWeek: s.day_of_week,
          startTime: String(s.start_time).slice(0, 5),
          endTime:   String(s.end_time).slice(0, 5),
        });
        m.unitsTaken += Number(s.units || 0);
      }
    }
  }

  // ── 4. Build candidate list per section ───────────────────────────────
  interface Candidate {
    facultyId:   string;
    facultyName: string;
    dayOfWeek:   string;
    startTime:   string;
    endTime:     string;
    preference:  number;
    facultyMeta: FacultyMeta;
  }

  function candidatesFor(section: any): Candidate[] {
    const out: Candidate[] = [];
    const units = Number(section.units);
    const patterns = patternsFor(units);

    for (const fac of faculty.values()) {
      const pref = fac.qualByCourse.get(section.course_id);
      if (pref === undefined) continue;                              // not qualified
      if (fac.maxUnits != null && fac.unitsTaken + units > fac.maxUnits) continue;  // over cap
      if (fac.availability.filter(a => a.kind === 'teaching').length === 0) continue;

      for (const pat of patterns) {
        const sessionMinutes = Math.round((units * 60) / pat.sessions);
        // Round to nearest 15 to keep human-readable times.
        const roundedMinutes = Math.max(60, Math.round(sessionMinutes / 15) * 15);
        const lengths = roundedMinutes === sessionMinutes
          ? [roundedMinutes]
          : [roundedMinutes, ...SESSION_LENGTHS_MIN.filter(l => l !== roundedMinutes)];

        for (const len of lengths) {
          for (const start of START_TIMES) {
            const end = toHHMM(toMin(start) + len);
            if (toMin(end) > toMin('21:00')) continue;
            if (!windowFitsAvailability(fac.availability, pat.days, start, end)) continue;
            if (clashesWithLocked(fac.locked, pat.days, start, end)) continue;
            out.push({
              facultyId:   fac.id,
              facultyName: fac.name,
              dayOfWeek:   pat.days,
              startTime:   start,
              endTime:     end,
              preference:  pref,
              facultyMeta: fac,
            });
            // One length is enough per (faculty, pattern, start) — we don't want
            // to flood the pool with near-identical options.
            break;
          }
        }
      }
    }
    return out;
  }

  // ── 5. Score candidates ───────────────────────────────────────────────
  function score(c: Candidate, section: any): number {
    let s = 0;

    // Preference: pref 1 → +50, pref 5 → +10
    s += (6 - c.preference) * 10;

    // Load balance: faculty that have room get a small boost so we don't
    // pile every section on the same person.
    if (c.facultyMeta.maxUnits != null) {
      const remaining = c.facultyMeta.maxUnits - c.facultyMeta.unitsTaken;
      s += Math.min(20, remaining);                  // capped at +20
    }

    // Strategy-specific
    if (opts.strategy === 'prefer-grouped-days' && /MWF|TTh/.test(c.dayOfWeek)) {
      s += 8;
    }
    if (opts.strategy === 'prefer-mornings' && toMin(c.startTime) <= toMin('11:00')) {
      s += 8;
    }
    if (opts.strategy === 'balanced' && c.facultyMeta.maxUnits != null) {
      const utilPct = (c.facultyMeta.unitsTaken + Number(section.units)) / c.facultyMeta.maxUnits;
      // Reward 60–80% utilization (sweet spot), penalize >90%.
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
    // Re-filter `locked` per-iteration since other proposals may have
    // claimed slots since this candidate list was built.
    const live = candidates
      .filter(c => !clashesWithLocked(c.facultyMeta.locked, c.dayOfWeek, c.startTime, c.endTime))
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
        dayOfWeek:   null,
        startTime:   null,
        endTime:     null,
        room:        section.room ?? null,
        score:       0,
        reason:      candidates.length === 0
          ? 'No qualified faculty (or none have availability matching this section).'
          : 'All compatible faculty would clash with their other assignments.',
      });
      continue;
    }

    const scored = live.map(c => ({ c, s: score(c, section) }));
    scored.sort((a, b) => b.s - a.s);
    const winner = scored[0];

    // Lock this slot in the winner's state.
    winner.c.facultyMeta.locked.push({
      dayOfWeek: winner.c.dayOfWeek,
      startTime: winner.c.startTime,
      endTime:   winner.c.endTime,
    });
    winner.c.facultyMeta.unitsTaken += Number(section.units);

    proposals.push({
      sectionId:   section.id,
      sectionCode: section.section_code,
      courseCode:  section.course_code,
      courseTitle: section.course_title,
      units:       Number(section.units),
      blockLabel:  section.block_label,
      facultyId:   winner.c.facultyId,
      facultyName: winner.c.facultyName,
      dayOfWeek:   winner.c.dayOfWeek,
      startTime:   winner.c.startTime,
      endTime:     winner.c.endTime,
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
  const fillable = proposals.filter(p => p.facultyId && p.dayOfWeek && p.startTime && p.endTime);
  if (fillable.length === 0) return { applied: 0, skipped: proposals.length };

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const p of fillable) {
      await client.query(
        `UPDATE sections
         SET faculty_id  = $1,
             day_of_week = $2,
             start_time  = $3,
             end_time    = $4
         WHERE id = $5`,
        [p.facultyId, p.dayOfWeek, p.startTime, p.endTime, p.sectionId],
      );
      await client.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value)
         VALUES ($1, 'AUTO_ASSIGN_SECTION', 'sections', $2, $3)`,
        [adminId, p.sectionId, JSON.stringify({
          facultyId:  p.facultyId,
          dayOfWeek:  p.dayOfWeek,
          startTime:  p.startTime,
          endTime:    p.endTime,
        })],
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
