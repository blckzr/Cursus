/**
 * Day-of-week + time helpers shared by the section editor, faculty availability,
 * and the schedule grid. Keep the parser tolerant — section storage uses the
 * compact format ('MWF', 'TTh', 'SunSat'), so we have to round-trip cleanly.
 */

export const DAY_ORDER = ['M', 'T', 'W', 'Th', 'F', 'Sat', 'Sun'] as const;
export type DayCode = typeof DAY_ORDER[number];
export const DAY_LABEL: Record<DayCode, string> = {
  M: 'Mon', T: 'Tue', W: 'Wed', Th: 'Thu', F: 'Fri', Sat: 'Sat', Sun: 'Sun',
};

/** Compact day string → list of canonical tokens. Multi-char tokens win first. */
export function parseDays(s: string | null | undefined): DayCode[] {
  if (!s) return [];
  let rest = s.replace(/\s+/g, '');
  const out = new Set<DayCode>();
  while (/sun/i.test(rest)) { out.add('Sun'); rest = rest.replace(/sun/i, ''); }
  while (/sat/i.test(rest)) { out.add('Sat'); rest = rest.replace(/sat/i, ''); }
  while (/th/i.test(rest))  { out.add('Th');  rest = rest.replace(/th/i,  ''); }
  for (const c of rest.toUpperCase()) {
    if ('MTWF'.includes(c)) out.add(c as DayCode);
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
