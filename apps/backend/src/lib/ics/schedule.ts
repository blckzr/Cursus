/**
 * Hand-rolled iCalendar export of a student's weekly class schedule.
 *
 * The format is small enough (a couple of dozen lines per event) that
 * pulling in a dependency isn't worth it. The output is anchored in
 * `Asia/Manila` via a single VTIMEZONE block, and each section emits one
 * VEVENT per meeting day with a WEEKLY recurrence rule bounded by the
 * term's `end_date`.
 *
 * Spec refs:
 *   • RFC 5545 — Internet Calendaring and Scheduling Core Object Specification
 *   • RFC 7986 — New properties for VCALENDAR (X-WR-CALNAME)
 *
 * Notes:
 *   • Sections without `day_of_week / start_time / end_time` are skipped
 *     silently — TBA slots wouldn't render anywhere useful.
 *   • Holidays aren't excluded; the SIS doesn't model them yet. Most users
 *     mute individual occurrences in their calendar app.
 */

import { parseDays } from '../../modules/sections/sections.service';

export interface CorScheduleEnrollment {
  enrollmentId: string;
  courseCode:   string;
  courseTitle:  string;
  sectionCode:  string;
  dayOfWeek:    string | null;
  startTime:    string | null;            // 'HH:MM' or 'HH:MM:SS'
  endTime:      string | null;
  room:         string | null;
  facultyName:  string | null;
}

export interface IcsBuildInput {
  studentCode:  string | null;
  studentName:  string;
  termName:     string;
  termStart:    Date;                     // inclusive
  termEnd:      Date;                     // inclusive
  enrollments:  CorScheduleEnrollment[];
}

// PH day-code token → RRULE BYDAY value
const BYDAY: Record<string, string> = {
  M:   'MO',
  T:   'TU',
  W:   'WE',
  Th:  'TH',
  F:   'FR',
  Sat: 'SA',
  Sun: 'SU',
};

// PH day-code token → JS Date.getDay() index
const JS_DAY: Record<string, number> = {
  Sun: 0, M: 1, T: 2, W: 3, Th: 4, F: 5, Sat: 6,
};

/** Format `YYYYMMDDTHHmmss` (no Z) in *local* time — paired with TZID=Asia/Manila. */
function fmtLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
         `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

/** Format `YYYYMMDDTHHmmssZ` in UTC. Used for DTSTAMP and the RRULE UNTIL bound. */
function fmtUtc(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
         `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/**
 * Strip the `:SS` suffix from a TIME column if present, then pull `H, M` ints.
 * Returns `[0, 0]` for invalid input so we degrade gracefully.
 */
function parseHHMM(t: string): [number, number] {
  const [h, m] = t.split(':').map(Number);
  return [h || 0, m || 0];
}

/**
 * Returns a new Date that's the earliest `Y/M/D` on/after `from` whose JS
 * day-of-week matches `jsDay` (0-6). Hours/minutes are taken from the args.
 */
function firstOccurrence(from: Date, jsDay: number, hour: number, minute: number): Date {
  // Work in UTC throughout — the consumer interprets these wall-clock values
  // as Asia/Manila via TZID, so we never want JS to apply a server-local shift.
  const d = new Date(Date.UTC(
    from.getUTCFullYear(),
    from.getUTCMonth(),
    from.getUTCDate(),
    hour,
    minute,
    0,
  ));
  const delta = (jsDay - d.getUTCDay() + 7) % 7;
  if (delta !== 0) d.setUTCDate(d.getUTCDate() + delta);
  return d;
}

/** Escape CR/LF/comma/semicolon/backslash per RFC 5545 §3.3.11. */
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/**
 * Builds the full VCALENDAR payload as a CRLF-joined string. Returns "" when
 * the student has no schedulable enrollments — callers should treat that as a
 * 404 / empty-state condition.
 */
export function buildScheduleIcs(input: IcsBuildInput): string {
  const lines: string[] = [];
  const push = (l: string) => lines.push(l);

  const dtstamp = fmtUtc(new Date());

  push('BEGIN:VCALENDAR');
  push('VERSION:2.0');
  push('PRODID:-//Cursus SIS//Universidad Mariana//EN');
  push('CALSCALE:GREGORIAN');
  push('METHOD:PUBLISH');
  push(`X-WR-CALNAME:${escapeText(`Cursus — ${input.studentName}`)}`);
  push(`X-WR-CALDESC:${escapeText(`Class schedule for ${input.termName}`)}`);
  push('X-WR-TIMEZONE:Asia/Manila');

  // Single Asia/Manila TZ block (PH never observes DST).
  push('BEGIN:VTIMEZONE');
  push('TZID:Asia/Manila');
  push('X-LIC-LOCATION:Asia/Manila');
  push('BEGIN:STANDARD');
  push('DTSTART:19700101T000000');
  push('TZOFFSETFROM:+0800');
  push('TZOFFSETTO:+0800');
  push('TZNAME:PST');
  push('END:STANDARD');
  push('END:VTIMEZONE');

  // RRULE UNTIL needs to be in UTC. Push to end-of-day so the final week's
  // occurrence is included.
  const untilDate = new Date(Date.UTC(
    input.termEnd.getUTCFullYear(),
    input.termEnd.getUTCMonth(),
    input.termEnd.getUTCDate(),
    15, 59, 59,        // 23:59:59 Asia/Manila = 15:59:59 UTC
  ));
  const untilStr = fmtUtc(untilDate);

  for (const e of input.enrollments) {
    if (!e.dayOfWeek || !e.startTime || !e.endTime) continue;        // skip TBA
    const days = parseDays(e.dayOfWeek);
    if (days.length === 0) continue;

    const [sh, sm] = parseHHMM(e.startTime);
    const [eh, em] = parseHHMM(e.endTime);

    for (const day of days) {
      const jsDay = JS_DAY[day];
      const byday = BYDAY[day];
      if (jsDay == null || !byday) continue;

      const startDt = firstOccurrence(input.termStart, jsDay, sh, sm);
      const endDt   = firstOccurrence(input.termStart, jsDay, eh, em);
      // If end < start (shouldn't happen with validated data) skip.
      if (endDt.getTime() <= startDt.getTime()) continue;

      // Stable UID so re-imports update events in place rather than duplicating.
      const uid = `enrollment-${e.enrollmentId}-${day}@cursus.local`;

      const summary  = `${e.courseCode} · ${e.courseTitle}`;
      const location = e.room ?? '';
      const descLines = [
        `Section: ${e.sectionCode}`,
        e.facultyName ? `Faculty: ${e.facultyName}` : null,
        `Term: ${input.termName}`,
      ].filter(Boolean) as string[];

      push('BEGIN:VEVENT');
      push(`UID:${uid}`);
      push(`DTSTAMP:${dtstamp}`);
      push(`SUMMARY:${escapeText(summary)}`);
      push(`DTSTART;TZID=Asia/Manila:${fmtLocal(startDt)}`);
      push(`DTEND;TZID=Asia/Manila:${fmtLocal(endDt)}`);
      push(`RRULE:FREQ=WEEKLY;BYDAY=${byday};UNTIL=${untilStr}`);
      if (location) push(`LOCATION:${escapeText(location)}`);
      push(`DESCRIPTION:${escapeText(descLines.join('\n'))}`);
      push('END:VEVENT');
    }
  }

  push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
