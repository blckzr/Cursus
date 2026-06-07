/**
 * Past-term archive (FUTURE_FEATURES 3.6).
 *
 * Moves a finished term's `sections`, `enrollments`, gradebook tree
 * (categories → assessments → scores), and resolved appeals out of the
 * live tables into their `*_archive` siblings, all in one transaction.
 *
 * Safety rails:
 *   • The term must exist and not already be archived.
 *   • The term must not be the active term (`is_active = false`).
 *   • Any appeal still in `pending`, `faculty_review`, or `dean_review`
 *     for an enrollment in this term aborts the move with 409 — the
 *     admin has to wait for the appeals to resolve first (spec calls
 *     this out explicitly: active appeals stay live).
 *
 * Restore is intentionally not exposed via the API. Per spec, restores
 * are rare and run as admin-only one-off SQL.
 */
import { db } from '../../config/db';
import type { PoolClient } from 'pg';

export interface ArchivePreview {
  term: {
    id: string;
    name: string;
    semester: string;
    start_date: string;
    end_date: string;
    archived_at: string | null;
  };
  counts: {
    sections: number;
    enrollments: number;
    assessment_categories: number;
    assessments: number;
    scores: number;
    resolvedAppeals: number;
    activeAppeals: number;
  };
  blockers: {
    isActive: boolean;
    alreadyArchived: boolean;
    activeAppeals: number;
  };
}

async function loadTerm(client: PoolClient, termId: string) {
  const r = await client.query(
    `SELECT id, name, semester, start_date, end_date, is_active, archived_at
       FROM terms WHERE id = $1`,
    [termId],
  );
  return r.rows[0] ?? null;
}

/** Count rows that WOULD move, so the modal can show a real preview. */
export async function previewArchive(termId: string): Promise<ArchivePreview> {
  const client = await db.connect();
  try {
    const term = await loadTerm(client, termId);
    if (!term) throw Object.assign(new Error('Term not found'), { status: 404 });

    // Single round-trip with CTEs so the preview doesn't hammer the db.
    const r = await client.query(
      `
      WITH sec AS (SELECT id FROM sections WHERE term_id = $1),
           enr AS (SELECT id FROM enrollments WHERE section_id IN (SELECT id FROM sec)),
           cat AS (SELECT id FROM assessment_categories WHERE section_id IN (SELECT id FROM sec)),
           asm AS (SELECT id FROM assessments WHERE category_id IN (SELECT id FROM cat))
      SELECT
        (SELECT count(*) FROM sec)                              AS sections,
        (SELECT count(*) FROM enr)                              AS enrollments,
        (SELECT count(*) FROM cat)                              AS categories,
        (SELECT count(*) FROM asm)                              AS assessments,
        (SELECT count(*) FROM scores WHERE assessment_id IN (SELECT id FROM asm)) AS scores,
        (SELECT count(*) FROM grade_appeals
            WHERE enrollment_id IN (SELECT id FROM enr)
              AND status IN ('resolved','withdrawn'))           AS resolved_appeals,
        (SELECT count(*) FROM grade_appeals
            WHERE enrollment_id IN (SELECT id FROM enr)
              AND status IN ('pending','faculty_review','dean_review')) AS active_appeals
      `,
      [termId],
    );
    const c = r.rows[0];

    return {
      term: {
        id: term.id,
        name: term.name,
        semester: term.semester,
        start_date: term.start_date,
        end_date: term.end_date,
        archived_at: term.archived_at,
      },
      counts: {
        sections:               Number(c.sections),
        enrollments:            Number(c.enrollments),
        assessment_categories:  Number(c.categories),
        assessments:            Number(c.assessments),
        scores:                 Number(c.scores),
        resolvedAppeals:        Number(c.resolved_appeals),
        activeAppeals:          Number(c.active_appeals),
      },
      blockers: {
        isActive:        Boolean(term.is_active),
        alreadyArchived: term.archived_at != null,
        activeAppeals:   Number(c.active_appeals),
      },
    };
  } finally {
    client.release();
  }
}

export interface ArchiveResult {
  termId: string;
  moved: {
    sections: number;
    enrollments: number;
    assessment_categories: number;
    assessments: number;
    scores: number;
    resolvedAppeals: number;
  };
}

