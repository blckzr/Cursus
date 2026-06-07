/**
 * Grade appeals — state-machine workflow:
 *
 *   pending → faculty_review → resolved
 *                          → dean_review → resolved
 *           → withdrawn                                  (student abandons)
 *
 * Rules:
 *   • A student can submit AT MOST one appeal per enrollment (UNIQUE constraint).
 *   • Submission window: 14 days from `enrollments.finalized_at`.
 *   • Only the section's faculty can pick up / resolve / escalate.
 *   • Only admin can resolve a dean-review appeal.
 *   • Resolution with outcome='grade_changed' rewrites enrollments.numeric_grade
 *     + letter_grade and writes an audit row.
 *   • Every transition fires a notification to the relevant counterpart.
 */

import { db } from '../../config/db';
import { createMany as createNotifications } from '../notifications/notifications.service';

const APPEAL_WINDOW_DAYS = 14;

// ─── Shared SELECT — joins the human-readable context onto each appeal ──────
const APPEAL_SELECT = `
  SELECT a.id, a.enrollment_id, a.student_id, a.reason, a.status,
         a.faculty_note, a.dean_note, a.outcome,
         a.resolved_grade, a.resolved_numeric, a.created_at, a.resolved_at,
         u.full_name  AS student_name,
         u.user_code  AS student_code,
         e.numeric_grade AS current_numeric,
         e.letter_grade  AS current_letter,
         e.finalized_at,
         s.id AS section_id, s.section_code, s.faculty_id,
         c.code  AS course_code, c.title AS course_title, c.units,
         t.id AS term_id, t.name AS term_name,
         f.full_name AS faculty_name
  FROM grade_appeals a
  JOIN enrollments e ON e.id = a.enrollment_id
  JOIN sections    s ON s.id = e.section_id
  JOIN courses     c ON c.id = s.course_id
  JOIN terms       t ON t.id = s.term_id
  JOIN users       u ON u.id = a.student_id
  LEFT JOIN users  f ON f.id = s.faculty_id
`;

// ─── Create ─────────────────────────────────────────────────────────────────

