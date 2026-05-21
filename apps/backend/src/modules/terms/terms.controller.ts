import { Request, Response, NextFunction } from 'express';
import { createTermSchema, updateTermSchema } from './terms.schema';
import * as svc from './terms.service';

export async function listTerms(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await svc.listTerms()); } catch (e) { next(e); }
}

export async function getTerm(req: Request, res: Response, next: NextFunction) {
  try {
    const t = await svc.getTermById(req.params.id);
    if (!t) { res.status(404).json({ error: 'Term not found' }); return; }
    res.json(t);
  } catch (e) { next(e); }
}

export async function createTerm(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await svc.createTerm(createTermSchema.parse(req.body)));
  } catch (e) { next(e); }
}

export async function updateTerm(req: Request, res: Response, next: NextFunction) {
  try {
    const t = await svc.updateTerm(req.params.id, updateTermSchema.parse(req.body));
    if (!t) { res.status(404).json({ error: 'Term not found' }); return; }
    res.json(t);
  } catch (e) { next(e); }
}
