import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import * as ctrl from './audit-logs.controller';

const router = Router();

/**
 * @openapi
 * /audit-logs:
 *   get:
 *     tags: [AuditLogs]
 *     summary: Paginated audit log (admin)
 *     parameters:
 *       - in: query
 *         name: action
 *         schema: { type: string }
 *       - in: query
 *         name: entityType
 *         schema: { type: string }
 *       - in: query
 *         name: actor
 *         description: Free-text search across actor name / user_code / email
 *         schema: { type: string }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 50, maximum: 200 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200:
 *         description: Audit log page
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rows:  { type: array }
 *                 total: { type: integer }
 */
router.get('/',         authenticate, authorize('admin'), ctrl.list);

/**
 * @openapi
 * /audit-logs/actions:
 *   get:
 *     tags: [AuditLogs]
 *     summary: Distinct action types currently in the log (admin)
 *     responses:
 *       200: { description: Array of action strings }
 */
router.get('/actions',  authenticate, authorize('admin'), ctrl.listActions);

export default router;
