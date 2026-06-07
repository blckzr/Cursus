import { Request, Response, NextFunction } from 'express';
import * as svc from './archive.service';

export async function previewArchive(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await svc.previewArchive(req.params.termId));
  } catch (e) { next(e); }
}

export async function archiveTerm(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await svc.archiveTerm(req.params.termId, req.user!.sub));
  } catch (e) { next(e); }
}
