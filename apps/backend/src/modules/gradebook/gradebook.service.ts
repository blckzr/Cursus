import { db } from '../../config/db';
import { computeWeightedGrade, numericToLetter } from '../../utils/gradeCalc';

// ─── Gradebook Grid ───────────────────────────────────────────────────────────

export async function getGradebook(sectionId: string) {
  const [sectionRes, categoriesRes, enrollmentsRes, scoresRes] = await Promise.all([
    db.query(
      `SELECT s.*, c.code AS course_code, c.title AS course_title, c.units,
              t.name AS term_name, u.full_name AS faculty_name
       FROM sections s
       JOIN courses c ON c.id = s.course_id
       JOIN terms   t ON t.id = s.term_id
       LEFT JOIN users u ON u.id = s.faculty_id
       WHERE s.id = $1`,
      [sectionId],
    ),
    db.query(
      `SELECT ac.*, COALESCE(
          json_agg(a ORDER BY a.display_order, a.name) FILTER (WHERE a.id IS NOT NULL), '[]'
       ) AS assessments
       FROM assessment_categories ac
       LEFT JOIN assessments a ON a.category_id = ac.id
       WHERE ac.section_id = $1
       GROUP BY ac.id
       ORDER BY ac.display_order, ac.name`,
      [sectionId],
    ),
    db.query(
      `SELECT e.id, e.student_id, e.status, e.numeric_grade, e.letter_grade, e.finalized_at,
              u.full_name AS student_name, u.email AS student_email
       FROM enrollments e
       JOIN users u ON u.id = e.student_id
       WHERE e.section_id = $1 AND e.status != 'dropped'
       ORDER BY u.full_name`,
      [sectionId],
    ),
    db.query(
      `SELECT sc.assessment_id, sc.enrollment_id, sc.score, sc.updated_at
       FROM scores sc
       JOIN enrollments e ON e.id = sc.enrollment_id
       WHERE e.section_id = $1`,
      [sectionId],
    ),
  ]);

  if (!sectionRes.rows[0]) return null;

  // Build score lookup: enrollmentId → assessmentId → score
  const scoreMap: Record<string, Record<string, number | null>> = {};
  for (const row of scoresRes.rows) {
    if (!scoreMap[row.enrollment_id]) scoreMap[row.enrollment_id] = {};
    scoreMap[row.enrollment_id][row.assessment_id] = row.score !== null ? parseFloat(row.score) : null;
  }

  // Build category refs for grade computation
  const categoryRefs = categoriesRes.rows.map(cat => ({
    weight: parseFloat(cat.weight),
    assessments: (cat.assessments as { id: string; max_score: string }[]).map(a => ({
      id: a.id,
      maxScore: parseFloat(a.max_score),
    })),
  }));

  const students = enrollmentsRes.rows.map(e => {
    const studentScores = scoreMap[e.id] ?? {};
    return {
      enrollmentId: e.id,
      studentId: e.student_id,
      studentName: e.student_name,
      studentEmail: e.student_email,
      status: e.status,
      scores: studentScores,
      computedGrade: computeWeightedGrade(categoryRefs, studentScores),
      finalizedGrade: e.numeric_grade ? parseFloat(e.numeric_grade) : null,
      letterGrade: e.letter_grade,
      finalizedAt: e.finalized_at,
    };
  });

  return {
    section: sectionRes.rows[0],
    categories: categoriesRes.rows,
    students,
  };
}

// ─── Categories ──────────────────────────────────────────────────────────────

export async function createCategory(sectionId: string, data: { name: string; weight: number; displayOrder: number }) {
  const { rows } = await db.query(
    'INSERT INTO assessment_categories (section_id, name, weight, display_order) VALUES ($1,$2,$3,$4) RETURNING *',
    [sectionId, data.name, data.weight, data.displayOrder],
  );
  return rows[0];
}

