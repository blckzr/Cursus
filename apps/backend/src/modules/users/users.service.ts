import bcrypt from 'bcryptjs';
import { db } from '../../config/db';
import { pickRandomBlock } from '../blocks/blocks.service';

/**
 * Default password assigned to every newly created account. The user is
 * expected to change it on first login. Exported so the notifications/email
 * layer can include it in the onboarding message.
 */
export const DEFAULT_NEW_USER_PASSWORD = '1.PolytechnicU';

const SAFE_COLS =
  'id, user_code, email, full_name, role, branch, program_id, year_level, block_id, is_active, graduated_at, created_at';

// List/detail query — includes program code/name and the block label via joins
const LIST_QUERY = `
  SELECT u.id, u.user_code, u.email, u.full_name, u.role, u.branch,
         u.program_id, u.year_level, u.block_id, u.is_active, u.graduated_at, u.created_at,
         p.code AS program_code, p.name AS program_name,
         b.block_number,
         CASE WHEN b.id IS NOT NULL
              THEN p.code || ' ' || b.year_level || '-' || b.block_number
         END AS block_label
  FROM users u
  LEFT JOIN programs p ON p.id = u.program_id
  LEFT JOIN blocks   b ON b.id = u.block_id
`;

const roleToNum = (role: string) =>
  role === 'student' ? '0' : role === 'faculty' ? '1' : '2';

// Each role draws from its own sequence so numbering stays continuous per role.
const roleToSeq = (role: string) =>
  role === 'student' ? 'student_code_seq'
  : role === 'faculty' ? 'faculty_code_seq'
  : 'admin_code_seq';

async function generateUserCode(role: string, branch: string, createdYear: number): Promise<string> {
  // role is validated by Zod enum upstream, so this seq name is from a fixed safe set
  const { rows } = await db.query(`SELECT nextval('${roleToSeq(role)}') AS seq`);
  const seq     = String(rows[0].seq).padStart(5, '0');
  return `${createdYear}-${seq}-${branch.toUpperCase()}-${roleToNum(role)}`;
}

export async function listUsers(role?: string) {
  const { rows } = role
    ? await db.query(`${LIST_QUERY} WHERE u.role = $1 ORDER BY u.user_code`, [role])
    : await db.query(`${LIST_QUERY} ORDER BY u.user_code`);
  return rows;
}

export async function getUserById(id: string) {
  const { rows } = await db.query(`${LIST_QUERY} WHERE u.id = $1`, [id]);
  return rows[0] ?? null;
}

export async function createUser(data: {
  email: string; password?: string; fullName: string; role: string;
  branch?: string; programId?: string;
}) {
  const branch   = (data.branch ?? 'MN').toUpperCase();
  const year     = new Date().getFullYear();
  // Use the supplied password if given, otherwise the system default.
  const password = data.password ?? DEFAULT_NEW_USER_PASSWORD;
  const hash     = await bcrypt.hash(password, 12);
  const userCode = await generateUserCode(data.role, branch, year);

  // Students are auto-assigned to a random year-1 block of their program.
  let yearLevel: number | null = null;
  let blockSectionId: string | null = null;
  if (data.role === 'student' && data.programId) {
    yearLevel = 1;
    blockSectionId = await pickRandomBlock(data.programId, 1);
    if (!blockSectionId) {
      throw Object.assign(
        new Error('All year-1 blocks for this program are full. Add more blocks or raise the capacity in the Programs page.'),
        { status: 409 },
      );
    }
  }

  // Force the password-change flow on the user's first login. The admin only
  // controls the *initial* credential (default `1.PolytechnicU` for now), so
  // the new account is in a "shared password" state until the user replaces it.
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, full_name, role, branch, user_code,
                        program_id, year_level, block_id, password_must_change)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
     RETURNING ${SAFE_COLS}`,
    [data.email, hash, data.fullName, data.role, branch, userCode,
     data.programId ?? null, yearLevel, blockSectionId],
  );

  // Auto-enroll new student into every section of their block in any active term.
  // (No-op if the term hasn't been opened yet — they get picked up when 'Open term' runs.)
  if (data.role === 'student' && blockSectionId) {
    await enrollStudentInBlockActiveSections(rows[0].id, blockSectionId);
  }

  return rows[0];
}

/**
 * Enrolls a student into every section linked to a block in any currently active term.
 * Used both when creating a new student and when reassigning a student's block.
 * Idempotent — re-running skips duplicates.
 */
async function enrollStudentInBlockActiveSections(studentId: string, blockId: string) {
  // Same posture as Open Term: speculative `pending` rows, student confirms
  // on their COR page. Keeps enlistment behaviour consistent regardless of
  // whether the student is created mid-term or via Open Term.
  await db.query(
    `INSERT INTO enrollments (student_id, section_id, status)
     SELECT $1, s.id, 'pending'::enroll_status
     FROM sections s
     JOIN terms t ON t.id = s.term_id
     WHERE s.block_id = $2 AND t.is_active = TRUE
     ON CONFLICT (student_id, section_id) DO NOTHING`,
    [studentId, blockId],
  );
}

export async function updateUser(id: string, data: {
  fullName?: string; isActive?: boolean; password?: string; branch?: string; programId?: string;
}) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (data.fullName  !== undefined) { sets.push(`full_name = $${i++}`);  vals.push(data.fullName); }
  if (data.isActive  !== undefined) { sets.push(`is_active = $${i++}`);  vals.push(data.isActive); }
  if (data.branch    !== undefined) { sets.push(`branch = $${i++}`);     vals.push(data.branch.toUpperCase()); }
  if (data.password  !== undefined) {
    sets.push(`password_hash = $${i++}`);
    vals.push(await bcrypt.hash(data.password, 12));
    // An admin resetting the password puts the account back into the
    // forced-change state — same posture as a brand-new account.
    sets.push(`password_must_change = TRUE`);
  }

  if (data.programId !== undefined) {
    sets.push(`program_id = $${i++}`); vals.push(data.programId);

    // If a STUDENT's program actually changes, move them into a block of the new program.
    const { rows: cur } = await db.query(
      'SELECT role, year_level, program_id FROM users WHERE id = $1', [id],
    );
    if (cur[0]?.role === 'student' && cur[0].program_id !== data.programId) {
      const yl = cur[0].year_level ?? 1;
      const blockId = await pickRandomBlock(data.programId, yl);
      if (!blockId) {
        throw Object.assign(
          new Error(`No available block for year ${yl} in the selected program. Add more blocks or raise capacity.`),
          { status: 409 },
        );
      }
      sets.push(`year_level = $${i++}`);       vals.push(yl);
      sets.push(`block_id = $${i++}`); vals.push(blockId);
    }
  }

  if (sets.length === 0) return getUserById(id);

  vals.push(id);
  const { rows } = await db.query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${i} RETURNING ${SAFE_COLS}`,
    vals,
  );

  // If we reassigned the student to a new block (program change), enroll them
  // into that new block's active-term sections.
  if (rows[0]?.role === 'student' && rows[0].block_id) {
    await enrollStudentInBlockActiveSections(rows[0].id, rows[0].block_id);
  }

  return rows[0] ?? null;
}
