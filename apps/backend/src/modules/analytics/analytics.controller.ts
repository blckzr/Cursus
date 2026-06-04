import { Request, Response, NextFunction } from 'express';
import { retentionQuerySchema, facultyLoadQuerySchema } from './analytics.schema';
import * as svc from './analytics.service';

export async function retention(req: Request, res: Response, next: NextFunction) {
  try {
    const { programId } = retentionQuerySchema.parse(req.query);
    res.json(await svc.getRetention({ programId }));
  } catch (e) { next(e); }
}

export async function facultyLoad(req: Request, res: Response, next: NextFunction) {
  try {
    const { termId } = facultyLoadQuerySchema.parse(req.query);
    res.json(await svc.getFacultyLoad({ termId }));
  } catch (e) { next(e); }
}
