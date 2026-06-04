/**
 * Bulk user import.
 *
 * Two-step contract: client sends the same payload to `preview` and `apply`.
 *   • preview: validates every row (Zod + DB checks for duplicate emails and
 *     program lookup) and returns categorised valid/invalid rows. No writes.
 *   • apply: validates again, then creates the valid rows via the normal
 *     createUser path (default password, sequence-generated user code,
 *     auto-block for students, active-term enrollment fanout). Per-row
 *     failures are reported so a partial success leaves a clear trail.
 */

import { z } from 'zod';
import { db } from '../../config/db';
import { createUser } from './users.service';

// ─── Wire shape ──────────────────────────────────────────────────────────────

/** A raw row as parsed by the client. Every field is a string so we can
 *  surface formatting issues with their original value in the preview. */
export interface RawRow {
  rowIndex:    number;
  email:       string;
  fullName:    string;
  role:        string;
  branch?:     string;
  programCode?: string;
}

export interface ValidatedRow {
  rowIndex:    number;
  email:       string;
  fullName:    string;
  role:        'admin' | 'faculty' | 'student';
  branch:      string | null;
  programId:   string | null;
  programCode: string | null;
}

export interface InvalidRow {
  rowIndex: number;
  raw:      RawRow;
  reason:   string;
}

export interface PreviewResult {
  valid:   ValidatedRow[];
  invalid: InvalidRow[];
  summary: {
    total:       number;
    willCreate:  number;
    skipped:     number;
    byRole:      Record<'admin' | 'faculty' | 'student', number>;
  };
}

export interface ApplyResult {
  created: { rowIndex: number; userCode: string; email: string }[];
  failed:  { rowIndex: number; email: string; reason: string }[];
}

// ─── Per-row schema (matches the API's create user shape minus password) ────

const rowSchema = z.object({
  email:       z.string().trim().email('Invalid email'),
  fullName:    z.string().trim().min(1, 'Full name is required'),
  role:        z.enum(['admin', 'faculty', 'student'], { errorMap: () => ({ message: 'Role must be admin, faculty, or student' }) }),
  branch:      z.string().trim().min(1).max(10).optional(),
  programCode: z.string().trim().min(1).optional(),
}).refine(d => d.role !== 'student' || !!d.programCode, {
  message: 'A program is required for students',
  path:    ['programCode'],
});

// ─── Preview ────────────────────────────────────────────────────────────────

export async function previewBulk(rows: RawRow[]): Promise<PreviewResult> {
  if (rows.length === 0) {
    return { valid: [], invalid: [], summary: { total: 0, willCreate: 0, skipped: 0, byRole: { admin: 0, faculty: 0, student: 0 } } };
  }

  // 1) Per-row Zod
  type Step1 = { row: RawRow; parsed: z.infer<typeof rowSchema> | null; error: string | null };
  const step1: Step1[] = rows.map(r => {
    const parsed = rowSchema.safeParse({
      email:       r.email,
      fullName:    r.fullName,
      role:        r.role,
      branch:      r.branch || undefined,
      programCode: r.programCode || undefined,
    });
    if (parsed.success) return { row: r, parsed: parsed.data, error: null };
    return { row: r, parsed: null, error: parsed.error.issues[0]?.message ?? 'Invalid row' };
  });

  // 2) Bulk DB lookups: existing emails (case-insensitive) + program codes
  const emails = step1
    .filter(s => s.parsed)
    .map(s => s.parsed!.email.toLowerCase());
  const programCodes = step1
    .filter(s => s.parsed && s.parsed.programCode)
    .map(s => s.parsed!.programCode!.toUpperCase());

  const [existingRes, programsRes] = await Promise.all([
    emails.length > 0
      ? db.query<{ email: string }>(
          `SELECT LOWER(email) AS email FROM users WHERE LOWER(email) = ANY($1)`,
          [emails],
        )
      : Promise.resolve({ rows: [] as { email: string }[] }),
    programCodes.length > 0
      ? db.query<{ id: string; code: string }>(
          `SELECT id, UPPER(code) AS code FROM programs WHERE UPPER(code) = ANY($1)`,
          [programCodes],
        )
      : Promise.resolve({ rows: [] as { id: string; code: string }[] }),
  ]);

  const existingEmails = new Set(existingRes.rows.map(r => r.email));
  const programByCode  = new Map(programsRes.rows.map(r => [r.code, r.id]));

  // 3) In-file duplicate detection (one row keeps the email; the rest fail)
  const seenInFile = new Set<string>();

  // 4) Final categorisation
  const valid:   ValidatedRow[] = [];
  const invalid: InvalidRow[]   = [];

  for (const s of step1) {
    if (!s.parsed) {
      invalid.push({ rowIndex: s.row.rowIndex, raw: s.row, reason: s.error ?? 'Invalid row' });
      continue;
    }
    const emailLc = s.parsed.email.toLowerCase();
    if (existingEmails.has(emailLc)) {
      invalid.push({ rowIndex: s.row.rowIndex, raw: s.row, reason: 'Email already in use' });
      continue;
    }
    if (seenInFile.has(emailLc)) {
      invalid.push({ rowIndex: s.row.rowIndex, raw: s.row, reason: 'Duplicate email earlier in this file' });
      continue;
    }
    seenInFile.add(emailLc);

    let programId: string | null = null;
    if (s.parsed.programCode) {
      const pid = programByCode.get(s.parsed.programCode.toUpperCase());
      if (!pid) {
        invalid.push({ rowIndex: s.row.rowIndex, raw: s.row, reason: `Unknown program code "${s.parsed.programCode}"` });
        continue;
      }
      programId = pid;
    }

    valid.push({
      rowIndex:    s.row.rowIndex,
      email:       s.parsed.email,
      fullName:    s.parsed.fullName,
      role:        s.parsed.role,
      branch:      s.parsed.branch ?? null,
      programId,
      programCode: s.parsed.programCode ? s.parsed.programCode.toUpperCase() : null,
    });
  }

  const byRole = { admin: 0, faculty: 0, student: 0 } as Record<'admin' | 'faculty' | 'student', number>;
  for (const v of valid) byRole[v.role]++;

  return {
    valid,
    invalid,
    summary: {
      total:       rows.length,
      willCreate:  valid.length,
      skipped:     invalid.length,
      byRole,
    },
  };
}

// ─── Apply ───────────────────────────────────────────────────────────────────

export async function applyBulk(rows: RawRow[]): Promise<ApplyResult> {
  // Re-validate so we never trust the client over the DB.
  const preview = await previewBulk(rows);

  const created: ApplyResult['created'] = [];
  const failed:  ApplyResult['failed']  = preview.invalid.map(i => ({
    rowIndex: i.rowIndex, email: i.raw.email, reason: i.reason,
  }));

  // createUser uses the pool, not a transaction — accept partial success and
  // report it. Block-capacity overflow on students is handled inside
  // createUser via pickRandomBlock, which throws 409 when the year-level is
  // full; we surface that as the row's failure reason.
  for (const v of preview.valid) {
    try {
      const user = await createUser({
        email:     v.email,
        fullName:  v.fullName,
        role:      v.role,
        branch:    v.branch ?? undefined,
        programId: v.programId ?? undefined,
      });
      created.push({ rowIndex: v.rowIndex, userCode: user.user_code, email: user.email });
    } catch (e) {
      const msg = (e as { message?: string }).message ?? 'Creation failed';
      failed.push({ rowIndex: v.rowIndex, email: v.email, reason: msg });
    }
  }

  return { created, failed };
}
