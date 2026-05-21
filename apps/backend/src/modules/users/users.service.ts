import bcrypt from 'bcryptjs';
import { db } from '../../config/db';

const SAFE_COLS = 'id, email, full_name, role, is_active, created_at';

export async function listUsers(role?: string) {
  const { rows } = role
    ? await db.query(`SELECT ${SAFE_COLS} FROM users WHERE role = $1 ORDER BY full_name`, [role])
    : await db.query(`SELECT ${SAFE_COLS} FROM users ORDER BY full_name`);
  return rows;
}

export async function getUserById(id: string) {
  const { rows } = await db.query(
    `SELECT ${SAFE_COLS} FROM users WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function createUser(data: {
  email: string; password: string; fullName: string; role: string;
}) {
  const hash = await bcrypt.hash(data.password, 12);
  const { rows } = await db.query(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING ${SAFE_COLS}`,
    [data.email, hash, data.fullName, data.role],
  );
  return rows[0];
}

export async function updateUser(id: string, data: {
  fullName?: string; isActive?: boolean; password?: string;
}) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (data.fullName !== undefined) { sets.push(`full_name = $${i++}`); vals.push(data.fullName); }
  if (data.isActive !== undefined) { sets.push(`is_active = $${i++}`); vals.push(data.isActive); }
  if (data.password !== undefined) {
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
