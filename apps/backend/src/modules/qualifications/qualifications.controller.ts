import { Request, Response, NextFunction } from 'express';
import { replaceSchema, upsertOneSchema, updateOneSchema } from './qualifications.schema';
import * as svc from './qualifications.service';

/**
 * Authorization helper. A faculty member can read/write their own
 * qualifications; an admin can do it for anyone.
 */
function canEdit(req: Request, targetFacultyId: string): boolean {
  if (!req.user) return false;
  if (req.user.role === 'admin') return true;
  return req.user.role === 'faculty' && req.user.sub === targetFacultyId;
}

export async function getForFaculty(req: Request, res: Response, next: NextFunction) {
  try {
    if (!canEdit(req, req.params.facultyId)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    res.json(await svc.getFacultyPrefs(req.params.facultyId));
  } catch (e) { next(e); }
}

export async function replaceForFaculty(req: Request, res: Response, next: NextFunction) {
  try {
    if (!canEdit(req, req.params.facultyId)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    const { items, maxTeachingUnits } = replaceSchema.parse(req.body);
    res.json(await svc.replaceForFaculty(req.params.facultyId, items, maxTeachingUnits));
  } catch (e) { next(e); }
}

export async function upsertOne(req: Request, res: Response, next: NextFunction) {
  try {
    if (!canEdit(req, req.params.facultyId)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    const data = upsertOneSchema.parse(req.body);
    const entry = await svc.upsertOne(req.params.facultyId, data);
    res.status(201).json(entry);
  } catch (e) { next(e); }
}

export async function updateOne(req: Request, res: Response, next: NextFunction) {
  try {
    if (!canEdit(req, req.params.facultyId)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    const data = updateOneSchema.parse(req.body);
    const entry = await svc.updateOne(req.params.facultyId, req.params.id, data);
    if (!entry) { res.status(404).json({ error: 'Qualification not found' }); return; }
    res.json(entry);
  } catch (e) { next(e); }
}

export async function deleteOne(req: Request, res: Response, next: NextFunction) {
  try {
    if (!canEdit(req, req.params.facultyId)) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    await svc.deleteOne(req.params.facultyId, req.params.id);
    res.status(204).send();
  } catch (e) { next(e); }
}
