import { db } from '../../config/db';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Wishlist writes are only allowed for terms that have not been opened. Once
 * `is_active = TRUE` the registrar has provisioned sections from the
 * curriculum and the student's actual enrollment is what matters — the
 * wishlist becomes a read-only historical record.
 */
async function assertTermWritable(termId: string): Promise<void> {
  const { rows } = await db.query(
    `SELECT name, is_active FROM terms WHERE id = $1`,
    [termId],
  );
  if (!rows[0]) {
    throw Object.assign(new Error('Term not found'), { status: 404 });
  }
  if (rows[0].is_active === true || rows[0].is_active === 'true') {
    throw Object.assign(
      new Error(`Wishlist is locked for ${rows[0].name} — the term is already open.`),
      { status: 409 },
    );
  }
}

// ─── Eligible terms ──────────────────────────────────────────────────────────

/**
 * Terms a student can wishlist for. Right now any inactive term is candidate
 * — past terms are filtered out client-side if needed. The list orders by
 * start_date ascending so the "next upcoming" sits at the top.
 */
export async function listEligibleTerms() {
  const { rows } = await db.query(
    `SELECT id, name, semester, start_date, end_date, is_active
     FROM terms
     WHERE is_active = FALSE
     ORDER BY start_date ASC`,
  );
  return rows;
}

// ─── Candidate courses ───────────────────────────────────────────────────────

/**
 * Courses the student *could* add to their wishlist. Re-uses the curriculum
 * progress logic: anything they've already passed or are currently taking is
 * filtered out. `locked` entries (unmet prereqs) are kept — the student may
 * still wishlist them as intent.
 *
 * The semester filter narrows to entries that fit the target term's semester
 * slot, since a "1st sem" subject can't be wishlisted for a "2nd sem" term.
 */
export async function listCandidates(studentId: string, termId: string) {
  const { rows: termRows } = await db.query(
    `SELECT semester FROM terms WHERE id = $1`,
    [termId],
  );
  if (!termRows[0]) {
    throw Object.assign(new Error('Term not found'), { status: 404 });
  }
  const termSemester = termRows[0].semester;

  const { rows: userRows } = await db.query(
    `SELECT program_id, year_level FROM users WHERE id = $1 AND role = 'student'`,
    [studentId],
  );
  if (!userRows[0]) {
    throw Object.assign(new Error('Student not found'), { status: 404 });
  }
  const { program_id: programId, year_level: yearLevel } = userRows[0];
  if (!programId) return [];

  // Curriculum entries for this program × this term's semester, with prereqs.
  const { rows: candidates } = await db.query(
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
     WHERE cc.program_id = $1 AND cc.semester = $2
     GROUP BY cc.year_level, cc.semester, cc.display_order, c.id, c.code, c.title, c.units
     ORDER BY cc.year_level, cc.display_order, c.code`,
    [programId, termSemester],
  );

  // Student's enrollment history — used to skip completed/in-progress courses.
  const { rows: enrolls } = await db.query(
    `SELECT DISTINCT ON (s.course_id)
            s.course_id, e.status, e.numeric_grade
     FROM enrollments e
     JOIN sections s ON s.id = e.section_id
     WHERE e.student_id = $1
     ORDER BY s.course_id, e.enrolled_at DESC`,
    [studentId],
  );
  const skipCourseIds = new Set<string>(
    enrolls
      .filter((e: { status: string; numeric_grade: string | null }) =>
        e.status === 'enrolled' ||
        (e.status === 'completed' && Number(e.numeric_grade) >= 75),
      )
      .map((e: { course_id: string }) => e.course_id),
  );
  const passedCourseIds = new Set<string>(
    enrolls
      .filter((e: { status: string; numeric_grade: string | null }) =>
        e.status === 'completed' && Number(e.numeric_grade) >= 75,
      )
      .map((e: { course_id: string }) => e.course_id),
  );

  // What's already wishlisted for this same term (so the UI can toggle).
  const { rows: already } = await db.query(
    `SELECT course_id FROM wishlist_entries WHERE student_id = $1 AND term_id = $2`,
    [studentId, termId],
  );
  const wishlistedIds = new Set<string>(already.map((r: { course_id: string }) => r.course_id));

  return candidates
    .filter((c: { course_id: string }) => !skipCourseIds.has(c.course_id))
    .map((c: { course_id: string; year_level: number; course_code: string;
                course_title: string; units: number;
                prereqs: { id: string; code: string }[] }) => {
      const unmet = (c.prereqs || []).filter(p => !passedCourseIds.has(p.id));
      return {
        courseId:     c.course_id,
        courseCode:   c.course_code,
        courseTitle:  c.course_title,
        units:        c.units,
        yearLevel:    c.year_level,
        locked:       unmet.length > 0,
        blockedBy:    unmet.map(p => p.code),
        // "Block-mandated" hint: the slot matches the student's own year level.
        isBlockSlot:  c.year_level === yearLevel,
        onWishlist:   wishlistedIds.has(c.course_id),
      };
    });
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export async function listMyWishlist(studentId: string, termId?: string) {
  const params: unknown[] = [studentId];
  let where = 'we.student_id = $1';
  if (termId) {
    params.push(termId);
    where += ` AND we.term_id = $2`;
  }
  const { rows } = await db.query(
    `SELECT we.id, we.term_id, we.course_id, we.priority, we.notes, we.created_at,
            c.code  AS course_code, c.title AS course_title, c.units,
            t.name  AS term_name, t.semester AS term_semester, t.is_active AS term_is_active
     FROM wishlist_entries we
     JOIN courses c ON c.id = we.course_id
     JOIN terms   t ON t.id = we.term_id
     WHERE ${where}
     ORDER BY t.start_date DESC, we.priority ASC, c.code`,
    params,
  );
  return rows;
}

export async function createWishlistEntry(studentId: string, data: {
  termId: string; courseId: string; priority?: number; notes?: string;
}) {
  await assertTermWritable(data.termId);
  const { rows } = await db.query(
    `INSERT INTO wishlist_entries (student_id, term_id, course_id, priority, notes)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (student_id, term_id, course_id)
       DO UPDATE SET priority = EXCLUDED.priority, notes = EXCLUDED.notes
     RETURNING *`,
    [studentId, data.termId, data.courseId, data.priority ?? 3, data.notes ?? null],
  );
  return rows[0];
}

export async function updateWishlistEntry(
  studentId: string,
  id: string,
  data: { priority?: number; notes?: string | null },
) {
  // Verify ownership and term-writability in one fetch.
  const { rows: entry } = await db.query(
    `SELECT we.term_id FROM wishlist_entries we
     WHERE we.id = $1 AND we.student_id = $2`,
    [id, studentId],
  );
  if (!entry[0]) {
    throw Object.assign(new Error('Wishlist entry not found'), { status: 404 });
  }
  await assertTermWritable(entry[0].term_id);

  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (data.priority !== undefined) { sets.push(`priority = $${i++}`); vals.push(data.priority); }
  if (data.notes    !== undefined) { sets.push(`notes    = $${i++}`); vals.push(data.notes); }
  if (sets.length === 0) {
    const { rows } = await db.query(`SELECT * FROM wishlist_entries WHERE id = $1`, [id]);
    return rows[0] ?? null;
  }
  vals.push(id);
  const { rows } = await db.query(
    `UPDATE wishlist_entries SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
    vals,
  );
  return rows[0] ?? null;
}

