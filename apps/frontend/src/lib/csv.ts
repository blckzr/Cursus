/**
 * Tiny CSV helpers used by the admin / faculty export buttons. Kept in `lib/`
 * so every page builds the same well-formed file (UTF-8 BOM for Excel, RFC
 * 4180-style quoting, ISO-date filenames).
 */

/** Quote a value if it contains comma, quote, or newline. */
export function csvEscape(v: unknown): string {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Trigger a CSV file download in the browser.
 *
 * @param rows — pre-quoted cells; pass `[headerRow, ...dataRows]`. Each cell is
 *               joined by comma, rows by `\n`.
 * @param filename — suggested download name (`users-2026-06-04.csv`).
 */
export function downloadCsv(rows: string[][], filename: string): void {
  const csv = rows.map(r => r.join(',')).join('\n');
  // UTF-8 BOM (U+FEFF) so Excel opens accented PH names without mojibake.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/** YYYY-MM-DD stamp for filenames. */
export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
