import { Request, Response, NextFunction } from 'express';
import { createSectionSchema, updateSectionSchema } from './sections.schema';
import * as svc from './sections.service';

export async function listSections(req: Request, res: Response, next: NextFunction) {
  try {
    const { termId, facultyId } = req.query as Record<string, string>;
    // Faculty can only see their own sections
    const filter = req.user!.role === 'faculty'
      ? { termId, facultyId: req.user!.sub }
      : { termId, facultyId };
    res.json(await svc.listSections(filter));
  } catch (e) { next(e); }
}

export async function getSection(req: Request, res: Response, next: NextFunction) {
  try {
    const s = await svc.getSectionById(req.params.id);
    if (!s) { res.status(404).json({ error: 'Section not found' }); return; }
    res.json(s);
  } catch (e) { next(e); }
}

export async function createSection(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await svc.createSection(createSectionSchema.parse(req.body)));
  } catch (e) { next(e); }
}

export async function updateSection(req: Request, res: Response, next: NextFunction) {
  try {
    const s = await svc.updateSection(req.params.id, updateSectionSchema.parse(req.body));
    if (!s) { res.status(404).json({ error: 'Section not found' }); return; }
    res.json(s);
  } catch (e) { next(e); }
}
