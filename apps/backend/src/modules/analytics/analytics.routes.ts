import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import * as ctrl from './analytics.controller';

const router = Router();

router.use(authenticate, authorize('admin'));

/**
 * @openapi
 * /admin/analytics/retention:
 *   get:
 *     tags: [Analytics]
 *     summary: Cohort retention breakdown (active / graduated / inactive)
 *     description: |
 *       Bucketed by the first four chars of `users.user_code` (the entry year
 *       stamped at creation). Optional `programId` narrows the cohorts to
 *       students in that program.
 *     parameters:
 *       - in: query
 *         name: programId
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Cohort rows + roll-up summary }
 */
router.get('/retention', ctrl.retention);

export default router;
