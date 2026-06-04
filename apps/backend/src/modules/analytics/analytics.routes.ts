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

/**
 * @openapi
 * /admin/analytics/faculty-load:
 *   get:
 *     tags: [Analytics]
 *     summary: Per-faculty teaching-load report for a term
 *     description: |
 *       Per active-faculty row: section count, total units, hours/week,
 *       utilization against `max_teaching_units` (or the 24-unit default),
 *       and a status flag (`overload | normal | underload | idle`). LEFT
 *       JOINs sections so idle faculty surface in the report.
 *     parameters:
 *       - in: query
 *         name: termId
 *         description: Optional — defaults to the currently active term.
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Per-faculty rows + roll-up summary }
 *       404: { description: termId given but no such term exists }
 */
router.get('/faculty-load', ctrl.facultyLoad);

/**
 * @openapi
 * /admin/analytics/section-fill:
 *   get:
 *     tags: [Analytics]
 *     summary: Per-section fill-rate report for a term
 *     description: |
 *       For each section in the term, returns `capacity`, `enrolled`, fill
 *       percentage, and a status flag (`over | full | normal | under |
 *       empty`). Also returns a 6-bucket histogram of the distribution and
 *       a summary block so the UI can render a chart + table without
 *       additional aggregation.
 *     parameters:
 *       - in: query
 *         name: termId
 *         description: Optional — defaults to the currently active term.
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Per-section rows + histogram + summary }
 *       404: { description: termId given but no such term exists }
 */
router.get('/section-fill', ctrl.sectionFill);

/**
 * @openapi
 * /admin/analytics/gwa-stats:
 *   get:
 *     tags: [Analytics]
 *     summary: Average GWA per program × cohort or term
 *     description: |
 *       PH grade scale: lower is better. For each group we report mean of
 *       per-student units-weighted GWAs, best/worst student, and a standing
 *       distribution histogram (President's / Dean's / Good / Warning /
 *       Failing). Optional `programId` filters; `groupBy=cohort` (default)
 *       groups by entry year, `groupBy=term` groups by academic term.
 *     parameters:
 *       - in: query
 *         name: programId
 *         schema: { type: string, format: uuid }
 *       - in: query
 *         name: groupBy
 *         schema: { type: string, enum: [cohort, term], default: cohort }
 *     responses:
 *       200: { description: Per-group rows + summary }
 */
router.get('/gwa-stats', ctrl.gwaStats);

export default router;
