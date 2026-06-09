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

/**
 * @openapi
 * /blocks/{id}/graduate:
 *   post:
 *     tags: [Blocks]
 *     summary: Graduate every active student in a final-year block (admin)
 *     description: |
 *       Marks each active student in the block as graduated:
 *         • is_active becomes false (they can no longer sign in)
 *         • graduated_at = now()
 *       Their enrollment + grade history is preserved for transcript queries.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Result summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 graduated:  { type: integer }
 *                 blockLabel: { type: string }
 *       409:
 *         description: Block is not at the program's final year level
 */
router.post('/:id/graduate', authenticate, authorize('admin'), ctrl.graduateBlock);

/**
 * @openapi
 * /blocks/advance-academic-year/{programId}:
 *   post:
 *     tags: [Blocks]
 *     summary: End-of-AY batch — promote all years + graduate final year (admin)
 *     description: |
 *       Promotes Y(n) → Y(n+1) for every non-final year, then graduates every
 *       block at the final year. All steps run in ONE transaction — partial
 *       advancement is impossible.
 *     parameters:
 *       - { in: path, name: programId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Counts of promoted students per year + total graduated }
 */
router.post('/advance-academic-year/:programId', authenticate, authorize('admin'), ctrl.advanceAcademicYear);

export default router;
