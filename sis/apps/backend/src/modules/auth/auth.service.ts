import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../../config/db';
import { env } from '../../config/env';
import { JwtPayload, UserRole } from '../../middleware/auth';

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
}

export async function loginUser(email: string, password: string) {
  const { rows } = await db.query<UserRow>(
    'SELECT id, email, password_hash, full_name, role, is_active FROM users WHERE email = $1',
    [email],
  );

  const user = rows[0];
  if (!user || !user.is_active) {
    throw new Error('Invalid credentials');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new Error('Invalid credentials');
  }

  const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
  const token = jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
    },
  };
}
