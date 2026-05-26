import { db } from '../../config/db';
import type { Semester } from './curriculum.schema';

// Slot ordering: 1 < 2 < summer (per the BSCS handbook — Practicum in Y3 Summer
// has prereqs in Y3 S2, so Summer is treated as strictly AFTER Sem 2).
const SEM_ORDER: Record<Semester, number> = { '1': 1, '2': 2, summer: 3 };

function slotIsBefore(yA: number, sA: Semester, yB: number, sB: Semester): boolean {
  if (yA < yB) return true;
  if (yA > yB) return false;
  return SEM_ORDER[sA] < SEM_ORDER[sB];
}

/** All curriculum entries for a program, joined to the course catalog. */
export async function listCurriculum(programId: string) {
  const { rows } = await db.query(
    `SELECT cc.id, cc.year_level, cc.semester, cc.display_order,
            c.id     AS course_id,
            c.code,
            c.title,
            c.units,
            c.visibility
     FROM curriculum_courses cc
     JOIN courses c ON c.id = cc.course_id
     WHERE cc.program_id = $1
     ORDER BY cc.year_level,
              CASE cc.semester WHEN '1' THEN 1 WHEN '2' THEN 2 ELSE 3 END,
              cc.display_order,
              c.code`,
    [programId],
  );
  return rows;
}

/**
 * Add a course to a program's curriculum at a specific year/semester.
 * Validates that:
 *   1. The course exists.
 *   2. The course is usable by this program (public OR linked via course_programs).
 *   3. The course is not already placed in this program's curriculum.
 *   4. Every prerequisite is already placed in a STRICTLY EARLIER slot.
 */
