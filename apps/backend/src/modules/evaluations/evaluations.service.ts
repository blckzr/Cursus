/**
 * Anonymous faculty evaluation (FUTURE_FEATURES 4.6).
 *
 * THE ANONYMITY CONTRACT — non-negotiable:
 *   • `evaluations.student_id` is used ONLY to enforce one-response-per-
 *     (student, section) and to drive the per-student grade-reveal gate.
 *   • It is NEVER joined to `eval_answers` in any faculty- or admin-facing
 *     read. All aggregate queries below use a K-anonymity threshold from
 *     `eval_periods.min_response_n` (default 3) so very small sections
 *     can't be re-identified.
 *   • Free-text answers are returned in a shuffled list, never paired
 *     with a Likert score or a date.
 */
import { db } from '../../config/db';

// ─── Period helpers ─────────────────────────────────────────────────────────

export async function getPeriod(termId: string) {
  const r = await db.query(
    `SELECT term_id, opens_at, closes_at, min_response_n
       FROM eval_periods WHERE term_id = $1`,
    [termId],
  );
  return r.rows[0] ?? null;
}

/** True iff `now()` is in [opens_at, closes_at] for this term's eval period. */
async function periodIsOpen(termId: string): Promise<{ open: boolean; period: any | null }> {
  const period = await getPeriod(termId);
  if (!period) return { open: false, period: null };
  const now = Date.now();
  return {
    open: now >= new Date(period.opens_at).getTime() && now <= new Date(period.closes_at).getTime(),
    period,
  };
}

/** Auto-set the window for a term: opens 30d before end, closes 7d after end. */
export async function setPeriod(termId: string, data: {
  opensAt?: string; closesAt?: string; minResponseN?: number; preset?: 'auto';
}) {
  const term = await db.query(`SELECT end_date FROM terms WHERE id = $1`, [termId]);
  if (!term.rows[0]) throw Object.assign(new Error('Term not found'), { status: 404 });

  let opensAt = data.opensAt;
  let closesAt = data.closesAt;

  if (data.preset === 'auto' || (!opensAt && !closesAt)) {
    const endMs = new Date(term.rows[0].end_date).getTime();
    opensAt  = opensAt  ?? new Date(endMs - 30 * 86_400_000).toISOString();
    closesAt = closesAt ?? new Date(endMs +  7 * 86_400_000).toISOString();
  }

  const r = await db.query(
    `INSERT INTO eval_periods (term_id, opens_at, closes_at, min_response_n)
     VALUES ($1, $2, $3, COALESCE($4, 3))
     ON CONFLICT (term_id) DO UPDATE
       SET opens_at       = COALESCE(EXCLUDED.opens_at, eval_periods.opens_at),
           closes_at      = COALESCE(EXCLUDED.closes_at, eval_periods.closes_at),
           min_response_n = COALESCE(EXCLUDED.min_response_n, eval_periods.min_response_n)
     RETURNING *`,
    [termId, opensAt, closesAt, data.minResponseN ?? null],
  );
  return r.rows[0];
}

// ─── Questions (admin) ──────────────────────────────────────────────────────

export async function listActiveQuestions() {
  const r = await db.query(
    `SELECT id, prompt, kind, display_order
       FROM eval_questions
      WHERE archived_at IS NULL
      ORDER BY display_order, prompt`,
  );
  return r.rows;
}

export async function listAllQuestions() {
  const r = await db.query(
    `SELECT id, prompt, kind, display_order, archived_at
       FROM eval_questions
      ORDER BY archived_at NULLS FIRST, display_order, prompt`,
  );
  return r.rows;
}

export async function createQuestion(data: { prompt: string; kind: 'likert_5'|'text'; displayOrder?: number }) {
  const r = await db.query(
    `INSERT INTO eval_questions (prompt, kind, display_order)
     VALUES ($1, $2, COALESCE($3, 0)) RETURNING *`,
    [data.prompt, data.kind, data.displayOrder ?? null],
  );
  return r.rows[0];
}

