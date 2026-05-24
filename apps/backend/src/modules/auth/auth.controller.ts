import { Request, Response, NextFunction } from 'express';
import { loginSchema } from './auth.schema';
import { loginUser } from './auth.service';
import { db } from '../../config/db';

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userCode, password } = loginSchema.parse(req.body);
    const result = await loginUser(userCode, password);
    res.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid credentials') {
      res.status(401).json({ error: 'Invalid user code or password' });
      return;
    }
    next(err);
  }
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.user_code, u.email, u.full_name, u.role, u.branch,
              u.program_id, u.year_level,
              p.code AS program_code, p.name AS program_name,
              CASE WHEN b.id IS NOT NULL
                   THEN p.code || ' ' || b.year_level || '-' || b.block_number
              END AS block_label
       FROM users u
       LEFT JOIN programs p        ON p.id  = u.program_id
       LEFT JOIN blocks b          ON b.id  = u.block_id
       WHERE u.id = $1`,
      [req.user!.sub],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const u = rows[0];
    res.json({
      id:          u.id,
      userCode:    u.user_code,
      email:       u.email,
      fullName:    u.full_name,
      role:        u.role,
      branch:      u.branch,
      programId:   u.program_id,
      programCode: u.program_code,
      programName: u.program_name,
      yearLevel:   u.year_level,
      blockLabel:  u.block_label,
    });
  } catch (err) {
    next(err);
  }
}