export async function updateCategory(id: string, data: { name?: string; weight?: number; displayOrder?: number }) {
  const sets: string[] = []; const vals: unknown[] = []; let i = 1;
  if (data.name !== undefined)         { sets.push(`name = $${i++}`);          vals.push(data.name); }
  if (data.weight !== undefined)       { sets.push(`weight = $${i++}`);        vals.push(data.weight); }
  if (data.displayOrder !== undefined) { sets.push(`display_order = $${i++}`); vals.push(data.displayOrder); }
  if (sets.length === 0) { const { rows } = await db.query('SELECT * FROM assessment_categories WHERE id = $1', [id]); return rows[0]; }
  vals.push(id);
  const { rows } = await db.query(`UPDATE assessment_categories SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals);
  return rows[0] ?? null;
}

export async function deleteCategory(id: string) {
  await db.query('DELETE FROM assessment_categories WHERE id = $1', [id]);
}

// ─── Assessments ─────────────────────────────────────────────────────────────

export async function createAssessment(data: { categoryId: string; name: string; maxScore: number; displayOrder: number }) {
  const { rows } = await db.query(
    'INSERT INTO assessments (category_id, name, max_score, display_order) VALUES ($1,$2,$3,$4) RETURNING *',
    [data.categoryId, data.name, data.maxScore, data.displayOrder],
  );
  return rows[0];
}

export async function updateAssessment(id: string, data: { name?: string; maxScore?: number; displayOrder?: number }) {
  const sets: string[] = []; const vals: unknown[] = []; let i = 1;
  if (data.name !== undefined)         { sets.push(`name = $${i++}`);          vals.push(data.name); }
  if (data.maxScore !== undefined)     { sets.push(`max_score = $${i++}`);     vals.push(data.maxScore); }
  if (data.displayOrder !== undefined) { sets.push(`display_order = $${i++}`); vals.push(data.displayOrder); }
  if (sets.length === 0) { const { rows } = await db.query('SELECT * FROM assessments WHERE id = $1', [id]); return rows[0]; }
  vals.push(id);
  const { rows } = await db.query(`UPDATE assessments SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals);
  return rows[0] ?? null;
}

export async function deleteAssessment(id: string) {
  await db.query('DELETE FROM assessments WHERE id = $1', [id]);
}

// ─── Bulk Score Save ──────────────────────────────────────────────────────────

