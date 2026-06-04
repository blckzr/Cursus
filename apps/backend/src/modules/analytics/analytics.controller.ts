import { Request, Response, NextFunction } from 'express';
import { retentionQuerySchema } from './analytics.schema';
import * as svc from './analytics.service';

export async function retention(req: Request, res: Response, next: NextFunction) {
  try {
    const { programId } = retentionQuerySchema.parse(req.query);
    res.json(await svc.getRetention({ programId }));
  } catch (e) { next(e); }
}
