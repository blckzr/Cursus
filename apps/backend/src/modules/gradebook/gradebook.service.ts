import { db } from '../../config/db';
import { computeWeightedGrade, numericToLetter } from '../../utils/gradeCalc';
import { createMany as createNotifications } from '../notifications/notifications.service';

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
              u.full_name AS student_name, u.email AS student_email, u.user_code AS student_user_code
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
      enrollmentId:    e.id,
      studentId:       e.student_id,
      studentName:     e.student_name,
      studentEmail:    e.student_email,
      studentUserCode: e.student_user_code,
      status:          e.status,
      scores:          studentScores,
      computedGrade:   computeWeightedGrade(categoryRefs, studentScores),
      finalizedGrade:  e.numeric_grade ? parseFloat(e.numeric_grade) : null,
      letterGrade:     e.letter_grade,
      finalizedAt:     e.finalized_at,
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

    // Notify each student that their grade was finalized.
    const courseTitle = gradebook.section?.course_title ?? 'a course';
    const sectionCode = gradebook.section?.section_code ?? '';
    await createNotifications(
      results
        .filter(r => r.student_id)
        .map(r => ({
          userId: r.student_id as string,
          kind:   'grade_finalized',
          title:  'Final grade posted',
          body:   `${courseTitle}${sectionCode ? ` (${sectionCode})` : ''} — your final grade is ${r.letter_grade ?? '—'}.`,
          link:   '/student/grades',
          data:   { sectionId, enrollmentId: r.id, letterGrade: r.letter_grade },
        })),
      client,
    );

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

// ─── Section Roster ───────────────────────────────────────────────────────────

export async function getRoster(sectionId: string) {
  const { rows: section } = await db.query(
    `SELECT s.id, s.section_code, s.day_of_week, s.start_time::text AS start_time,
            s.end_time::text AS end_time, s.room, s.capacity,
            c.code AS course_code, c.title AS course_title, c.units,
            t.name AS term_name, t.semester AS term_semester,
            u.full_name AS faculty_name,
            p.code AS program_code, p.name AS program_name,
            b.year_level AS block_year_level, b.block_number,
            p.code || ' ' || b.year_level || '-' || b.block_number AS block_label
     FROM sections s
     JOIN courses  c ON c.id = s.course_id
     JOIN terms    t ON t.id = s.term_id
     JOIN blocks   b ON b.id = s.block_id
     JOIN programs p ON p.id = b.program_id
     LEFT JOIN users u ON u.id = s.faculty_id
     WHERE s.id = $1`,
    [sectionId],
  );
  if (!section[0]) return null;

  const { rows: students } = await db.query(
    `SELECT u.id, u.user_code, u.full_name, u.email, u.year_level,
            e.id AS enrollment_id, e.status,
            e.numeric_grade, e.letter_grade
     FROM enrollments e
     JOIN users u ON u.id = e.student_id
     WHERE e.section_id = $1
     ORDER BY u.full_name`,
    [sectionId],
  );

  return { section: section[0], students };
}

export async function exportRosterCsv(sectionId: string) {
  const roster = await getRoster(sectionId);
  if (!roster) throw Object.assign(new Error('Section not found'), { status: 404 });

  const csvSafe = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = ['User Code', 'Name', 'Email', 'Year Level', 'Status'].join(',');
  const rows = (roster.students as {
    user_code: string | null; full_name: string; email: string;
    year_level: number | null; status: string;
  }[]).map(s => [
    csvSafe(s.user_code),
    csvSafe(s.full_name),
    csvSafe(s.email),
    s.year_level ?? '',
    s.status,
  ].join(','));

  return {
    csv: [header, ...rows].join('\n'),
    sectionCode: (roster.section as { section_code: string }).section_code,
  };
}


// ─── Auto-pass TBA sections at term close ───────────────────────────────────

/**
 * Returns a preview of what `autoPassTbaSections` would do — every section in
 * the term that still has no faculty assigned plus a count of the active
 * (status='enrolled') students attached. Used by the admin Terms page to
 * decide whether to run the action.
 */
