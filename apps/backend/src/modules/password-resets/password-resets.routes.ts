import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import * as ctrl from './password-resets.controller';

const router = Router();

/**
 * @openapi
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Submit a password-reset request (public)
 *     description: |
 *       Always responds 200 — the body never reveals whether the user code
 *       exists. Internally creates a pending request and notifies every
 *       admin if the code is valid.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userCode]
 *             properties:
 *               userCode: { type: string }
 *     responses:
 *       200: { description: Submitted (regardless of whether the code exists) }
 */
router.post('/auth/forgot-password', ctrl.submitRequest);

/**
 * @openapi
 * /admin/password-resets:
 *   get:
 *     tags: [Auth]
 *     summary: List password-reset requests (admin)
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, approved, denied, all] }
 *         description: Defaults to 'pending'.
 *     responses:
 *       200: { description: List of requests with user details + resolver }
 */
router.get('/admin/password-resets', authenticate, authorize('admin'), ctrl.listRequests);

/**
 * @openapi
 * /admin/password-resets/{id}/approve:
 *   post:
 *     tags: [Auth]
 *     summary: Approve a request — resets password to default + flags first-login change (admin)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object, properties: { note: { type: string } } }
 *     responses:
 *       200: { description: Approved }
 *       409: { description: Already resolved }
 *
 * /admin/password-resets/{id}/deny:
 *   post:
 *     tags: [Auth]
 *     summary: Deny a request (admin)
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Denied }
 *       409: { description: Already resolved }
 */
router.post('/admin/password-resets/:id/approve', authenticate, authorize('admin'), ctrl.approve);
router.post('/admin/password-resets/:id/deny',    authenticate, authorize('admin'), ctrl.deny);

export default router;
