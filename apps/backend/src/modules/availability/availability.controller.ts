import { Request, Response, NextFunction } from 'express';
import { bulkReplaceSchema } from './availability.schema';
import * as svc from './availability.service';

function assertSelfOrAdmin(req: Request, facultyId: string) {
  if (req.user!.role === 'admin') return;
  if (req.user!.sub !== facultyId) {
    throw Object.assign(new Error('Forbidden — only the faculty themselves or an admin can manage availability.'), { status: 403 });
  }
}

export async function listForFaculty(req: Request, res: Response, next: NextFunction) {
  try {
    assertSelfOrAdmin(req, req.params.facultyId);
    res.json(await svc.listForFaculty(req.params.facultyId));
  } catch (e) { next(e); }
}

export async function replaceForFaculty(req: Request, res: Response, next: NextFunction) {
  try {
    assertSelfOrAdmin(req, req.params.facultyId);
    const { slots } = bulkReplaceSchema.parse(req.body);
    res.json(await svc.replaceForFaculty(req.params.facultyId, slots));
  } catch (e) { next(e); }
}
