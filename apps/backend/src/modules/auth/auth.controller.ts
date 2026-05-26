import { Request, Response, NextFunction } from 'express';
import { loginSchema, updateMeSchema, changePasswordSchema } from './auth.schema';
import * as svc from './auth.service';

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userCode, password } = loginSchema.parse(req.body);
    const result = await svc.loginUser(userCode, password);
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
    const profile = await svc.getProfile(req.user!.sub);
    if (!profile) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(profile);
  } catch (err) {
    next(err);
  }
}

export async function updateMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = updateMeSchema.parse(req.body);
    const profile = await svc.updateMe(req.user!.sub, data);
    if (!profile) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(profile);
  } catch (err) {
    next(err);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    await svc.changePassword(req.user!.sub, currentPassword, newPassword);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
