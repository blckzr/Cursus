import { Request, Response, NextFunction } from 'express';
import { promoteSchema } from './blocks.schema';
import * as svc from './blocks.service';

export async function listBlocks(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await svc.listBlocks());
  } catch (e) { next(e); }
}

export async function promoteYear(req: Request, res: Response, next: NextFunction) {
  try {
    const { programId, yearLevel } = promoteSchema.parse(req.body);
    const result = await svc.promoteYear(programId, yearLevel, req.user!.sub);
    res.json(result);
  } catch (e) { next(e); }
}