export async function updateQuestion(id: string, data: { prompt?: string; displayOrder?: number; archived?: boolean }) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (data.prompt !== undefined)       { sets.push(`prompt = $${i++}`);        vals.push(data.prompt); }
  if (data.displayOrder !== undefined) { sets.push(`display_order = $${i++}`); vals.push(data.displayOrder); }
  if (data.archived !== undefined)     { sets.push(`archived_at = $${i++}`);   vals.push(data.archived ? new Date() : null); }
  if (sets.length === 0) {
    const r = await db.query(`SELECT * FROM eval_questions WHERE id = $1`, [id]);
    return r.rows[0] ?? null;
  }
  vals.push(id);
  const r = await db.query(`UPDATE eval_questions SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals);
  return r.rows[0] ?? null;
}

// ─── Student-facing: pending evaluations + submit ───────────────────────────

/**
 * Sections the calling student still owes an evaluation for, scoped to the
 * active term whose eval period is currently open. Excludes TBA sections
 * (no faculty to evaluate). Includes sections already submitted in the
 * `done` list so the UI can render both buckets.
 */
export async function getStudentEvaluationStatus(studentId: string) {
  // Find the active term (one row max in practice).
  const t = await db.query(
    `SELECT t.id, t.name, t.semester, t.start_date, t.end_date,
            ep.opens_at, ep.closes_at, ep.min_response_n
       FROM terms t
       LEFT JOIN eval_periods ep ON ep.term_id = t.id
      WHERE t.is_active = TRUE
      ORDER BY t.start_date DESC
      LIMIT 1`,
  );
  if (!t.rows[0]) return { term: null, isOpen: false, opensAt: null, closesAt: null, pending: [], done: [] };

  const term = t.rows[0];
  const now = Date.now();
  const isOpen = term.opens_at && term.closes_at
    && now >= new Date(term.opens_at).getTime()
    && now <= new Date(term.closes_at).getTime();

  // All sections the student is enrolled in for this term, with the faculty
  // attached, plus a flag for whether they've already evaluated.
  const r = await db.query(
    `SELECT s.id AS section_id, s.section_code,
            c.code  AS course_code, c.title AS course_title,
            f.id    AS faculty_id, f.full_name AS faculty_name,
            EXISTS (
              SELECT 1 FROM evaluations ev
               WHERE ev.section_id = s.id AND ev.student_id = $1
            ) AS submitted
       FROM enrollments e
       JOIN sections    s ON s.id = e.section_id
       JOIN courses     c ON c.id = s.course_id
       JOIN users       f ON f.id = s.faculty_id
      WHERE e.student_id = $1
        AND e.status     = 'enrolled'
        AND s.term_id    = $2
      ORDER BY c.code`,
    [studentId, term.id],
  );

  const pending: any[] = [];
  const done:    any[] = [];
  for (const row of r.rows) {
    (row.submitted ? done : pending).push({
      sectionId:   row.section_id,
      sectionCode: row.section_code,
      courseCode:  row.course_code,
      courseTitle: row.course_title,
      facultyId:   row.faculty_id,
      facultyName: row.faculty_name,
    });
  }

  return {
    term: { id: term.id, name: term.name, semester: term.semester },
    isOpen,
    opensAt:  term.opens_at,
    closesAt: term.closes_at,
    pending,
    done,
  };
}

/** Sections the student must still evaluate before their finalized grade
 *  for that section unlocks. Used by the Grades-page gate. */
export async function getMustEvaluateFirst(studentId: string): Promise<{
  sectionId: string; sectionCode: string; courseTitle: string; facultyName: string;
}[]> {
  const r = await db.query(
    `SELECT s.id AS section_id, s.section_code,
            c.title AS course_title, f.full_name AS faculty_name
       FROM enrollments e
       JOIN sections    s ON s.id = e.section_id
       JOIN courses     c ON c.id = s.course_id
       LEFT JOIN users  f ON f.id = s.faculty_id
      WHERE e.student_id   = $1
        AND e.status       = 'enrolled'
        AND e.finalized_at IS NOT NULL
        AND s.faculty_id   IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM evaluations ev
           WHERE ev.section_id = s.id AND ev.student_id = $1
        )`,
    [studentId],
  );
  return r.rows.map(row => ({
    sectionId:   row.section_id,
    sectionCode: row.section_code,
    courseTitle: row.course_title,
    facultyName: row.faculty_name,
  }));
}

export async function submitEvaluation(
  studentId: string,
  sectionId: string,
  answers: { questionId: string; likertValue?: number; textValue?: string }[],
) {
  // 1. Section must exist and student must be enrolled in it.
  const section = await db.query(
    `SELECT s.term_id, s.faculty_id
       FROM sections s
       JOIN enrollments e ON e.section_id = s.id
      WHERE s.id = $1 AND e.student_id = $2 AND e.status = 'enrolled'`,
    [sectionId, studentId],
  );
  if (!section.rows[0]) {
    throw Object.assign(new Error('Section not found or you are not enrolled.'), { status: 404 });
  }
  if (!section.rows[0].faculty_id) {
    throw Object.assign(new Error('This section has no assigned faculty to evaluate.'), { status: 409 });
  }

  // 2. Eval period must be open for this section's term.
  const { open } = await periodIsOpen(section.rows[0].term_id);
  if (!open) {
    throw Object.assign(new Error('Evaluation window is not open for this term.'), { status: 409 });
  }

  // 3. Single-shot insert (UNIQUE catches dupes).
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const ev = await client.query(
      `INSERT INTO evaluations (section_id, student_id) VALUES ($1, $2) RETURNING id`,
      [sectionId, studentId],
    );
    const evalId = ev.rows[0].id;
    for (const a of answers) {
      await client.query(
        `INSERT INTO eval_answers (evaluation_id, question_id, likert_value, text_value)
         VALUES ($1, $2, $3, $4)`,
        [evalId, a.questionId, a.likertValue ?? null, a.textValue ?? null],
      );
    }
    await client.query('COMMIT');
    return { evaluationId: evalId };
  } catch (e: any) {
    await client.query('ROLLBACK');
    if (e?.code === '23505') {        // UNIQUE violation
      throw Object.assign(new Error('You have already evaluated this section.'), { status: 409 });
    }
    throw e;
  } finally {
    client.release();
  }
}

// ─── Aggregates (faculty + admin) — K-anonymous ─────────────────────────────

interface QuestionAgg {
  questionId: string;
  prompt:     string;
  kind:       'likert_5' | 'text';
  mean:       number | null;        // null when below K threshold
  n:          number;
  distribution?: number[];           // length 5, only for likert
}

/**
 * Per-section rollup for the faculty's own sections in a term.
 * `min_response_n` from the term's eval period gates whether numbers are
 * returned at all — below the threshold, `mean` is null and texts are empty.
 */
export async function getFacultyTermRollup(facultyId: string, termId: string) {
  const period = await getPeriod(termId);
  const minN = period?.min_response_n ?? 3;

  const sections = await db.query(
    `SELECT s.id AS section_id, s.section_code,
            c.code AS course_code, c.title AS course_title,
            (SELECT count(*) FROM evaluations ev WHERE ev.section_id = s.id) AS responses
       FROM sections s
       JOIN courses  c ON c.id = s.course_id
      WHERE s.faculty_id = $1 AND s.term_id = $2
      ORDER BY c.code`,
    [facultyId, termId],
  );

  const out: any[] = [];
  for (const sec of sections.rows) {
    const responses = Number(sec.responses);
    const meetsThreshold = responses >= minN;

    // Likert per-question aggregates (anonymised — never joined to student_id)
    let questions: QuestionAgg[] = [];
    let texts: string[] = [];

    if (meetsThreshold) {
      const qRows = await db.query(
        `SELECT q.id, q.prompt, q.kind,
                avg(a.likert_value)::float AS mean,
                count(a.likert_value)::int  AS n,
                array(
                  SELECT count(*) FROM eval_answers a2
                   JOIN evaluations e2 ON e2.id = a2.evaluation_id
                   WHERE a2.question_id = q.id AND e2.section_id = $1 AND a2.likert_value = v
                ) AS dist_counts
           FROM eval_questions q
           LEFT JOIN eval_answers a ON a.question_id = q.id
           LEFT JOIN evaluations e ON e.id = a.evaluation_id AND e.section_id = $1
           CROSS JOIN LATERAL generate_series(1,5) AS v
          WHERE q.kind = 'likert_5'
          GROUP BY q.id, q.prompt, q.kind
          ORDER BY q.display_order`,
        [sec.section_id],
      );
      // The CROSS JOIN above explodes rows; re-aggregate by question id.
      const seen = new Map<string, QuestionAgg>();
      for (const r of qRows.rows) {
        if (!seen.has(r.id)) {
          seen.set(r.id, {
            questionId: r.id,
            prompt:     r.prompt,
            kind:       r.kind,
            mean:       r.mean,
            n:          r.n,
            distribution: r.dist_counts,
          });
        }
      }
      questions = [...seen.values()];

      // Free-text answers — shuffled, never paired with anything.
      const tx = await db.query(
        `SELECT a.text_value
           FROM eval_answers a
           JOIN evaluations e ON e.id = a.evaluation_id
           JOIN eval_questions q ON q.id = a.question_id
          WHERE e.section_id = $1 AND q.kind = 'text' AND a.text_value IS NOT NULL AND a.text_value <> ''
          ORDER BY random()`,
        [sec.section_id],
      );
      texts = tx.rows.map(r => r.text_value);
    }

    out.push({
      sectionId:    sec.section_id,
      sectionCode:  sec.section_code,
      courseCode:   sec.course_code,
      courseTitle:  sec.course_title,
      responses,
      meetsThreshold,
      minResponseN: minN,
      questions,
      texts,
    });
  }

  // Term-wide mean for the faculty (only counts sections that meet the threshold).
  const termMean = await db.query(
    `SELECT avg(a.likert_value)::float AS mean, count(*)::int AS n
       FROM eval_answers a
       JOIN evaluations e ON e.id = a.evaluation_id
       JOIN sections    s ON s.id = e.section_id
      WHERE s.faculty_id = $1 AND s.term_id = $2
        AND a.likert_value IS NOT NULL
        AND (SELECT count(*) FROM evaluations ev2 WHERE ev2.section_id = s.id) >= $3`,
    [facultyId, termId, minN],
  );

  return {
    termMean: termMean.rows[0]?.mean ?? null,
    termResponses: termMean.rows[0]?.n ?? 0,
    minResponseN: minN,
    sections: out,
  };
}

/** Institution-wide rollup for admin: faculty × mean rating × N, K-anonymous. */
export async function getAdminTermRollup(termId: string) {
  const period = await getPeriod(termId);
  const minN = period?.min_response_n ?? 3;

  const r = await db.query(
    `SELECT u.id AS faculty_id, u.full_name AS faculty_name, u.user_code,
            count(DISTINCT s.id) AS sections,
            count(DISTINCT e.id) AS responses,
            avg(a.likert_value)::float AS mean
       FROM users u
       JOIN sections s ON s.faculty_id = u.id AND s.term_id = $2
       LEFT JOIN evaluations e ON e.section_id = s.id
       LEFT JOIN eval_answers a ON a.evaluation_id = e.id AND a.likert_value IS NOT NULL
      WHERE u.role = 'faculty'
      GROUP BY u.id, u.full_name, u.user_code
      ORDER BY mean DESC NULLS LAST, u.full_name`,
    [termId, termId],
  );

  return {
    minResponseN: minN,
    faculty: r.rows.map((row: any) => ({
      facultyId:   row.faculty_id,
      facultyName: row.faculty_name,
      userCode:    row.user_code,
      sections:    Number(row.sections),
      responses:   Number(row.responses),
      // Hide mean when below K threshold
      mean:        Number(row.responses) >= minN ? row.mean : null,
    })),
  };
}
