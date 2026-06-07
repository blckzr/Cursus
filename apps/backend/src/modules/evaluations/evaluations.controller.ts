import { Request, Response, NextFunction } from 'express';
import * as svc from './evaluations.service';
import {
  submitEvaluationSchema, createQuestionSchema, updateQuestionSchema, setPeriodSchema,
} from './evaluations.schema';

// ── Student ─────────────────────────────────────────────────────────────────

export async function getStatus(req: Request, res: Response, next: NextFunction) {
  try { res.json(await svc.getStudentEvaluationStatus(req.user!.sub)); }
  catch (e) { next(e); }
}

export async function getActiveQuestions(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await svc.listActiveQuestions()); } catch (e) { next(e); }
}

export async function submit(req: Request, res: Response, next: NextFunction) {
  try {
    const { answers } = submitEvaluationSchema.parse(req.body);
    res.status(201).json(
      await svc.submitEvaluation(req.user!.sub, req.params.sectionId, answers),
    );
  } catch (e) { next(e); }
}

/** GET /students/me/must-evaluate-first — drives the Grades page lock. */
export async function getMustEvaluateFirst(req: Request, res: Response, next: NextFunction) {
  try { res.json(await svc.getMustEvaluateFirst(req.user!.sub)); }
  catch (e) { next(e); }
}

// ── Faculty ─────────────────────────────────────────────────────────────────

export async function getFacultyRollup(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await svc.getFacultyTermRollup(req.user!.sub, req.params.termId));
  } catch (e) { next(e); }
}

// ── Admin ───────────────────────────────────────────────────────────────────

export async function getAdminRollup(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await svc.getAdminTermRollup(req.params.termId));
  } catch (e) { next(e); }
}

export async function listQuestions(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await svc.listAllQuestions()); } catch (e) { next(e); }
}

export async function createQuestion(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await svc.createQuestion(createQuestionSchema.parse(req.body)));
  } catch (e) { next(e); }
}

export async function updateQuestion(req: Request, res: Response, next: NextFunction) {
  try {
    const q = await svc.updateQuestion(req.params.id, updateQuestionSchema.parse(req.body));
    if (!q) { res.status(404).json({ error: 'Question not found' }); return; }
    res.json(q);
  } catch (e) { next(e); }
}

export async function getOrSetPeriod(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.method === 'GET') {
      const p = await svc.getPeriod(req.params.termId);
      if (!p) { res.status(404).json({ error: 'No evaluation period set for this term.' }); return; }
      res.json(p);
      return;
    }
    res.json(await svc.setPeriod(req.params.termId, setPeriodSchema.parse(req.body)));
  } catch (e) { next(e); }
}