export async function createAppeal(studentId: string, data: { enrollmentId: string; reason: string }) {
  // Verify the enrollment belongs to this student, has a finalized grade, and
  // is within the appeal window.
  const { rows: e } = await db.query(
    `SELECT e.id, e.student_id, e.finalized_at, s.faculty_id
     FROM enrollments e
     JOIN sections s ON s.id = e.section_id
     WHERE e.id = $1`,
    [data.enrollmentId],
  );
  if (!e[0]) throw Object.assign(new Error('Enrollment not found'), { status: 404 });
  if (e[0].student_id !== studentId) {
    throw Object.assign(new Error('You can only appeal your own grades.'), { status: 403 });
  }
  if (!e[0].finalized_at) {
    throw Object.assign(new Error('This grade has not been finalized yet.'), { status: 409 });
  }
  const ageMs = Date.now() - new Date(e[0].finalized_at).getTime();
  if (ageMs > APPEAL_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
    throw Object.assign(
      new Error(`Appeal window has closed. Appeals must be filed within ${APPEAL_WINDOW_DAYS} days of finalization.`),
      { status: 409 },
    );
  }

  const { rows: dup } = await db.query(
    `SELECT id FROM grade_appeals WHERE enrollment_id = $1`,
    [data.enrollmentId],
  );
  if (dup[0]) {
    throw Object.assign(new Error('An appeal already exists for this grade.'), { status: 409 });
  }

  const { rows } = await db.query(
    `INSERT INTO grade_appeals (enrollment_id, student_id, reason)
     VALUES ($1, $2, $3) RETURNING id`,
    [data.enrollmentId, studentId, data.reason],
  );
  const appealId = rows[0].id as string;

  // Audit + notify the faculty
  await db.query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value)
     VALUES ($1, 'APPEAL_SUBMITTED', 'grade_appeals', $2, $3)`,
    [studentId, appealId, JSON.stringify({ enrollmentId: data.enrollmentId })],
  );
  if (e[0].faculty_id) {
    await createNotifications([{
      userId: e[0].faculty_id,
      kind:   'appeal_update',
      title:  'New grade appeal',
      body:   'A student has appealed a final grade in one of your sections.',
      link:   '/faculty/appeals',
      data:   { appealId },
    }]);
  }

  return await getById(appealId);
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function getById(id: string) {
  const { rows } = await db.query(`${APPEAL_SELECT} WHERE a.id = $1`, [id]);
  return rows[0] ?? null;
}

/** Student's own appeals. */
export async function listMyAppeals(studentId: string) {
  const { rows } = await db.query(
    `${APPEAL_SELECT} WHERE a.student_id = $1 ORDER BY a.created_at DESC`,
    [studentId],
  );
  return rows;
}

/** Faculty: appeals on sections they teach. Optional status filter. */
export async function listForFaculty(facultyId: string, status?: string) {
  const params: unknown[] = [facultyId];
  let where = `s.faculty_id = $1`;
  if (status) { params.push(status); where += ` AND a.status = $${params.length}`; }
  const { rows } = await db.query(
    `${APPEAL_SELECT} WHERE ${where} ORDER BY a.created_at DESC`,
    params,
  );
  return rows;
}

/** Admin: every appeal. Optional status filter. */
export async function listForAdmin(status?: string) {
  const params: unknown[] = [];
  let where = '';
  if (status) { params.push(status); where = `WHERE a.status = $1`; }
  const { rows } = await db.query(
    `${APPEAL_SELECT} ${where} ORDER BY a.created_at DESC`,
    params,
  );
  return rows;
}

// ─── Transitions ────────────────────────────────────────────────────────────

/**
 * Loads the appeal + asserts the actor is allowed to touch it given their role.
 * Returns the joined appeal row so transitions can also see section/student
 * context without an extra query.
 */
async function loadOrThrow(
  appealId: string,
  actorId: string,
  role: 'student' | 'faculty' | 'admin',
) {
  const { rows } = await db.query(`${APPEAL_SELECT} WHERE a.id = $1`, [appealId]);
  const a = rows[0];
  if (!a) throw Object.assign(new Error('Appeal not found'), { status: 404 });

  if (role === 'student' && a.student_id !== actorId) {
    throw Object.assign(new Error('Access denied'), { status: 403 });
  }
  if (role === 'faculty' && a.faculty_id !== actorId) {
    throw Object.assign(new Error('You are not the faculty for this section'), { status: 403 });
  }
  // Admin can touch anything
  return a;
}

/** Faculty picks up a pending appeal. pending → faculty_review. */
export async function acceptAppeal(appealId: string, actorId: string, facultyNote?: string) {
  const a = await loadOrThrow(appealId, actorId, 'faculty');
  if (a.status !== 'pending') {
    throw Object.assign(new Error(`Cannot accept an appeal in status "${a.status}".`), { status: 409 });
  }
  await db.query(
    `UPDATE grade_appeals
     SET status = 'faculty_review', faculty_note = COALESCE($2, faculty_note)
     WHERE id = $1`,
    [appealId, facultyNote ?? null],
  );
  await logAndNotify(appealId, actorId, 'APPEAL_ACCEPTED', {
    studentId: a.student_id,
    title:     'Your appeal is under review',
    body:      `${a.faculty_name ?? 'Your faculty'} accepted your appeal for ${a.course_code}. They'll respond shortly.`,
    link:      '/student/appeals',
  });
  return getById(appealId);
}