export async function previewTbaAutoPass(termId: string) {
  const { rows: term } = await db.query(`SELECT id, name FROM terms WHERE id = $1`, [termId]);
  if (!term[0]) throw Object.assign(new Error('Term not found'), { status: 404 });

  const { rows: sections } = await db.query(
    `SELECT s.id           AS section_id,
            s.section_code,
            c.code          AS course_code,
            c.title         AS course_title,
            p.code || ' ' || b.year_level || '-' || b.block_number AS block_label,
            COUNT(e.id) FILTER (WHERE e.status = 'enrolled')::int AS students
     FROM sections s
     JOIN courses  c ON c.id = s.course_id
     JOIN blocks   b ON b.id = s.block_id
     JOIN programs p ON p.id = b.program_id
     LEFT JOIN enrollments e ON e.section_id = s.id
     WHERE s.term_id = $1 AND s.faculty_id IS NULL
     GROUP BY s.id, c.code, c.title, p.code, b.year_level, b.block_number
     HAVING COUNT(e.id) FILTER (WHERE e.status = 'enrolled') > 0
     ORDER BY p.code, b.year_level, b.block_number, c.code`,
    [termId],
  );

  const totalStudents = sections.reduce((s: number, r: { students: number }) => s + Number(r.students), 0);
  return {
    term:     { id: term[0].id, name: term[0].name },
    sections,
    summary:  {
      sectionsAffected: sections.length,
      studentsAffected: totalStudents,
    },
  };
}

/**
 * Auto-pass every still-enrolled student in every TBA section of `termId`.
 *
 * Policy: when the registrar never staffed a section by term close, students
 * shouldn't be penalised — they receive the highest PH grade (1.00 / 100) and
 * status = completed.
 *
 * Runs inside a single transaction so a partial failure doesn't leave the
 * gradebook half-updated. Per-enrollment audit logs (`AUTO_PASS_TBA`) record
 * the section context for traceability, and each student gets an in-app
 * notification.
 */