export async function addCurriculumEntry(programId: string, data: {
  courseId: string; yearLevel: number; semester: Semester; displayOrder?: number;
}) {
  // 1 & 2 — course exists + visibility check
  const { rows: courseRows } = await db.query(
    `SELECT c.visibility,
            EXISTS (SELECT 1 FROM course_programs cp
                    WHERE cp.course_id = c.id AND cp.program_id = $2) AS linked
     FROM courses c WHERE c.id = $1`,
    [data.courseId, programId],
  );
  if (!courseRows[0]) {
    throw Object.assign(new Error('Course not found'), { status: 404 });
  }
  if (courseRows[0].visibility === 'restricted' && !courseRows[0].linked) {
    throw Object.assign(
      new Error('This course is restricted and not available to this program.'),
      { status: 409 },
    );
  }

  // 3 — uniqueness within the program (DB UNIQUE backs this; friendly message here)
  const { rows: dup } = await db.query(
    `SELECT 1 FROM curriculum_courses WHERE program_id = $1 AND course_id = $2`,
    [programId, data.courseId],
  );
  if (dup[0]) {
    throw Object.assign(
      new Error('Course is already placed in this curriculum.'),
      { status: 409 },
    );
  }

  // 4 — prerequisite placement check
  const { rows: prereqs } = await db.query(
    `SELECT pre.code AS prereq_code,
            cc.year_level AS prereq_year,
            cc.semester   AS prereq_sem
     FROM course_prerequisites cp
     JOIN courses pre ON pre.id = cp.prerequisite_id
     LEFT JOIN curriculum_courses cc
       ON cc.course_id = cp.prerequisite_id AND cc.program_id = $1
     WHERE cp.course_id = $2`,
    [programId, data.courseId],
  );
  for (const p of prereqs) {
    if (p.prereq_year == null) {
      throw Object.assign(
        new Error(`Prerequisite ${p.prereq_code} is not yet placed in this program's curriculum.`),
        { status: 409 },
      );
    }
    if (!slotIsBefore(p.prereq_year, p.prereq_sem as Semester, data.yearLevel, data.semester)) {
      throw Object.assign(
        new Error(
          `Prerequisite ${p.prereq_code} sits in Y${p.prereq_year} Sem ${p.prereq_sem} — it must be placed BEFORE Y${data.yearLevel} Sem ${data.semester}.`,
        ),
        { status: 409 },
      );
    }
  }

  const { rows } = await db.query(
    `INSERT INTO curriculum_courses (program_id, course_id, year_level, semester, display_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [programId, data.courseId, data.yearLevel, data.semester, data.displayOrder ?? 0],
  );
  return rows[0];
}

/**
 * The student-facing roadmap view. For each course in the student's program
 * curriculum, returns its status:
 *   completed — finalized enrollment with passing grade (≥ 75)
 *   current   — currently enrolled (status = 'enrolled')
 *   locked    — not yet taken AND at least one prerequisite isn't yet completed
 *   pending   — not yet taken AND all prerequisites are met (or there are none)
 */
export async function getCurriculumProgress(studentId: string) {
  const { rows: u } = await db.query(
    `SELECT program_id FROM users WHERE id = $1 AND role = 'student'`,
    [studentId],
  );
  if (!u[0]) throw Object.assign(new Error('Student not found'), { status: 404 });
  const programId = u[0].program_id;
  if (!programId) return { program: null, entries: [] };

  // Program meta for the page header
  const { rows: programRows } = await db.query(
    `SELECT code, name, total_units FROM programs WHERE id = $1`, [programId],
  );

  // Curriculum + each course's prereqs in one query (aggregated to JSON)
  const { rows: curr } = await db.query(
    `SELECT cc.year_level, cc.semester, cc.display_order,
            c.id AS course_id, c.code AS course_code, c.title AS course_title, c.units,
            COALESCE(
              json_agg(jsonb_build_object('id', pre.id, 'code', pre.code) ORDER BY pre.code)
                FILTER (WHERE pre.id IS NOT NULL),
              '[]'
            ) AS prereqs
     FROM curriculum_courses cc
     JOIN courses c ON c.id = cc.course_id
     LEFT JOIN course_prerequisites cp ON cp.course_id = c.id
     LEFT JOIN courses pre              ON pre.id = cp.prerequisite_id
     WHERE cc.program_id = $1
     GROUP BY cc.year_level, cc.semester, cc.display_order, c.id, c.code, c.title, c.units
     ORDER BY cc.year_level,
              CASE cc.semester WHEN '1' THEN 1 WHEN '2' THEN 2 ELSE 3 END,
              cc.display_order, c.code`,
    [programId],
  );

  // The student's enrollments — most recent per course
  const { rows: enrolls } = await db.query(
    `SELECT DISTINCT ON (s.course_id)
            s.course_id, e.status, e.numeric_grade, e.letter_grade,
            t.name AS term_name
     FROM enrollments e
     JOIN sections s ON s.id = e.section_id
     JOIN terms    t ON t.id = s.term_id
     WHERE e.student_id = $1
     ORDER BY s.course_id, e.enrolled_at DESC`,
    [studentId],
  );
  const enrollByCourse = new Map<string, any>(enrolls.map((e: any) => [e.course_id, e]));
  const passedCourseIds = new Set<string>(
    enrolls
      .filter((e: any) => e.status === 'completed' && Number(e.numeric_grade) >= 75)
      .map((e: any) => e.course_id),
  );

  const entries = curr.map((c: any) => {
    const enrollment = enrollByCourse.get(c.course_id);
    let status: 'completed' | 'current' | 'pending' | 'locked';
    let grade: { numeric: number; letter: string } | null = null;
    let blockedBy: string[] = [];

    if (enrollment?.status === 'enrolled') {
      status = 'current';
    } else if (enrollment?.status === 'completed' && Number(enrollment.numeric_grade) >= 75) {
      status = 'completed';
      grade = {
        numeric: Number(enrollment.numeric_grade),
        letter:  enrollment.letter_grade,
      };
    } else {
      const unmet = (c.prereqs as { id: string; code: string }[])
        .filter(p => !passedCourseIds.has(p.id));
      if (unmet.length > 0) {
        status = 'locked';
        blockedBy = unmet.map(p => p.code);
      } else {
        status = 'pending';
      }
    }

    return {
      yearLevel:   c.year_level,
      semester:    c.semester,
      displayOrder: c.display_order,
      courseId:    c.course_id,
      courseCode:  c.course_code,
      courseTitle: c.course_title,
      units:       c.units,
      status,
      grade,
      blockedBy,
      termName:    enrollment?.term_name ?? null,
    };
  });

  return { program: programRows[0] ?? null, entries };
}

/** Remove a curriculum entry. Blocked if any course in the curriculum depends on it. */
export async function removeCurriculumEntry(programId: string, entryId: string) {
  // Find the course being removed
  const { rows: entry } = await db.query(
    `SELECT cc.course_id, c.code FROM curriculum_courses cc
     JOIN courses c ON c.id = cc.course_id
     WHERE cc.id = $1 AND cc.program_id = $2`,
    [entryId, programId],
  );
  if (!entry[0]) {
    throw Object.assign(new Error('Curriculum entry not found'), { status: 404 });
  }

  // Check if any other course placed in this program depends on this one
  const { rows: dependents } = await db.query(
    `SELECT c.code FROM course_prerequisites cp
     JOIN courses c ON c.id = cp.course_id
     JOIN curriculum_courses cc ON cc.course_id = cp.course_id AND cc.program_id = $1
     WHERE cp.prerequisite_id = $2`,
    [programId, entry[0].course_id],
  );
  if (dependents.length > 0) {
    const list = dependents.map((d: { code: string }) => d.code).join(', ');
    throw Object.assign(
      new Error(`Cannot remove — ${list} depend(s) on ${entry[0].code}. Remove those first.`),
      { status: 409 },
    );
  }

  await db.query('DELETE FROM curriculum_courses WHERE id = $1', [entryId]);
}
