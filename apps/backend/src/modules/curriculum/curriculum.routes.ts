import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import * as ctrl from './curriculum.controller';

const router = Router();

/**
 * @openapi
 * /programs/{programId}/curriculum:
 *   get:
 *     tags: [Curriculum]
 *     summary: List the curriculum for a program (admin)
 *     parameters:
 *       - in: path
 *         name: programId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: List of curriculum entries with their course details }
 *   post:
 *     tags: [Curriculum]
 *     summary: Add a course to the curriculum at a specific year/semester (admin)
 *     parameters:
 *       - in: path
 *         name: programId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [courseId, yearLevel, semester]
 *             properties:
 *               courseId:     { type: string, format: uuid }
 *               yearLevel:    { type: integer, example: 1 }
 *               semester:     { type: string, enum: ['1', '2', 'summer'] }
 *               displayOrder: { type: integer }
 *     responses:
 *       201: { description: Entry created }
 *       409: { description: Visibility or prerequisite violation }
 */
router.get('/programs/:programId/curriculum',           authenticate, ctrl.listCurriculum);
router.post('/programs/:programId/curriculum',          authenticate, authorize('admin'), ctrl.addEntry);

/**
 * @openapi
 * /programs/{programId}/curriculum/{entryId}:
 *   delete:
 *     tags: [Curriculum]
 *     summary: Remove a curriculum entry (admin)
 *     parameters:
 *       - in: path
 *         name: programId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: entryId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Removed }
 *       409: { description: Blocked because dependents still rely on this course }
 */
router.delete('/programs/:programId/curriculum/:entryId', authenticate, authorize('admin'), ctrl.removeEntry);

export default router;
