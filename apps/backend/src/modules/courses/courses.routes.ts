import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import * as ctrl from './courses.controller';

const router = Router();

/**
 * @openapi
 * /courses:
 *   get:
 *     tags: [Courses]
 *     summary: List all courses
 *     parameters:
 *       - in: query
 *         name: programId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Filter by program
 *     responses:
 *       200:
 *         description: List of courses
 *   post:
 *     tags: [Courses]
 *     summary: Create a course (admin)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, title, units]
 *             properties:
 *               code:
 *                 type: string
 *                 example: CS101
 *               title:
 *                 type: string
 *                 example: Introduction to Computer Science
 *               units:
 *                 type: integer
 *                 example: 3
 *               programId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Course created
 */
router.get('/', authenticate, ctrl.listCourses);
router.post('/', authenticate, authorize('admin'), ctrl.createCourse);

/**
 * @openapi
 * /courses/{id}:
 *   get:
 *     tags: [Courses]
 *     summary: Get course by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Course
 *       404:
 *         description: Not found
 *   patch:
 *     tags: [Courses]
 *     summary: Update a course (admin)
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
 *               title:
 *                 type: string
 *               units:
 *                 type: integer
 *               programId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Course updated
 */
router.get('/:id', authenticate, ctrl.getCourse);
router.patch('/:id', authenticate, authorize('admin'), ctrl.updateCourse);

export default router;
