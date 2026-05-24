import { Request, Response, NextFunction } from 'express';
import { addCurriculumEntrySchema } from './curriculum.schema';
import * as svc from './curriculum.service';

export async function listCurriculum(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await svc.listCurriculum(req.params.programId));
  } catch (e) { next(e); }
}

export async function addEntry(req: Request, res: Response, next: NextFunction) {
  try {
    const data = addCurriculumEntrySchema.parse(req.body);
    res.status(201).json(await svc.addCurriculumEntry(req.params.programId, data));
  } catch (e) { next(e); }
}

export async function removeEntry(req: Request, res: Response, next: NextFunction) {
  try {
    await svc.removeCurriculumEntry(req.params.programId, req.params.entryId);
    res.status(204).send();
  } catch (e) { next(e); }
}
