import { Request, Response, NextFunction } from 'express';
import {
  createCategorySchema, updateCategorySchema,
  createAssessmentSchema, updateAssessmentSchema,
  bulkScoreSchema, finalizeSchema,
} from './gradebook.schema';
import * as svc from './gradebook.service';

export async function getGradebook(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.getGradebook(req.params.id);
    if (!data) { res.status(404).json({ error: 'Section not found' }); return; }
    res.json(data);
  } catch (e) { next(e); }
}

export async function createCategory(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await svc.createCategory(req.params.id, createCategorySchema.parse(req.body)));
  } catch (e) { next(e); }
}

export async function updateCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const cat = await svc.updateCategory(req.params.categoryId, updateCategorySchema.parse(req.body));
    if (!cat) { res.status(404).json({ error: 'Category not found' }); return; }
    res.json(cat);
  } catch (e) { next(e); }
}

export async function deleteCategory(req: Request, res: Response, next: NextFunction) {
  try {
    await svc.deleteCategory(req.params.categoryId);
    res.status(204).send();
  } catch (e) { next(e); }
}

export async function createAssessment(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await svc.createAssessment(createAssessmentSchema.parse(req.body)));
  } catch (e) { next(e); }
}

export async function updateAssessment(req: Request, res: Response, next: NextFunction) {
  try {
    const a = await svc.updateAssessment(req.params.assessmentId, updateAssessmentSchema.parse(req.body));
    if (!a) { res.status(404).json({ error: 'Assessment not found' }); return; }
    res.json(a);
  } catch (e) { next(e); }
}

export async function deleteAssessment(req: Request, res: Response, next: NextFunction) {
  try {
    await svc.deleteAssessment(req.params.assessmentId);
    res.status(204).send();
  } catch (e) { next(e); }
}

export async function bulkSaveScores(req: Request, res: Response, next: NextFunction) {
  try {
    const { scores } = bulkScoreSchema.parse(req.body);
    await svc.bulkSaveScores(scores, req.user!.sub);
    res.json({ saved: scores.length });
  } catch (e) { next(e); }
}

export async function finalizeGrades(req: Request, res: Response, next: NextFunction) {
  try {
    const { grades } = finalizeSchema.parse(req.body);
    const results = await svc.finalizeGrades(req.params.id, grades ?? [], req.user!.sub);
    res.json({ finalized: results.length, grades: results });
  } catch (e: unknown) {
    if (e instanceof Error && 'status' in e) {
      res.status((e as NodeJS.ErrnoException & { status: number }).status).json({ error: e.message });
      return;
    }
    next(e);
  }
}

export async function exportCsv(req: Request, res: Response, next: NextFunction) {
  try {
    const csv = await svc.exportGradebookCsv(req.params.id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="gradebook-${req.params.id}.csv"`);
    res.send(csv);
  } catch (e) { next(e); }
}

export async function getStudentGrades(req: Request, res: Response, next: NextFunction) {
  try {
    // Students can only view their own grades
    if (req.user!.role === 'student' && req.user!.sub !== req.params.studentId) {
      res.status(403).json({ error: 'Access denied' }); return;
    }
    res.json(await svc.getStudentGrades(req.params.studentId));
  } catch (e) { next(e); }
}

export async function exportTranscript(req: Request, res: Response, next: NextFunction) {
  try {
    const { csv, studentCode } = await svc.exportTranscriptCsv(req.user!.sub);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="transcript-${studentCode}.csv"`);
    res.send(csv);
  } catch (e) { next(e); }
}

export async function getRoster(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.getRoster(req.params.id);
    if (!data) { res.status(404).json({ error: 'Section not found' }); return; }
    res.json(data);
  } catch (e) { next(e); }
}

export async function exportRosterCsv(req: Request, res: Response, next: NextFunction) {
  try {
    const { csv, sectionCode } = await svc.exportRosterCsv(req.params.id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="roster-${sectionCode.replace(/\s+/g, '_')}.csv"`);
    res.send(csv);
  } catch (e) { next(e); }
}
