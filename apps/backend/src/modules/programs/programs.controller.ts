import { Request, Response, NextFunction } from 'express';
import { createProgramSchema, updateProgramSchema } from './programs.schema';
import * as svc from './programs.service';

export async function listPrograms(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await svc.listPrograms()); } catch (e) { next(e); }
}

export async function getProgram(req: Request, res: Response, next: NextFunction) {
  try {
    const p = await svc.getProgramById(req.params.id);
    if (!p) { res.status(404).json({ error: 'Program not found' }); return; }
    res.json(p);
  } catch (e) { next(e); }
}

export async function createProgram(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await svc.createProgram(createProgramSchema.parse(req.body)));
  } catch (e) { next(e); }
}

export async function updateProgram(req: Request, res: Response, next: NextFunction) {
  try {
    const p = await svc.updateProgram(req.params.id, updateProgramSchema.parse(req.body));
    if (!p) { res.status(404).json({ error: 'Program not found' }); return; }
    res.json(p);
  } catch (e) { next(e); }
}
