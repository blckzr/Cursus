import { Request, Response, NextFunction } from 'express';
import { listSchema } from './notifications.schema';
import * as svc from './notifications.service';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { limit, unreadOnly } = listSchema.parse(req.query);
    const [rows, unread] = await Promise.all([
      svc.listForUser(req.user!.sub, { limit, unreadOnly }),
      svc.unreadCount(req.user!.sub),
    ]);
    res.json({ rows, unread });
  } catch (e) { next(e); }
}

export async function unreadCount(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ unread: await svc.unreadCount(req.user!.sub) });
  } catch (e) { next(e); }
}

export async function markRead(req: Request, res: Response, next: NextFunction) {
  try {
    const n = await svc.markRead(req.user!.sub, req.params.id);
    res.json({ marked: n });
  } catch (e) { next(e); }
}

export async function markAllRead(req: Request, res: Response, next: NextFunction) {
  try {
    const n = await svc.markAllRead(req.user!.sub);
    res.json({ marked: n });
  } catch (e) { next(e); }
}
