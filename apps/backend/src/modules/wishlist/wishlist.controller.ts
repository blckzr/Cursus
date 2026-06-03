import { Request, Response, NextFunction } from 'express';
import {
  createWishlistEntrySchema, updateWishlistEntrySchema,
  listMyWishlistSchema, demandSchema,
} from './wishlist.schema';
import * as svc from './wishlist.service';

// ─── Student-facing handlers ─────────────────────────────────────────────────

export async function listEligibleTerms(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await svc.listEligibleTerms()); }
  catch (e) { next(e); }
}

export async function listCandidates(req: Request, res: Response, next: NextFunction) {
  try {
    const termId = String(req.query.termId ?? '');
    if (!termId) {
      res.status(400).json({ error: 'termId is required' });
      return;
    }
    res.json(await svc.listCandidates(req.user!.sub, termId));
  } catch (e) { next(e); }
}

export async function listMyWishlist(req: Request, res: Response, next: NextFunction) {
  try {
    const { termId } = listMyWishlistSchema.parse(req.query);
    res.json(await svc.listMyWishlist(req.user!.sub, termId));
  } catch (e) { next(e); }
}

export async function createEntry(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createWishlistEntrySchema.parse(req.body);
    const entry = await svc.createWishlistEntry(req.user!.sub, data);
    res.status(201).json(entry);
  } catch (e) { next(e); }
}

export async function updateEntry(req: Request, res: Response, next: NextFunction) {
  try {
    const data = updateWishlistEntrySchema.parse(req.body);
    const entry = await svc.updateWishlistEntry(req.user!.sub, req.params.id, data);
    if (!entry) { res.status(404).json({ error: 'Wishlist entry not found' }); return; }
    res.json(entry);
  } catch (e) { next(e); }
}

export async function deleteEntry(req: Request, res: Response, next: NextFunction) {
  try {
    await svc.deleteWishlistEntry(req.user!.sub, req.params.id);
    res.status(204).send();
  } catch (e) { next(e); }
}

// ─── Admin-facing handlers ──────────────────────────────────────────────────

export async function listDemand(req: Request, res: Response, next: NextFunction) {
  try {
    const { termId } = demandSchema.parse(req.query);
    res.json(await svc.listDemand(termId));
  } catch (e) { next(e); }
}
