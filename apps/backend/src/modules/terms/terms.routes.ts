import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import * as ctrl from './terms.controller';

const router = Router();

/**
 * @openapi
 * /terms:
 *   get:
 *     tags: [Terms]
 *     summary: List all terms
 *     responses:
 *       200:
 *         description: List of terms ordered by start date
 *   post:
 *     tags: [Terms]
 *     summary: Create a term (admin)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, startDate, endDate]
 *             properties:
 *               name:
 *                 type: string
 *                 example: 2026 - 1st Semester
 *               startDate:
 *                 type: string
 *                 format: date
 *                 example: "2026-08-01"
 *               endDate:
 *                 type: string
 *                 format: date
 *                 example: "2026-12-31"
 *               isActive:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       201:
 *         description: Term created
 */
router.get('/', authenticate, ctrl.listTerms);
router.post('/', authenticate, authorize('admin'), ctrl.createTerm);

/**
 * @openapi
 * /terms/{id}:
 *   get:
 *     tags: [Terms]
 *     summary: Get term by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Term
 *       404:
 *         description: Not found
 *   patch:
 *     tags: [Terms]
 *     summary: Update a term (admin)
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
 *               name:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Term updated
 */
router.get('/:id', authenticate, ctrl.getTerm);
router.patch('/:id', authenticate, authorize('admin'), ctrl.updateTerm);

export default router;
