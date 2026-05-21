import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import * as ctrl from './programs.controller';

const router = Router();

/**
 * @openapi
 * /programs:
 *   get:
 *     tags: [Programs]
 *     summary: List all programs
 *     responses:
 *       200:
 *         description: List of programs
 *   post:
 *     tags: [Programs]
 *     summary: Create a program (admin)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, name, totalUnits]
 *             properties:
 *               code:
 *                 type: string
 *                 example: BSCS
 *               name:
 *                 type: string
 *                 example: Bachelor of Science in Computer Science
 *               totalUnits:
 *                 type: integer
 *                 example: 148
 *     responses:
 *       201:
 *         description: Program created
 */
router.get('/', authenticate, ctrl.listPrograms);
router.post('/', authenticate, authorize('admin'), ctrl.createProgram);

/**
 * @openapi
 * /programs/{id}:
 *   get:
 *     tags: [Programs]
 *     summary: Get program by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Program
 *       404:
 *         description: Not found
 *   patch:
 *     tags: [Programs]
 *     summary: Update a program (admin)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *               name:
 *                 type: string
 *               totalUnits:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Program updated
 */
router.get('/:id', authenticate, ctrl.getProgram);
router.patch('/:id', authenticate, authorize('admin'), ctrl.updateProgram);

export default router;
