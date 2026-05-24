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
}

export async function loginUser(userCode: string, password: string) {
  const { rows } = await db.query<UserRow>(
    `SELECT u.id, u.user_code, u.email, u.password_hash, u.full_name, u.role, u.branch, u.is_active,
            u.program_id, u.year_level,
            p.code AS program_code, p.name AS program_name,
            CASE WHEN b.id IS NOT NULL
                 THEN p.code || ' ' || b.year_level || '-' || b.block_number
            END AS block_label
     FROM users u
     LEFT JOIN programs p        ON p.id  = u.program_id
     LEFT JOIN blocks b          ON b.id  = u.block_id
     WHERE u.user_code = $1`,
    [userCode],
  );

  const user = rows[0];
  if (!user || !user.is_active) throw new Error('Invalid credentials');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error('Invalid credentials');

  const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
  const token = jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);

  return {
    token,
    user: {
      id:          user.id,
      userCode:    user.user_code,
      email:       user.email,
      fullName:    user.full_name,
      role:        user.role,
      branch:      user.branch,
      programId:   user.program_id,
      programCode: user.program_code,
      programName: user.program_name,
      yearLevel:   user.year_level,
      blockLabel:  user.block_label,
    },
  };
}