/** Faculty resolves with grade change or denial. faculty_review → resolved. */
export async function facultyResolve(
  appealId: string,
  actorId: string,
  data: { outcome: 'grade_changed' | 'denied'; facultyNote: string;
          resolvedGrade?: string; resolvedNumeric?: number },
) {
  const a = await loadOrThrow(appealId, actorId, 'faculty');
  if (a.status !== 'faculty_review') {
    throw Object.assign(new Error(`Cannot resolve from status "${a.status}".`), { status: 409 });
  }
  await applyResolution(a, actorId, {
    outcome:         data.outcome,
    noteField:       'faculty_note',
    note:            data.facultyNote,
    resolvedGrade:   data.resolvedGrade,
    resolvedNumeric: data.resolvedNumeric,
  });
  await logAndNotify(appealId, actorId, 'APPEAL_RESOLVED', {
    studentId: a.student_id,
    title:     data.outcome === 'grade_changed' ? 'Your grade was changed' : 'Your appeal was denied',
    body:      data.outcome === 'grade_changed'
      ? `${a.course_code}: new grade ${data.resolvedGrade}.`
      : `${a.course_code}: appeal denied. See the faculty's note.`,
    link:      '/student/appeals',
  });
  return getById(appealId);
}

/** Faculty escalates to admin. faculty_review → dean_review. */
export async function escalate(appealId: string, actorId: string, facultyNote: string) {
  const a = await loadOrThrow(appealId, actorId, 'faculty');
  if (a.status !== 'faculty_review') {
    throw Object.assign(new Error(`Cannot escalate from status "${a.status}".`), { status: 409 });
  }
  await db.query(
    `UPDATE grade_appeals
     SET status = 'dean_review', faculty_note = $2
     WHERE id = $1`,
    [appealId, facultyNote],
  );
  // Notify the student + every admin.
  await logAndNotify(appealId, actorId, 'APPEAL_ESCALATED', {
    studentId: a.student_id,
    title:     'Your appeal was escalated',
    body:      `${a.course_code}: the faculty referred your appeal to the dean.`,
    link:      '/student/appeals',
  });
  const { rows: admins } = await db.query(`SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE`);
  await createNotifications(admins.map((r: { id: string }) => ({
    userId: r.id,
    kind:   'appeal_update',
    title:  'Grade appeal escalated',
    body:   `${a.course_code}: a faculty has referred a grade appeal for dean review.`,
    link:   '/admin/appeals',
    data:   { appealId },
  })));
  return getById(appealId);
}

/** Admin resolves a dean-review appeal. dean_review → resolved. */
export async function deanResolve(
  appealId: string,
  actorId: string,
  data: { outcome: 'grade_changed' | 'denied'; deanNote: string;
          resolvedGrade?: string; resolvedNumeric?: number },
) {
  const a = await loadOrThrow(appealId, actorId, 'admin');
  if (a.status !== 'dean_review') {
    throw Object.assign(new Error(`Cannot resolve from status "${a.status}".`), { status: 409 });
  }
  await applyResolution(a, actorId, {
    outcome:         data.outcome,
    noteField:       'dean_note',
    note:            data.deanNote,
    resolvedGrade:   data.resolvedGrade,
    resolvedNumeric: data.resolvedNumeric,
  });
  await logAndNotify(appealId, actorId, 'APPEAL_RESOLVED', {
    studentId: a.student_id,
    title:     data.outcome === 'grade_changed' ? 'Dean changed your grade' : 'Dean denied your appeal',
    body:      data.outcome === 'grade_changed'
      ? `${a.course_code}: new grade ${data.resolvedGrade}.`
      : `${a.course_code}: appeal denied by the dean.`,
    link:      '/student/appeals',
  });
  // Also notify the original faculty.
  if (a.faculty_id) {
    await createNotifications([{
      userId: a.faculty_id,
      kind:   'appeal_update',
      title:  'Appeal resolved by dean',
      body:   `${a.course_code}: the dean ${data.outcome === 'grade_changed' ? 'changed the grade' : 'denied the appeal'}.`,
      link:   '/faculty/appeals',
      data:   { appealId },
    }]);
  }
  return getById(appealId);
}

