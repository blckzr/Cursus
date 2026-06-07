/**
 * Day-of-week + time helpers shared by the section editor, faculty availability,
 * and the schedule grid.
 *
 * Post-2.6: the canonical day code is the 3-letter form ('Mon', 'Tue', ...,
 * 'Sun'), matching `section_meetings.day_of_week`. `parseDays()` still accepts
 * the legacy compact form ('MWF', 'TTh') because faculty_availability rows
 * keep using it.
 */

export const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export type DayCode = typeof DAY_ORDER[number];
export const DAY_LABEL: Record<DayCode, string> = {
  Mon: 'Mon', Tue: 'Tue', Wed: 'Wed', Thu: 'Thu', Fri: 'Fri', Sat: 'Sat', Sun: 'Sun',
};

/**
 * Compact day string → list of canonical 3-letter tokens. Handles the legacy
 * faculty_availability format ('MWF', 'TTh') AS WELL AS already-canonical
 * 3-letter strings ('Mon', 'TueFri'). Multi-char tokens win first.
 */
export function parseDays(s: string | null | undefined): DayCode[] {
  if (!s) return [];
  let rest = s.replace(/\s+/g, '');
  const out = new Set<DayCode>();
  // Match 3-letter day codes first (case-insensitive)
  for (const code of DAY_ORDER) {
    const re = new RegExp(code, 'gi');
    if (re.test(rest)) { out.add(code); rest = rest.replace(re, ''); }
  }
  // Legacy single-letter / 'Th' tokens
  while (/th/i.test(rest))  { out.add('Thu'); rest = rest.replace(/th/i, ''); }
  for (const c of rest.toUpperCase()) {
    if (c === 'M') out.add('Mon');
    else if (c === 'T') out.add('Tue');
    else if (c === 'W') out.add('Wed');
    else if (c === 'F') out.add('Fri');
  }
  return [...out];
}

export function joinDays(days: DayCode[] | string[]): string {
  return DAY_ORDER.filter(d => (days as string[]).includes(d)).join('');
}

/** "HH:MM" or "HH:MM:SS" → minutes since midnight. */
export function timeToMin(t: string | null | undefined): number {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** "HH:MM" or "HH:MM:SS" → "HH:MM". */
export function normTime(t: string | null | undefined): string {
  if (!t) return '';
  return t.length >= 5 ? t.slice(0, 5) : t;
}
