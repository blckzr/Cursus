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
      'SELECT id, user_code, email, full_name, role, branch FROM users WHERE id = $1',
      [req.user!.sub],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const u = rows[0];
    res.json({ id: u.id, userCode: u.user_code, email: u.email, fullName: u.full_name, role: u.role, branch: u.branch });
  } catch (err) {
    next(err);
  }
}
