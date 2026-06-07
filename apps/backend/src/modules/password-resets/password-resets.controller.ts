import { Request, Response, NextFunction } from 'express';
import * as svc from './password-resets.service';
import { submitRequestSchema, resolveRequestSchema } from './password-resets.schema';

export async function submitRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const { userCode } = submitRequestSchema.parse(req.body);
    // Always 200 — never leak whether the code exists.
    res.json(await svc.submitRequest(userCode));
  } catch (e) { next(e); }
}

export async function listRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const status = (req.query.status as 'pending'|'approved'|'denied'|'all'|undefined) ?? 'pending';
    res.json(await svc.listRequests({ status }));
  } catch (e) { next(e); }
}

export async function approve(req: Request, res: Response, next: NextFunction) {
  try {
    const { note } = resolveRequestSchema.parse(req.body ?? {});
    res.json(await svc.approveRequest(req.params.id, req.user!.sub, note));
  } catch (e) { next(e); }
}

export async function deny(req: Request, res: Response, next: NextFunction) {
  try {
    const { note } = resolveRequestSchema.parse(req.body ?? {});
    res.json(await svc.denyRequest(req.params.id, req.user!.sub, note));
  } catch (e) { next(e); }
}
