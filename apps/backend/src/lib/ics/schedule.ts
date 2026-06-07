/**
 * Hand-rolled iCalendar export of a student's weekly class schedule.
 *
 * Post-2.6 (multi-meeting): each enrollment carries a `meetings: Meeting[]`
 * list (1 or 2 entries) instead of a flat day_of_week/start/end triple. We
 * emit one VEVENT per meeting with a WEEKLY recurrence rule on that
 * meeting's day, bounded by the term's end_date.
 *
 * Spec refs:
 *   • RFC 5545 — Internet Calendaring and Scheduling Core Object Specification
 *   • RFC 7986 — New properties for VCALENDAR (X-WR-CALNAME)
 */

import type { Meeting } from '../../modules/sections/sections.service';

export interface CorScheduleEnrollment {
  enrollmentId: string;
  courseCode:   string;
  courseTitle:  string;
  sectionCode:  string;
  meetings:     Meeting[];
  room:         string | null;
  facultyName:  string | null;
}

export interface IcsBuildInput {
  studentCode:  string | null;
  studentName:  string;
  termName:     string;
  termStart:    Date;
  termEnd:      Date;
  enrollments:  CorScheduleEnrollment[];
}

// Day code → RRULE BYDAY value
const BYDAY: Record<string, string> = {
  Mon: 'MO', Tue: 'TU', Wed: 'WE', Thu: 'TH', Fri: 'FR', Sat: 'SA', Sun: 'SU',
};

// Day code → JS Date.getDay() index
const JS_DAY: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function fmtLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
         `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}
function fmtUtc(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
         `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
function parseHHMM(t: string): [number, number] {
  const [h, m] = t.split(':').map(Number);
  return [h || 0, m || 0];
}
function firstOccurrence(from: Date, jsDay: number, hour: number, minute: number): Date {
  const d = new Date(Date.UTC(
    from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(),
    hour, minute, 0,
  ));
  const delta = (jsDay - d.getUTCDay() + 7) % 7;
  if (delta !== 0) d.setUTCDate(d.getUTCDate() + delta);
  return d;
}
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

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

  const untilDate = new Date(Date.UTC(
    input.termEnd.getUTCFullYear(), input.termEnd.getUTCMonth(), input.termEnd.getUTCDate(),
    15, 59, 59,
  ));
  const untilStr = fmtUtc(untilDate);

  for (const e of input.enrollments) {
    if (!e.meetings || e.meetings.length === 0) continue;          // skip TBA

    for (const meeting of e.meetings) {
      const jsDay = JS_DAY[meeting.dayOfWeek];
      const byday = BYDAY[meeting.dayOfWeek];
      if (jsDay == null || !byday) continue;

      const [sh, sm] = parseHHMM(meeting.startTime);
      const [eh, em] = parseHHMM(meeting.endTime);
      const startDt = firstOccurrence(input.termStart, jsDay, sh, sm);
      const endDt   = firstOccurrence(input.termStart, jsDay, eh, em);
      if (endDt.getTime() <= startDt.getTime()) continue;

      const uid = `enrollment-${e.enrollmentId}-${meeting.dayOfWeek}-${meeting.startTime}@cursus.local`;
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
