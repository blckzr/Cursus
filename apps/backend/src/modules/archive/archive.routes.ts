import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import * as ctrl from './archive.controller';

const router = Router();

/**
 * @openapi
 * /admin/archive-term/{termId}/preview:
 *   get:
 *     tags: [Archive]
 *     summary: Preview an archival — counts only, no data moved (admin)
 *     parameters:
 *       - { in: path, name: termId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Row counts that would move, plus any blockers }
 *       404: { description: Term not found }
 *
 * /admin/archive-term/{termId}:
 *   post:
 *     tags: [Archive]
 *     summary: Move a finished term's rows into *_archive tables (admin)
 *     description: |
 *       Transactional move of sections, enrollments, gradebook tree, and
 *       resolved appeals out of the live tables. Refuses when the term
 *       is active, already archived, or has any active appeal.
 *     parameters:
 *       - { in: path, name: termId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Row counts that moved }
 *       404: { description: Term not found }
 *       409: { description: Blocked by an active appeal or already-archived term }
 */
router.get ('/archive-term/:termId/preview', authenticate, authorize('admin'), ctrl.previewArchive);
router.post('/archive-term/:termId',         authenticate, authorize('admin'), ctrl.archiveTerm);

export default router;
