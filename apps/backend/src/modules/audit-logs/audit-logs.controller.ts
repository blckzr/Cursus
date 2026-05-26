import { Request, Response, NextFunction } from 'express';
import { listSchema } from './audit-logs.schema';
import * as svc from './audit-logs.service';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const filter = listSchema.parse(req.query);
    res.json(await svc.listAuditLogs(filter));
  } catch (e) { next(e); }
}

export async function listActions(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await svc.listActionTypes());
  } catch (e) { next(e); }
}
