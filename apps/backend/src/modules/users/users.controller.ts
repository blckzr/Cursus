import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createUserSchema, updateUserSchema } from './users.schema';
import * as svc from './users.service';
import * as bulk from './users.bulk.service';

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const role = req.query.role as string | undefined;
    res.json(await svc.listUsers(role));
  } catch (e) { next(e); }
}

export async function getUser(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await svc.getUserById(req.params.id);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json(user);
  } catch (e) { next(e); }
}

export async function createUser(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createUserSchema.parse(req.body);
    const user = await svc.createUser(data);
    res.status(201).json(user);
  } catch (e) { next(e); }
}

export async function updateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateUserSchema.parse(req.body);
    const user = await svc.updateUser(req.params.id, data);
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }
    res.json(user);
  } catch (e) { next(e); }
}

// ── Bulk CSV import ─────────────────────────────────────────────────────────

/**
 * Shared payload shape for both preview and apply. The client parses the CSV
 * client-side and posts an array of raw rows — every field is a string so we
 * can echo it back in the preview alongside the rejection reason.
 */
const bulkBodySchema = z.object({
  rows: z.array(z.object({
    rowIndex:    z.number().int(),
    email:       z.string(),
    fullName:    z.string(),
    role:        z.string(),
    branch:      z.string().optional(),
    programCode: z.string().optional(),
  })).max(1000, 'At most 1,000 rows per import'),
});

export async function bulkPreview(req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = bulkBodySchema.parse(req.body);
    res.json(await bulk.previewBulk(rows));
  } catch (e) { next(e); }
}

export async function bulkApply(req: Request, res: Response, next: NextFunction) {
  try {
    const { rows } = bulkBodySchema.parse(req.body);
    res.json(await bulk.applyBulk(rows));
  } catch (e) { next(e); }
}
