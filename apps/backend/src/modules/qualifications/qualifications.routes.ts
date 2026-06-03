import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import * as ctrl from './qualifications.controller';

const router = Router();

/**
 * @openapi
 * /qualifications/{facultyId}:
 *   get:
 *     tags: [Qualifications]
 *     summary: Get a faculty member's teaching qualifications + load cap
 *     parameters:
 *       - in: path
 *         name: facultyId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Qualifications + maxTeachingUnits }
 *       403: { description: Not allowed (must be the faculty themselves or admin) }
 *   put:
 *     tags: [Qualifications]
 *     summary: Replace the entire qualifications list (and optionally the load cap)
 *     parameters:
 *       - in: path
 *         name: facultyId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               maxTeachingUnits: { type: integer, nullable: true, minimum: 0, maximum: 60 }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [courseId]
 *                   properties:
 *                     courseId:   { type: string, format: uuid }
 *                     preference: { type: integer, minimum: 1, maximum: 5, default: 3 }
 *                     notes:      { type: string, maxLength: 500 }
 *     responses:
 *       200: { description: Updated payload }
 */
router.get('/:facultyId', authenticate, ctrl.getForFaculty);
router.put('/:facultyId', authenticate, ctrl.replaceForFaculty);

/**
 * @openapi
 * /qualifications/{facultyId}/items:
 *   post:
 *     tags: [Qualifications]
 *     summary: Add (or upsert) a single qualification — used by the toggle button
 *     parameters:
 *       - in: path
 *         name: facultyId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [courseId]
 *             properties:
 *               courseId:   { type: string, format: uuid }
 *               preference: { type: integer, minimum: 1, maximum: 5, default: 3 }
 *               notes:      { type: string, maxLength: 500 }
 *     responses:
 *       201: { description: Created (or updated by upsert) }
 */
router.post('/:facultyId/items', authenticate, ctrl.upsertOne);

/**
 * @openapi
 * /qualifications/{facultyId}/items/{id}:
 *   patch:
 *     tags: [Qualifications]
 *     summary: Update one qualification's priority or notes
 *     parameters:
 *       - in: path
 *         name: facultyId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Updated }
 *       404: { description: Not found }
 *   delete:
 *     tags: [Qualifications]
 *     summary: Remove one qualification
 *     parameters:
 *       - in: path
 *         name: facultyId
 *         required: true
 *         schema: { type: string, format: uuid }
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Deleted }
 */
router.patch ('/:facultyId/items/:id', authenticate, ctrl.updateOne);
router.delete('/:facultyId/items/:id', authenticate, ctrl.deleteOne);

export default router;