/** Student withdraws their own appeal. Any non-resolved status → withdrawn. */
export async function withdraw(appealId: string, actorId: string) {
  const a = await loadOrThrow(appealId, actorId, 'student');
  if (a.status === 'resolved' || a.status === 'withdrawn') {
    throw Object.assign(new Error('Appeal is already final.'), { status: 409 });
  }
  await db.query(
    `UPDATE grade_appeals
     SET status = 'withdrawn', outcome = 'withdrawn', resolved_at = now()
     WHERE id = $1`,
    [appealId],
  );
  await db.query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value)
     VALUES ($1, 'APPEAL_WITHDRAWN', 'grade_appeals', $2, $3)`,
    [actorId, appealId, JSON.stringify({ status: 'withdrawn' })],
  );
  // Inform whoever was actively reviewing it.
  const recipients: { userId: string }[] = [];
  if (a.faculty_id && (a.status === 'pending' || a.status === 'faculty_review')) {
    recipients.push({ userId: a.faculty_id });
  }
  if (a.status === 'dean_review') {
    const { rows: admins } = await db.query(`SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE`);
    for (const r of admins) recipients.push({ userId: r.id });
  }
  if (recipients.length > 0) {
    await createNotifications(recipients.map(r => ({
      userId: r.userId,
      kind:   'appeal_update',
      title:  'Appeal withdrawn',
      body:   `${a.course_code}: the student withdrew their appeal.`,
      link:   a.faculty_id === r.userId ? '/faculty/appeals' : '/admin/appeals',
      data:   { appealId },
    })));
  }
  return getById(appealId);
}

// ─── Internals ──────────────────────────────────────────────────────────────

/**
 * Writes the final state + note + (if grade-changing) updates the enrollment.
 * The actorId is used as `finalized_by` so the audit trail names the resolver.
 */
async function applyResolution(
  appeal: { id: string; enrollment_id: string; current_letter: string | null; current_numeric: string | null },
  actorId: string,
  data: {
    outcome:         'grade_changed' | 'denied';
    noteField:       'faculty_note' | 'dean_note';
    note:            string;
    resolvedGrade?:  string;
    resolvedNumeric?: number;
  },
) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE grade_appeals
       SET status      = 'resolved',
           outcome     = $2,
           ${data.noteField} = $3,
           resolved_grade   = $4,
           resolved_numeric = $5,
           resolved_at  = now()
       WHERE id = $1`,
      [
        appeal.id,
        data.outcome,
        data.note,
        data.outcome === 'grade_changed' ? data.resolvedGrade  ?? null : null,
        data.outcome === 'grade_changed' ? data.resolvedNumeric ?? null : null,
      ],
    );

    if (data.outcome === 'grade_changed') {
      await client.query(
        `UPDATE enrollments
         SET letter_grade  = $2,
             numeric_grade = $3,
             finalized_by  = $4,
             finalized_at  = now()
         WHERE id = $1`,
        [appeal.enrollment_id, data.resolvedGrade, data.resolvedNumeric, actorId],
      );
      await client.query(
        `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
         VALUES ($1, 'APPEAL_GRADE_CHANGE', 'enrollments', $2, $3, $4)`,
        [
          actorId,
          appeal.enrollment_id,
          JSON.stringify({ letter: appeal.current_letter, numeric: appeal.current_numeric }),
          JSON.stringify({ letter: data.resolvedGrade,   numeric: data.resolvedNumeric, appealId: appeal.id }),
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

async function logAndNotify(
  appealId: string,
  actorId: string,
  action: string,
  notify: { studentId: string; title: string; body: string; link: string },
) {
  await db.query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
     VALUES ($1, $2, 'grade_appeals', $3)`,
    [actorId, action, appealId],
  );
  await createNotifications([{
    userId: notify.studentId,
    kind:   'appeal_update',
    title:  notify.title,
    body:   notify.body,
    link:   notify.link,
    data:   { appealId },
  }]);
}
