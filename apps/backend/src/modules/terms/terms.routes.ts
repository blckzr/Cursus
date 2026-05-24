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

/**
 * @openapi
 * /terms/{id}/open:
 *   post:
 *     tags: [Terms]
 *     summary: Bulk-create sections + enrollments from each program's curriculum (admin)
 *     description: |
 *       For every program × year level in scope, materialises the curriculum
 *       slot matching this term's semester:
 *         • creates one section per (block, course, term) — TBA faculty/schedule
 *         • auto-enrolls every active student in the block into each section
 *       Idempotent — re-running skips anything already in place.
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
 *               programIds:
 *                 type: array
 *                 description: Subset of programs to open (omit for all programs)
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       200:
 *         description: Result summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sectionsCreated:    { type: integer }
 *                 sectionsSkipped:    { type: integer }
 *                 enrollmentsCreated: { type: integer }
 */
router.post('/:id/open', authenticate, authorize('admin'), ctrl.openTerm);

export default router;
