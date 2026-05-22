import bcrypt from 'bcryptjs';
import { db } from '../../config/db';

const SAFE_COLS = 'id, user_code, email, full_name, role, branch, program_id, is_active, created_at';

// List/detail query — includes the program code + name via a join
const LIST_QUERY = `
  SELECT u.id, u.user_code, u.email, u.full_name, u.role, u.branch,
         u.program_id, u.is_active, u.created_at,
         p.code AS program_code, p.name AS program_name
  FROM users u
  LEFT JOIN programs p ON p.id = u.program_id
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

  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, full_name, role, branch, user_code, program_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${SAFE_COLS}`,
    [data.email, hash, data.fullName, data.role, branch, userCode, data.programId ?? null],
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
  if (data.programId !== undefined) { sets.push(`program_id = $${i++}`); vals.push(data.programId); }
  if (data.password  !== undefined) {
    sets.push(`password_hash = $${i++}`);
    vals.push(await bcrypt.hash(data.password, 12));
  }

  if (sets.length === 0) return getUserById(id);

  vals.push(id);
  const { rows } = await db.query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${i} RETURNING ${SAFE_COLS}`,
    vals,
  );
  return rows[0] ?? null;
}
