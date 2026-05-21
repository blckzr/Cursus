import { Request, Response, NextFunction } from 'express';
import { createEnrollmentSchema, updateEnrollmentSchema } from './enrollments.schema';
import * as svc from './enrollments.service';

export async function listEnrollments(req: Request, res: Response, next: NextFunction) {
  try {
    const { sectionId, studentId } = req.query as Record<string, string>;
    res.json(await svc.listEnrollments({ sectionId, studentId }));
  } catch (e) { next(e); }
}

export async function createEnrollment(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createEnrollmentSchema.parse(req.body);
    res.status(201).json(await svc.createEnrollment(data));
  } catch (e: unknown) {
    if (e instanceof Error && 'status' in e) {
      res.status((e as NodeJS.ErrnoException & { status: number }).status).json({ error: e.message });
      return;
    }
    next(e);
  }
}

export async function updateEnrollment(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = updateEnrollmentSchema.parse(req.body);
    const enrollment = await svc.updateEnrollment(req.params.id, status);
    if (!enrollment) { res.status(404).json({ error: 'Enrollment not found' }); return; }
    res.json(enrollment);
  } catch (e) { next(e); }
}
