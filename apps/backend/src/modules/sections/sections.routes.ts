import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import * as ctrl from './sections.controller';

const router = Router();

/**
 * @openapi
 * /sections:
 *   get:
 *     tags: [Sections]
 *     summary: List sections
 *     description: Admin sees all sections. Faculty sees only their own.
 *     parameters:
 *       - in: query
 *         name: termId
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: facultyId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Admin only — ignored for faculty role
 *     responses:
 *       200:
 *         description: List of sections with course, term, and faculty details
 *   post:
 *     tags: [Sections]
 *     summary: Create a section (admin)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [courseId, termId, facultyId, sectionCode, capacity]
 *             properties:
 *               courseId:
 *                 type: string
 *                 format: uuid
 *               termId:
 *                 type: string
 *                 format: uuid
 *               facultyId:
 *                 type: string
 *                 format: uuid
 *               sectionCode:
 *                 type: string
 *                 example: CS101-A
 *               dayOfWeek:
 *                 type: string
 *                 example: MWF
 *               startTime:
 *                 type: string
 *                 example: "08:00"
 *               endTime:
 *                 type: string
 *                 example: "09:30"
 *               room:
 *                 type: string
 *                 example: Room 201
 *               capacity:
 *                 type: integer
 *                 example: 40
 *     responses:
 *       201:
 *         description: Section created
 */
router.get('/', authenticate, authorize('admin', 'faculty'), ctrl.listSections);
router.post('/', authenticate, authorize('admin'), ctrl.createSection);

/**
 * @openapi
 * /sections/{id}:
 *   get:
 *     tags: [Sections]
 *     summary: Get section by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Section detail
 *       404:
 *         description: Not found
 *   patch:
 *     tags: [Sections]
 *     summary: Update a section (admin)
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
 *               facultyId:
 *                 type: string
 *                 format: uuid
 *               room:
 *                 type: string
 *               capacity:
 *                 type: integer
 *               dayOfWeek:
 *                 type: string
 *               startTime:
 *                 type: string
 *               endTime:
 *                 type: string
 *     responses:
 *       200:
 *         description: Section updated
 */
router.get('/:id', authenticate, authorize('admin', 'faculty'), ctrl.getSection);
router.patch('/:id', authenticate, authorize('admin'), ctrl.updateSection);

export default router;
