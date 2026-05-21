import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import * as ctrl from './enrollments.controller';

const router = Router();

/**
 * @openapi
 * /enrollments:
 *   get:
 *     tags: [Enrollments]
 *     summary: List enrollments
 *     parameters:
 *       - in: query
 *         name: sectionId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by section
 *       - in: query
 *         name: studentId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by student
 *     responses:
 *       200:
 *         description: List of enrollments with student and section details
 *   post:
 *     tags: [Enrollments]
 *     summary: Enroll a student in a section (admin)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [studentId, sectionId]
 *             properties:
 *               studentId:
 *                 type: string
 *                 format: uuid
 *               sectionId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Enrollment created
 *       409:
 *         description: Section is at full capacity
 */
router.get('/', authenticate, authorize('admin', 'faculty'), ctrl.listEnrollments);
router.post('/', authenticate, authorize('admin'), ctrl.createEnrollment);

/**
 * @openapi
 * /enrollments/{id}:
 *   patch:
 *     tags: [Enrollments]
 *     summary: Update enrollment status (admin)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [enrolled, dropped, completed]
 *     responses:
 *       200:
 *         description: Enrollment updated
 *       404:
 *         description: Enrollment not found
 */
router.patch('/:id', authenticate, authorize('admin'), ctrl.updateEnrollment);

export default router;
