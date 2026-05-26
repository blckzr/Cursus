import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import * as ctrl from './notifications.controller';

const router = Router();

/**
 * @openapi
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: List the caller's notifications (newest first)
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 50 }
 *       - in: query
 *         name: unreadOnly
 *         schema: { type: boolean, default: false }
 *     responses:
 *       200:
 *         description: Notification page + unread count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rows:   { type: array }
 *                 unread: { type: integer }
 */
router.get('/', authenticate, ctrl.list);

/**
 * @openapi
 * /notifications/unread-count:
 *   get:
 *     tags: [Notifications]
 *     summary: Just the unread badge number (cheap polling endpoint)
 *     responses:
 *       200:
 *         description: Unread count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 unread: { type: integer }
 */
router.get('/unread-count', authenticate, ctrl.unreadCount);

/**
 * @openapi
 * /notifications/read-all:
 *   post:
 *     tags: [Notifications]
 *     summary: Mark every notification as read
 *     responses:
 *       200: { description: Number of rows marked }
 */
router.post('/read-all', authenticate, ctrl.markAllRead);

/**
 * @openapi
 * /notifications/{id}/read:
 *   post:
 *     tags: [Notifications]
 *     summary: Mark a single notification as read
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Number of rows marked (0 or 1) }
 */
router.post('/:id/read', authenticate, ctrl.markRead);

export default router;