export async function archiveTerm(termId: string, adminId: string): Promise<ArchiveResult> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const term = await loadTerm(client, termId);
    if (!term) throw Object.assign(new Error('Term not found'), { status: 404 });
    if (term.archived_at) {
      throw Object.assign(new Error('Term is already archived'), { status: 409 });
    }
    if (term.is_active) {
      throw Object.assign(new Error('Cannot archive the active term'), { status: 409 });
    }

    // Refuse if any active appeals exist — spec: keep active appeals live.
    const active = await client.query(
      `SELECT count(*)::int AS n
         FROM grade_appeals a
         JOIN enrollments  e ON e.id = a.enrollment_id
         JOIN sections     s ON s.id = e.section_id
        WHERE s.term_id = $1
          AND a.status IN ('pending','faculty_review','dean_review')`,
      [termId],
    );
    if (active.rows[0].n > 0) {
      throw Object.assign(
        new Error(`Cannot archive: ${active.rows[0].n} appeal(s) still active. Resolve or withdraw them first.`),
        { status: 409 },
      );
    }

    // ── Move data, deepest-first so FK cascades don't surprise us. ──
    // 1. Resolved appeals → archive (before enrollments cascade-deletes them).
    const appealsRes = await client.query(
      `INSERT INTO grade_appeals_archive
         SELECT a.*, $2::uuid AS archived_term_id, now() AS archived_at
           FROM grade_appeals a
           JOIN enrollments  e ON e.id = a.enrollment_id
           JOIN sections     s ON s.id = e.section_id
          WHERE s.term_id = $1
            AND a.status IN ('resolved','withdrawn')`,
      [termId, termId],
    );

    // 2. Scores.
    const scoresRes = await client.query(
      `INSERT INTO scores_archive
         SELECT sc.*, $2::uuid AS archived_term_id, now() AS archived_at
           FROM scores sc
           JOIN assessments          a ON a.id = sc.assessment_id
           JOIN assessment_categories c ON c.id = a.category_id
           JOIN sections             s ON s.id = c.section_id
          WHERE s.term_id = $1`,
      [termId, termId],
    );

    // 3. Assessments.
    const assessmentsRes = await client.query(
      `INSERT INTO assessments_archive
         SELECT a.*, $2::uuid AS archived_term_id, now() AS archived_at
           FROM assessments a
           JOIN assessment_categories c ON c.id = a.category_id
           JOIN sections             s ON s.id = c.section_id
          WHERE s.term_id = $1`,
      [termId, termId],
    );

    // 4. Categories.
    const catsRes = await client.query(
      `INSERT INTO assessment_categories_archive
         SELECT c.*, $2::uuid AS archived_term_id, now() AS archived_at
           FROM assessment_categories c
           JOIN sections s ON s.id = c.section_id
          WHERE s.term_id = $1`,
      [termId, termId],
    );

    // 5. Enrollments.
    const enrollmentsRes = await client.query(
      `INSERT INTO enrollments_archive
         SELECT e.*, $2::uuid AS archived_term_id, now() AS archived_at
           FROM enrollments e
           JOIN sections    s ON s.id = e.section_id
          WHERE s.term_id = $1`,
      [termId, termId],
    );

    // 6. Sections.
    const sectionsRes = await client.query(
      `INSERT INTO sections_archive
         SELECT s.*, now() AS archived_at
           FROM sections s
          WHERE s.term_id = $1`,
      [termId],
    );

    // ── Now delete from live tables. The cascade order is:
    //   scores → assessments → categories → (sections ↔ enrollments)
    // We deliberately delete sections last; deleting a section cascades
    // to enrollments, but we want clean numbers in our INSERT counts so
    // we did it in two passes.
    await client.query(
      `DELETE FROM grade_appeals
        WHERE enrollment_id IN (
          SELECT e.id FROM enrollments e JOIN sections s ON s.id = e.section_id WHERE s.term_id = $1
        )`,
      [termId],
    );
    await client.query(
      `DELETE FROM scores
        WHERE assessment_id IN (
          SELECT a.id FROM assessments a
          JOIN assessment_categories c ON c.id = a.category_id
          JOIN sections             s ON s.id = c.section_id
          WHERE s.term_id = $1
        )`,
      [termId],
    );
    await client.query(
      `DELETE FROM assessments
        WHERE category_id IN (
          SELECT c.id FROM assessment_categories c JOIN sections s ON s.id = c.section_id WHERE s.term_id = $1
        )`,
      [termId],
    );
    await client.query(
      `DELETE FROM assessment_categories WHERE section_id IN (SELECT id FROM sections WHERE term_id = $1)`,
      [termId],
    );
    await client.query(
      `DELETE FROM enrollments WHERE section_id IN (SELECT id FROM sections WHERE term_id = $1)`,
      [termId],
    );
    await client.query(`DELETE FROM sections WHERE term_id = $1`, [termId]);

    // 7. Mark the term archived.
    await client.query(`UPDATE terms SET archived_at = now() WHERE id = $1`, [termId]);

    // 8. Audit.
    const moved = {
      sections:              sectionsRes.rowCount ?? 0,
      enrollments:           enrollmentsRes.rowCount ?? 0,
      assessment_categories: catsRes.rowCount ?? 0,
      assessments:           assessmentsRes.rowCount ?? 0,
      scores:                scoresRes.rowCount ?? 0,
      resolvedAppeals:       appealsRes.rowCount ?? 0,
    };
    await client.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value)
       VALUES ($1, 'ARCHIVE_TERM', 'terms', $2, $3)`,
      [adminId, termId, JSON.stringify(moved)],
    );

    await client.query('COMMIT');
    return { termId, moved };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
