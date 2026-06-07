import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { createSectionSchema, updateSectionSchema } from './sections.schema';
import * as svc from './sections.service';
import { runAutoAssign, applyProposals, type Strategy, type AssignmentProposal } from './auto-assign.service';

export async function listSections(req: Request, res: Response, next: NextFunction) {
  try {
    const { termId, facultyId } = req.query as Record<string, string>;
    // Faculty can only see their own sections
    const filter = req.user!.role === 'faculty'
      ? { termId, facultyId: req.user!.sub }
      : { termId, facultyId };
    res.json(await svc.listSections(filter));
  } catch (e) { next(e); }
}

export async function getSection(req: Request, res: Response, next: NextFunction) {
  try {
    const s = await svc.getSectionById(req.params.id);
    if (!s) { res.status(404).json({ error: 'Section not found' }); return; }
    res.json(s);
  } catch (e) { next(e); }
}

export async function createSection(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await svc.createSection(createSectionSchema.parse(req.body)));
  } catch (e) { next(e); }
}

export async function updateSection(req: Request, res: Response, next: NextFunction) {
  try {
    const s = await svc.updateSection(req.params.id, updateSectionSchema.parse(req.body));
    if (!s) { res.status(404).json({ error: 'Section not found' }); return; }
    res.json(s);
  } catch (e) { next(e); }
}

// ── Auto-assign ────────────────────────────────────────────────────────────

const autoAssignQuerySchema = z.object({
  termId:   z.string().uuid(),
  strategy: z.enum(['balanced', 'prefer-grouped-days', 'prefer-mornings']).default('balanced'),
  onlyTba:  z.coerce.boolean().default(true),
});

const applyBodySchema = z.object({
  proposals: z.array(z.object({
    sectionId:   z.string().uuid(),
    sectionCode: z.string(),
    courseCode:  z.string(),
    courseTitle: z.string(),
    units:       z.number(),
    blockLabel:  z.string(),
    facultyId:   z.string().uuid().nullable(),
    facultyName: z.string().nullable(),
    meetings:    z.array(z.object({
      dayOfWeek: z.enum(['Mon','Tue','Wed','Thu','Fri','Sat','Sun']),
      startTime: z.string(),
      endTime:   z.string(),
    })),
    room:        z.string().nullable(),
    score:       z.number(),
    reason:      z.string(),
  })),
});

/**
 * Dry-run the auto-assigner — returns proposals without persisting anything.
 * Admin previews this before clicking Apply.
 */
export async function autoAssignPreview(req: Request, res: Response, next: NextFunction) {
  try {
    const opts = autoAssignQuerySchema.parse(req.query);
    res.json(await runAutoAssign({
      termId:   opts.termId,
      strategy: opts.strategy as Strategy,
      onlyTba:  opts.onlyTba,
    }));
  } catch (e) { next(e); }
}

/**
 * Persist a previously-previewed proposal list. The client sends back the
 * exact proposals it confirmed so the admin owns the choice — re-running
 * the algorithm here would produce different output if the inputs changed.
 */
export async function autoAssignApply(req: Request, res: Response, next: NextFunction) {
  try {
    const { proposals } = applyBodySchema.parse(req.body);
    const result = await applyProposals(proposals as AssignmentProposal[], req.user!.sub);
    res.json(result);
  } catch (e) { next(e); }
}