export async function deleteWishlistEntry(studentId: string, id: string) {
  const { rows: entry } = await db.query(
    `SELECT term_id FROM wishlist_entries WHERE id = $1 AND student_id = $2`,
    [id, studentId],
  );
  if (!entry[0]) {
    throw Object.assign(new Error('Wishlist entry not found'), { status: 404 });
  }
  await assertTermWritable(entry[0].term_id);
  await db.query(`DELETE FROM wishlist_entries WHERE id = $1`, [id]);
}

// ─── Admin aggregate (demand view) ───────────────────────────────────────────

/**
 * Per-course interest count for one term, with a year-level histogram so the
 * registrar can decide whether to open one big section or several smaller
 * year-banded ones.
 *
 * Returns one row per (course, program) pair so e.g. a public course shared
 * across BSCS / BSIT shows the demand split.
 */
export async function listDemand(termId: string) {
  const { rows: termRows } = await db.query(
    `SELECT name FROM terms WHERE id = $1`,
    [termId],
  );
  if (!termRows[0]) {
    throw Object.assign(new Error('Term not found'), { status: 404 });
  }

  const { rows } = await db.query(
    `SELECT c.id AS course_id, c.code, c.title, c.units,
            p.code AS program_code,
            COUNT(*)::int AS demand,
            COUNT(*) FILTER (WHERE we.priority <= 2)::int AS high_priority,
            jsonb_object_agg(COALESCE(u.year_level::text, 'unknown'), 1)
              FILTER (WHERE u.year_level IS NOT NULL) AS by_year_raw,
            json_agg(
              jsonb_build_object(
                'studentId',   u.id,
                'studentName', u.full_name,
                'userCode',    u.user_code,
                'yearLevel',   u.year_level,
                'priority',    we.priority,
                'notes',       we.notes
              ) ORDER BY we.priority, u.full_name
            ) AS students
     FROM wishlist_entries we
     JOIN users    u ON u.id = we.student_id
     JOIN courses  c ON c.id = we.course_id
     LEFT JOIN programs p ON p.id = u.program_id
     WHERE we.term_id = $1
     GROUP BY c.id, c.code, c.title, c.units, p.code
     ORDER BY COUNT(*) DESC, c.code`,
    [termId],
  );

  // Roll up the year breakdown into a sorted, stable shape for the UI.
  return rows.map((r: any) => {
    const yearCounts = new Map<number, number>();
    for (const s of (r.students as { yearLevel: number | null }[])) {
      if (s.yearLevel != null) {
        yearCounts.set(s.yearLevel, (yearCounts.get(s.yearLevel) ?? 0) + 1);
      }
    }
    return {
      courseId:     r.course_id,
      code:         r.code,
      title:        r.title,
      units:        r.units,
      programCode:  r.program_code,
      demand:       r.demand,
      highPriority: r.high_priority,
      byYearLevel:  [...yearCounts.entries()]
        .sort(([a], [b]) => a - b)
        .map(([yearLevel, count]) => ({ yearLevel, count })),
      students:     r.students,
    };
  });
}