export async function bulkSaveScores(
  scores: { assessmentId: string; enrollmentId: string; score: number | null }[],
  updatedBy: string,
) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const s of scores) {
      // Get old value for audit
      const { rows: old } = await client.query(
        'SELECT score FROM scores WHERE assessment_id = $1 AND enrollment_id = $2',
        [s.assessmentId, s.enrollmentId],
      );
      await client.query(
        `INSERT INTO scores (assessment_id, enrollment_id, score, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (assessment_id, enrollment_id)
         DO UPDATE SET score = EXCLUDED.score, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [s.assessmentId, s.enrollmentId, s.score, updatedBy],
      );
      // Audit log
      await client.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
         VALUES ($1, 'UPDATE_SCORE', 'scores', $2, $3, $4)`,
        [
          updatedBy,
          s.enrollmentId,
          JSON.stringify({ assessmentId: s.assessmentId, score: old[0]?.score ?? null }),
          JSON.stringify({ assessmentId: s.assessmentId, score: s.score }),
        ],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ─── Finalize Grades ──────────────────────────────────────────────────────────

export async function finalizeGrades(
  sectionId: string,
  overrides: { enrollmentId: string; letterGrade?: string }[],
  finalizedBy: string,
) {
  const gradebook = await getGradebook(sectionId);
  if (!gradebook) throw Object.assign(new Error('Section not found'), { status: 404 });

  const overrideMap = Object.fromEntries(overrides.map(o => [o.enrollmentId, o.letterGrade]));

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const results = [];

    for (const student of gradebook.students) {
      const numeric = student.computedGrade;
      const letter = overrideMap[student.enrollmentId] ?? (numeric !== null ? numericToLetter(numeric) : null);

      const { rows } = await client.query(
        `UPDATE enrollments
         SET numeric_grade = $1, letter_grade = $2, finalized_at = now(), finalized_by = $3, status = 'completed'
         WHERE id = $4 RETURNING *`,
        [numeric, letter, finalizedBy, student.enrollmentId],
      );

      await client.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
         VALUES ($1, 'FINALIZE_GRADE', 'enrollments', $2, $3, $4)`,
        [
          finalizedBy,
          student.enrollmentId,
          JSON.stringify({ numericGrade: student.finalizedGrade, letterGrade: student.letterGrade }),
          JSON.stringify({ numericGrade: numeric, letterGrade: letter }),
        ],
      );
      results.push(rows[0]);
    }

    await client.query('COMMIT');
    return results;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ─── Student Grades View ──────────────────────────────────────────────────────

export async function getStudentGrades(studentId: string) {
  const { rows } = await db.query(
    `SELECT e.id, e.status, e.numeric_grade, e.letter_grade, e.finalized_at, e.enrolled_at,
            s.id           AS section_id, s.section_code,
            s.day_of_week, s.start_time, s.end_time, s.room,
            c.code         AS course_code, c.title AS course_title, c.units,
            t.id           AS term_id, t.name AS term_name,
            t.start_date, t.end_date, t.is_active AS term_is_active,
            u.full_name    AS faculty_name
     FROM enrollments e
     JOIN sections s ON s.id = e.section_id
     JOIN courses  c ON c.id = s.course_id
     JOIN terms    t ON t.id = s.term_id
     LEFT JOIN users u ON u.id = s.faculty_id
     WHERE e.student_id = $1
     ORDER BY t.start_date DESC, c.code`,
    [studentId],
  );
  return rows;
}

// ─── Student Transcript CSV ───────────────────────────────────────────────────

export async function exportTranscriptCsv(studentId: string): Promise<{ csv: string; studentName: string; studentCode: string }> {
  const { rows: u } = await db.query(
    `SELECT full_name, user_code FROM users WHERE id = $1 AND role = 'student'`,
    [studentId],
  );
  if (!u[0]) throw Object.assign(new Error('Student not found'), { status: 404 });

  const { rows } = await db.query(
    `SELECT c.code, c.title, c.units,
            t.name AS term_name, t.semester AS term_semester,
            t.start_date,
            e.status, e.numeric_grade, e.letter_grade, e.finalized_at,
            u.full_name AS faculty_name
     FROM enrollments e
     JOIN sections s ON s.id = e.section_id
     JOIN courses  c ON c.id = s.course_id
     JOIN terms    t ON t.id = s.term_id
     LEFT JOIN users u ON u.id = s.faculty_id
     WHERE e.student_id = $1
     ORDER BY t.start_date, c.code`,
    [studentId],
  );

  const csvSafe = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = [
    'Course Code', 'Course Title', 'Units',
    'Term', 'Semester',
    'Status', 'Numeric Grade', 'Letter Grade', 'Faculty',
  ].join(',');

  const csvRows = rows.map((r: {
    code: string; title: string; units: number;
    term_name: string; term_semester: string;
    status: string; numeric_grade: string | null; letter_grade: string | null;
    faculty_name: string | null;
  }) => [
    csvSafe(r.code),
    csvSafe(r.title),
    r.units,
    csvSafe(r.term_name),
    r.term_semester,
    r.status,
    r.numeric_grade ? Number(r.numeric_grade).toFixed(2) : '',
    csvSafe(r.letter_grade ?? ''),
    csvSafe(r.faculty_name ?? ''),
  ].join(','));

  return {
    csv: [header, ...csvRows].join('\n'),
    studentName: u[0].full_name,
    studentCode: u[0].user_code,
  };
}

// ─── Gradebook CSV Export ─────────────────────────────────────────────────────

export async function exportGradebookCsv(sectionId: string): Promise<string> {
  const data = await getGradebook(sectionId);
  if (!data) throw Object.assign(new Error('Section not found'), { status: 404 });

  const allAssessments = data.categories.flatMap((cat: { name: string; assessments: { id: string; name: string }[] }) =>
    (cat.assessments as { id: string; name: string }[]).map(a => ({ ...a, categoryName: cat.name })),
  );

  const header = [
    'Student Name', 'Email',
    ...allAssessments.map((a: { categoryName: string; name: string }) => `${a.categoryName} - ${a.name}`),
    'Computed Grade', 'Final Grade', 'Letter Grade',
  ].join(',');

  const rows = data.students.map((s: {
    studentName: string; studentEmail: string;
    scores: Record<string, number | null>;
    computedGrade: number | null; finalizedGrade: number | null; letterGrade: string | null;
  }) => {
    const cols = [
      `"${s.studentName}"`,
      `"${s.studentEmail}"`,
      ...allAssessments.map((a: { id: string }) => s.scores[a.id] ?? ''),
      s.computedGrade?.toFixed(2) ?? '',
      s.finalizedGrade?.toFixed(2) ?? '',
      s.letterGrade ?? '',
    ];
    return cols.join(',');
  });

  return [header, ...rows].join('\n');
}
