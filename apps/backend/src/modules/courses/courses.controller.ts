import { Request, Response, NextFunction } from 'express';
import { createCourseSchema, updateCourseSchema } from './courses.schema';
import * as svc from './courses.service';

export async function listCourses(req: Request, res: Response, next: NextFunction) {
  try { res.json(await svc.listCourses(req.query.programId as string | undefined)); } catch (e) { next(e); }
}

export async function getCourse(req: Request, res: Response, next: NextFunction) {
  try {
    const c = await svc.getCourseById(req.params.id);
    if (!c) { res.status(404).json({ error: 'Course not found' }); return; }
    res.json(c);
  } catch (e) { next(e); }
}

export async function createCourse(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await svc.createCourse(createCourseSchema.parse(req.body)));
  } catch (e) { next(e); }
}

export async function updateCourse(req: Request, res: Response, next: NextFunction) {
  try {
    const c = await svc.updateCourse(req.params.id, updateCourseSchema.parse(req.body));
    if (!c) { res.status(404).json({ error: 'Course not found' }); return; }
    res.json(c);
  } catch (e) { next(e); }
}
