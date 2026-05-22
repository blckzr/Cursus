import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import * as ctrl from './blocks.controller';

const router = Router();

/**
 * @openapi
 * /blocks:
 *   get:
 *     tags: [Blocks]
 *     summary: List block sections with live student counts (admin)
 *     responses:
 *       200:
 *         description: List of block sections
 */
router.get('/', authenticate, authorize('admin'), ctrl.listBlocks);

/**
 * @openapi
 * /blocks/promote:
 *   post:
 *     tags: [Blocks]
 *     summary: Promote a program/year to the next year and reshuffle blocks (admin)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [programId, yearLevel]
 *             properties:
 *               programId:
 *                 type: string
 *                 format: uuid
 *               yearLevel:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       200:
 *         description: Promotion result
 */
router.post('/promote', authenticate, authorize('admin'), ctrl.promoteYear);

export default router;
