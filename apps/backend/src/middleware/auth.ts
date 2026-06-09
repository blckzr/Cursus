import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export type UserRole = 'admin' | 'faculty' | 'student';

export interface JwtPayload {
  sub: string;   // user UUID
  email: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed Authorization header' });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.jwtSecret) as JwtPayload;
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function authorize(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthenticated' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}

/**
 * Use this in addition to (not instead of) `authorize('student', ...)` on
 * routes that should only work for currently-enrolled students — schedule,
 * wishlist, COR, appeals, evaluations. Alumni (graduated_at IS NOT NULL) are
 * rejected with a friendly message so the frontend can render an empty state.
 *
 * Costs one DB row read per request. Cached responses from authenticated
 * users dominate traffic anyway; this is fine.
 */
import { db } from '../config/db';
export function authorizeStudentActive(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthenticated' });
    return;
  }
  if (req.user.role !== 'student') {
    next();        // non-students fall through (authorize() handles them)
    return;
  }
  db.query<{ graduated_at: string | null }>(
    `SELECT graduated_at FROM users WHERE id = $1`,
    [req.user.sub],
  ).then(r => {
    if (r.rows[0]?.graduated_at) {
      res.status(403).json({
        error: 'This action is no longer available because your account is in alumni status.',
      });
      return;
    }
    next();
  }).catch(next);
}