export async function autoPassTbaSections(termId: string, adminId: string) {
  const preview = await previewTbaAutoPass(termId);
  if (preview.sections.length === 0) {
    return { sectionsProcessed: 0, studentsPromoted: 0 };
  }
  const termName = preview.term.name;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    let studentsPromoted = 0;
    const notifications: { userId: string; kind: string; title: string; body: string; link: string; data: Record<string, unknown> }[] = [];

    for (const section of preview.sections as {
      section_id: string; section_code: string; course_code: string; course_title: string;
    }[]) {
      const { rows: updated } = await client.query(
        `UPDATE enrollments
         SET numeric_grade = 100,
             letter_grade  = '1.00',
             status        = 'completed',
             finalized_at  = now(),
             finalized_by  = $1
         WHERE section_id = $2 AND status = 'enrolled'
         RETURNING id, student_id`,
        [adminId, section.section_id],
      );
      studentsPromoted += updated.length;

      for (const u of updated as { id: string; student_id: string }[]) {
        // Per-enrollment audit row — same shape as a normal FINALIZE_GRADE but
        // with the TBA reason inlined so compliance can spot them later.
        await client.query(
          `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value)
           VALUES ($1, 'AUTO_PASS_TBA', 'enrollments', $2, $3)`,
          [
            adminId,
            u.id,
            JSON.stringify({
              termId,
              termName,
              sectionId:    section.section_id,
              sectionCode:  section.section_code,
              courseCode:   section.course_code,
              reason:       'Section had no faculty assigned at term close',
              numericGrade: 100,
              letterGrade:  '1.00',
            }),
          ],
        );

        notifications.push({
          userId: u.student_id,
          kind:   'grade_finalized',
          title:  'Final grade posted',
          body:   `${section.course_title} (${section.section_code}) — automatic 1.00 (section had no assigned faculty).`,
          link:   '/student/grades',
          data:   { sectionId: section.section_id, enrollmentId: u.id, letterGrade: '1.00', auto: true },
        });
      }
    }

    await createNotifications(notifications, client);

    await client.query('COMMIT');
    return { sectionsProcessed: preview.sections.length, studentsPromoted };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ─── Pending enrollment (self-enlistment) ───────────────────────────────────

/**
 * Returns the student's pending sections in the active term so the COR page
 * can render a "confirm enrollment" prompt. Returns `null` if there's nothing
 * pending.
 */
export async function getPendingEnrollment(studentId: string) {
  const { rows: u } = await db.query(
    `SELECT id, user_code, full_name FROM users WHERE id = $1 AND role = 'student'`,
    [studentId],
  );
  if (!u[0]) throw Object.assign(new Error('Student not found'), { status: 404 });

  const { rows: pending } = await db.query(
    `SELECT e.id AS enrollment_id,
            s.section_code,
            s.day_of_week, s.start_time::text AS start_time, s.end_time::text AS end_time,
            s.room,
            c.code  AS course_code, c.title AS course_title, c.units,
            t.id AS term_id, t.name AS term_name, t.semester AS term_semester,
            t.start_date, t.end_date,
            f.full_name AS faculty_name
     FROM enrollments e
     JOIN sections s ON s.id = e.section_id
     JOIN courses  c ON c.id = s.course_id
     JOIN terms    t ON t.id = s.term_id
     LEFT JOIN users f ON f.id = s.faculty_id
     WHERE e.student_id = $1
       AND e.status     = 'pending'
       AND t.is_active  = TRUE
     ORDER BY s.day_of_week NULLS LAST, s.start_time NULLS LAST, c.code`,
    [studentId],
  );

  if (pending.length === 0) return null;
  const first = pending[0];
  const totalUnits = pending.reduce((s: number, r: { units: number }) => s + Number(r.units || 0), 0);

  return {
    student: { code: u[0].user_code, fullName: u[0].full_name },
    term: {
      id:        first.term_id,
      name:      first.term_name,
      semester:  first.term_semester,
      startDate: first.start_date,
      endDate:   first.end_date,
    },
    subjects:   pending,
    totalUnits,
  };
}

/**
 * Flip every pending enrollment for the student in the active term to
 * `enrolled`. Returns the number of rows updated.
 *
 * This is the explicit "I'm attending this semester" handshake. Once
 * confirmed, the student appears on faculty rosters / gradebooks and their
 * schedule + COR populate.
 */
export async function confirmEnrollment(studentId: string): Promise<{ confirmed: number; termName: string | null }> {
  // Find the active term and resolve its name for the audit log + return value.
  const { rows: t } = await db.query(
    `SELECT id, name FROM terms WHERE is_active = TRUE ORDER BY start_date DESC LIMIT 1`,
  );
  if (!t[0]) {
    throw Object.assign(new Error('No active term to confirm enrollment for.'), { status: 409 });
  }
  const termId   = t[0].id as string;
  const termName = t[0].name as string;

  const { rowCount } = await db.query(
    `UPDATE enrollments e
     SET status = 'enrolled'
     FROM sections s
     WHERE e.section_id = s.id
       AND e.student_id = $1
       AND e.status     = 'pending'
       AND s.term_id    = $2`,
    [studentId, termId],
  );

  if ((rowCount ?? 0) > 0) {
    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value)
       VALUES ($1, 'CONFIRM_ENROLLMENT', 'terms', $2, $3)`,
      [studentId, termId, JSON.stringify({ confirmed: rowCount, termName })],
    );
  }

  return { confirmed: rowCount ?? 0, termName };
}

// ─── Active-term schedule (powers .ics export) ───────────────────────────────

/**
 * Returns the calling student's currently-enrolled sections in the active
 * term, with each section's schedule info needed to render an iCalendar
 * feed. Returns `null` if there is no active term or no enrolled sections.
 */
export async function getActiveSchedule(studentId: string) {
  const { rows: u } = await db.query(
    `SELECT id, user_code, full_name FROM users WHERE id = $1 AND role = 'student'`,
    [studentId],
  );
  if (!u[0]) throw Object.assign(new Error('Student not found'), { status: 404 });

  const { rows: enrolls } = await db.query(
    `SELECT e.id AS enrollment_id,
            s.section_code,
            s.day_of_week,
            s.start_time::text AS start_time,
            s.end_time::text   AS end_time,
            s.room,
            c.code  AS course_code,
            c.title AS course_title,
            t.id AS term_id, t.name AS term_name,
            t.start_date, t.end_date,
            f.full_name AS faculty_name
     FROM enrollments e
     JOIN sections s ON s.id = e.section_id
     JOIN courses  c ON c.id = s.course_id
     JOIN terms    t ON t.id = s.term_id
     LEFT JOIN users f ON f.id = s.faculty_id
     WHERE e.student_id = $1
       AND e.status     = 'enrolled'
       AND t.is_active  = TRUE
     ORDER BY s.day_of_week NULLS LAST, s.start_time NULLS LAST, c.code`,
    [studentId],
  );

  if (enrolls.length === 0) return null;
  const first = enrolls[0];

  return {
    student: { code: u[0].user_code, fullName: u[0].full_name },
    term: {
      id:        first.term_id,
      name:      first.term_name,
      startDate: first.start_date,
      endDate:   first.end_date,
    },
    enrollments: enrolls,
  };
}

// ─── Certificate of Registration (COR) ───────────────────────────────────────

/**
 * Returns everything needed to render a student's Certificate of Registration
 * for the currently active term: student profile, program, block, term info,
 * and the list of registered subjects with schedule + faculty.
 *
 * If there is no currently active term, or the student has no enrollments in
 * it, returns `null` so the caller can 404 with a helpful message.
 */
export async function getCorData(studentId: string) {
  const { rows: studentRows } = await db.query(
    `SELECT u.id, u.user_code, u.full_name, u.email, u.year_level,
            p.code AS program_code, p.name AS program_name,
            b.year_level AS block_year_level, b.block_number,
            CASE WHEN b.id IS NOT NULL
                 THEN p.code || ' ' || b.year_level || '-' || b.block_number
            END AS block_label
     FROM users u
     LEFT JOIN programs p ON p.id = u.program_id
     LEFT JOIN blocks   b ON b.id = u.block_id
     WHERE u.id = $1 AND u.role = 'student'`,
    [studentId],
  );
  if (!studentRows[0]) {
    throw Object.assign(new Error('Student not found'), { status: 404 });
  }
  const student = studentRows[0];

  // The student's enrollments in the currently active term — these are the
  // rows that will fill the COR's subject table.
  const { rows: enrollments } = await db.query(
    `SELECT e.id AS enrollment_id, e.status,
            s.id AS section_id, s.section_code,
            s.day_of_week, s.start_time::text AS start_time, s.end_time::text AS end_time,
            s.room,
            c.code AS course_code, c.title AS course_title, c.units,
            t.id AS term_id, t.name AS term_name, t.semester AS term_semester,
            t.start_date, t.end_date,
            f.full_name AS faculty_name
     FROM enrollments e
     JOIN sections s ON s.id = e.section_id
     JOIN terms    t ON t.id = s.term_id
     JOIN courses  c ON c.id = s.course_id
     LEFT JOIN users f ON f.id = s.faculty_id
     WHERE e.student_id = $1
       AND e.status     = 'enrolled'
       AND t.is_active  = TRUE
     ORDER BY s.day_of_week NULLS LAST, s.start_time NULLS LAST, c.code`,
    [studentId],
  );

  if (enrollments.length === 0) return null;

  // Every row carries the term fields; lift them to a single object for the header.
  const first = enrollments[0];
  const term = {
    id:         first.term_id,
    name:       first.term_name,
    semester:   first.term_semester,
    startDate:  first.start_date,
    endDate:    first.end_date,
  };
  const totalUnits = enrollments.reduce((sum: number, e: { units: number }) => sum + Number(e.units || 0), 0);

  return {
    student,
    term,
    subjects: enrollments,
    totalUnits,
    issuedAt: new Date(),
  };
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
