import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../../config/db';
import { env } from '../../config/env';
import { JwtPayload, UserRole } from '../../middleware/auth';

interface UserRow {
  id: string;
  user_code: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  branch: string;
  is_active: boolean;
  program_id: string | null;
  year_level: number | null;
  program_code: string | null;
  program_name: string | null;
  block_label: string | null;
  password_must_change: boolean;
  graduated_at: string | null;
}

// Columns shared by /auth/me + /auth/me PATCH + login response.
const PROFILE_SELECT = `
  u.id, u.user_code, u.email, u.full_name, u.role, u.branch, u.is_active,
  u.program_id, u.year_level, u.password_must_change, u.graduated_at,
  p.code AS program_code, p.name AS program_name,
  CASE WHEN b.id IS NOT NULL
       THEN p.code || ' ' || b.year_level || '-' || b.block_number
  END AS block_label
`;

const PROFILE_JOINS = `
  FROM users u
  LEFT JOIN programs p ON p.id = u.program_id
  LEFT JOIN blocks   b ON b.id = u.block_id
`;

function rowToProfile(u: UserRow) {
  const isAlumni = u.role === 'student' && !!u.graduated_at;
  return {
    id:                  u.id,
    userCode:            u.user_code,
    email:               u.email,
    fullName:            u.full_name,
    role:                u.role,
    /**
     * effectiveRole layers an 'alumni' mode on top of role==='student' once
     * `graduated_at` is set. The frontend uses this to branch sidebars and
     * pages; the backend uses `authorizeStudentActive` middleware to 403
     * alumni from active-only routes.
     */
    effectiveRole:       isAlumni ? 'alumni' : u.role,
    graduatedAt:         u.graduated_at,
    branch:              u.branch,
    programId:           u.program_id,
    programCode:         u.program_code,
    programName:         u.program_name,
    yearLevel:           u.year_level,
    blockLabel:          u.block_label,
    passwordMustChange:  !!u.password_must_change,
  };
}

export async function getProfile(userId: string) {
  const { rows } = await db.query<UserRow>(
    `SELECT ${PROFILE_SELECT} ${PROFILE_JOINS} WHERE u.id = $1`,
    [userId],
  );
  return rows[0] ? rowToProfile(rows[0]) : null;
}

export async function loginUser(userCode: string, password: string) {
  const { rows } = await db.query<UserRow>(
    `SELECT ${PROFILE_SELECT}, u.password_hash ${PROFILE_JOINS} WHERE u.user_code = $1`,
    [userCode],
  );

  const user = rows[0];
  if (!user || !user.is_active) throw new Error('Invalid credentials');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error('Invalid credentials');

  const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
  const token = jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);

  return { token, user: rowToProfile(user) };
}

/** Update the calling user's editable profile fields. Returns the fresh profile. */
export async function updateMe(userId: string, data: { fullName?: string; email?: string }) {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;

  if (data.fullName !== undefined) { sets.push(`full_name = $${i++}`); vals.push(data.fullName); }

  if (data.email !== undefined) {
    // Email must remain unique across all users.
    const { rows: existing } = await db.query(
      'SELECT id FROM users WHERE email = $1 AND id <> $2',
      [data.email, userId],
    );
    if (existing[0]) {
      throw Object.assign(
        new Error('Email is already in use by another account.'),
        { status: 409 },
      );
    }
    sets.push(`email = $${i++}`); vals.push(data.email);
  }

  if (sets.length > 0) {
    vals.push(userId);
    await db.query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${i}`, vals);

    await db.query(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_value)
       VALUES ($1, 'UPDATE_PROFILE', 'users', $1, $2)`,
      [userId, JSON.stringify(data)],
    );
  }

  return getProfile(userId);
}

/** Verifies the current password and replaces it. */
export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const { rows } = await db.query<{ password_hash: string }>(
    'SELECT password_hash FROM users WHERE id = $1',
    [userId],
  );
  if (!rows[0]) throw Object.assign(new Error('User not found'), { status: 404 });

  const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!valid) throw Object.assign(new Error('Current password is incorrect.'), { status: 401 });

  const newHash = await bcrypt.hash(newPassword, 12);
  // Clearing `password_must_change` here is what releases the forced-change
  // gate on the frontend — without this, the user would be re-pinned to the
  // /account page on next login.
  await db.query(
    `UPDATE users SET password_hash = $1, password_must_change = FALSE WHERE id = $2`,
    [newHash, userId],
  );

  await db.query(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id)
     VALUES ($1, 'CHANGE_PASSWORD', 'users', $1)`,
    [userId],
  );
}
