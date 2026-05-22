import bcrypt from 'bcryptjs';
import { db } from '../../config/db';
import { pickRandomBlock } from '../blocks/blocks.service';

const SAFE_COLS =
  'id, user_code, email, full_name, role, branch, program_id, year_level, block_section_id, is_active, created_at';

// List/detail query — includes program code/name and the block label via joins
const LIST_QUERY = `
  SELECT u.id, u.user_code, u.email, u.full_name, u.role, u.branch,
         u.program_id, u.year_level, u.block_section_id, u.is_active, u.created_at,
         p.code AS program_code, p.name AS program_name,
         bs.block_number,
         CASE WHEN bs.id IS NOT NULL
              THEN p.code || ' ' || bs.year_level || '-' || bs.block_number
         END AS block_label
  FROM users u
  LEFT JOIN programs p        ON p.id = u.program_id
  LEFT JOIN block_sections bs ON bs.id = u.block_section_id
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
  email: string; password: string; fullName: string; role: string;
  branch?: string; programId?: string;
}) {
  const branch   = (data.branch ?? 'MN').toUpperCase();
  const year     = new Date().getFullYear();
  const hash     = await bcrypt.hash(data.password, 12);
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

  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, full_name, role, branch, user_code, program_id, year_level, block_section_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${SAFE_COLS}`,
    [data.email, hash, data.fullName, data.role, branch, userCode,
     data.programId ?? null, yearLevel, blockSectionId],
  );
  return rows[0];
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
      sets.push(`block_section_id = $${i++}`); vals.push(blockId);
    }
  }

  if (sets.length === 0) return getUserById(id);

  vals.push(id);
  const { rows } = await db.query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${i} RETURNING ${SAFE_COLS}`,
    vals,
  );
  return rows[0] ?? null;
}
