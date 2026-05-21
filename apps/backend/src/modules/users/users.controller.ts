import { Request, Response, NextFunction } from 'express';
import { createUserSchema, updateUserSchema } from './users.schema';
import * as svc from './users.service';

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const role = req.query.role as string | undefined;
    res.json(await svc.listUsers(role));
  } catch (e) { next(e); }
}

export async function getUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await svc.getUserById(req.params.id);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json(user);
  } catch (e) { next(e); }
}

export async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createUserSchema.parse(req.body);
    const user = await svc.createUser(data);
    res.status(201).json(user);
  } catch (e) { next(e); }
}

export async function updateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateUserSchema.parse(req.body);
    const user = await svc.updateUser(req.params.id, data);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json(user);
  } catch (e) { next(e); }
}
