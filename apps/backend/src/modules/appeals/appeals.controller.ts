import { Request, Response, NextFunction } from 'express';
import {
  createAppealSchema, acceptAppealSchema, facultyResolveSchema,
  escalateSchema, deanResolveSchema, listSchema,
} from './appeals.schema';
import * as svc from './appeals.service';

function statusFromError(e: unknown): number {
  if (e instanceof Error && 'status' in e) return (e as Error & { status: number }).status;
  return 500;
}

// ── Student-facing ─────────────────────────────────────────────────────────

export async function listMine(req: Request, res: Response, next: NextFunction) {
  try { res.json(await svc.listMyAppeals(req.user!.sub)); }
  catch (e) { next(e); }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createAppealSchema.parse(req.body);
    const appeal = await svc.createAppeal(req.user!.sub, data);
    res.status(201).json(appeal);
  } catch (e: unknown) {
    const s = statusFromError(e);
    if (s !== 500) { res.status(s).json({ error: (e as Error).message }); return; }
    next(e);
  }
}

export async function withdraw(req: Request, res: Response, next: NextFunction) {
  try { res.json(await svc.withdraw(req.params.id, req.user!.sub)); }
  catch (e: unknown) {
    const s = statusFromError(e);
    if (s !== 500) { res.status(s).json({ error: (e as Error).message }); return; }
    next(e);
  }
}

// ── Faculty ────────────────────────────────────────────────────────────────

export async function listFaculty(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = listSchema.parse(req.query);
    res.json(await svc.listForFaculty(req.user!.sub, status));
  } catch (e) { next(e); }
}

export async function accept(req: Request, res: Response, next: NextFunction) {
  try {
    const { facultyNote } = acceptAppealSchema.parse(req.body);
    res.json(await svc.acceptAppeal(req.params.id, req.user!.sub, facultyNote));
  } catch (e: unknown) {
    const s = statusFromError(e);
    if (s !== 500) { res.status(s).json({ error: (e as Error).message }); return; }
    next(e);
  }
}

export async function resolveByFaculty(req: Request, res: Response, next: NextFunction) {
  try {
    const data = facultyResolveSchema.parse(req.body);
    res.json(await svc.facultyResolve(req.params.id, req.user!.sub, data));
  } catch (e: unknown) {
    const s = statusFromError(e);
    if (s !== 500) { res.status(s).json({ error: (e as Error).message }); return; }
    next(e);
  }
}

export async function escalate(req: Request, res: Response, next: NextFunction) {
  try {
    const { facultyNote } = escalateSchema.parse(req.body);
    res.json(await svc.escalate(req.params.id, req.user!.sub, facultyNote));
  } catch (e: unknown) {
    const s = statusFromError(e);
    if (s !== 500) { res.status(s).json({ error: (e as Error).message }); return; }
    next(e);
  }
}

// ── Admin ──────────────────────────────────────────────────────────────────

export async function listAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = listSchema.parse(req.query);
    res.json(await svc.listForAdmin(status));
  } catch (e) { next(e); }
}

export async function resolveByDean(req: Request, res: Response, next: NextFunction) {
  try {
    const data = deanResolveSchema.parse(req.body);
    res.json(await svc.deanResolve(req.params.id, req.user!.sub, data));
  } catch (e: unknown) {
    const s = statusFromError(e);
    if (s !== 500) { res.status(s).json({ error: (e as Error).message }); return; }
    next(e);
  }
}
