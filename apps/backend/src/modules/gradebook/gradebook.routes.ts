import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { requireSectionOwner } from '../../middleware/requireSectionOwner';
import * as ctrl from './gradebook.controller';

const router = Router();

/**
 * @openapi
 * /sections/{id}/gradebook:
 *   get:
 *     tags: [Gradebook]
 *     summary: Get full gradebook grid for a section
 *     description: Returns section info, all categories/assessments, all students, and all scores. Faculty only for their own section.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Full gradebook payload
 *       404:
 *         description: Section not found
 */
router.get(
  '/sections/:id/gradebook',
  authenticate, authorize('admin', 'faculty'),
  requireSectionOwner,
  ctrl.getGradebook,
);

/**
 * @openapi
 * /sections/{id}/categories:
 *   post:
 *     tags: [Gradebook]
 *     summary: Add an assessment category to a section
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
 *             required: [name, weight]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Quizzes
 *               weight:
 *                 type: number
 *                 example: 30
 *               displayOrder:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       201:
 *         description: Category created
 */
router.post(
  '/sections/:id/categories',
  authenticate, authorize('admin', 'faculty'),
  requireSectionOwner,
  ctrl.createCategory,
);

/**
 * @openapi
 * /sections/{id}/categories/{categoryId}:
 *   patch:
 *     tags: [Gradebook]
 *     summary: Update a category
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: categoryId
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
 *               weight:
 *                 type: number
 *               displayOrder:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Category updated
 *   delete:
 *     tags: [Gradebook]
 *     summary: Delete a category (also deletes its assessments and scores)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Deleted
 */
router.patch(
  '/sections/:id/categories/:categoryId',
  authenticate, authorize('admin', 'faculty'),
  requireSectionOwner,
  ctrl.updateCategory,
);
router.delete(
  '/sections/:id/categories/:categoryId',
  authenticate, authorize('admin', 'faculty'),
  requireSectionOwner,
  ctrl.deleteCategory,
);

/**
 * @openapi
 * /sections/{id}/assessments:
 *   post:
 *     tags: [Gradebook]
 *     summary: Add an assessment column to a category
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
 *             required: [categoryId, name, maxScore]
 *             properties:
 *               categoryId:
 *                 type: string
 *                 format: uuid
 *               name:
 *                 type: string
 *                 example: Quiz 1
 *               maxScore:
 *                 type: number
 *                 example: 50
 *               displayOrder:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       201:
 *         description: Assessment created
 */
router.post(
  '/sections/:id/assessments',
  authenticate, authorize('admin', 'faculty'),
  requireSectionOwner,
  ctrl.createAssessment,
);

/**
 * @openapi
 * /sections/{id}/assessments/{assessmentId}:
 *   patch:
 *     tags: [Gradebook]
 *     summary: Update an assessment
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: assessmentId
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
 *               maxScore:
 *                 type: number
 *               displayOrder:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Assessment updated
 *   delete:
 *     tags: [Gradebook]
 *     summary: Delete an assessment (also deletes its scores)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: assessmentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       204:
 *         description: Deleted
 */
router.patch(
  '/sections/:id/assessments/:assessmentId',
  authenticate, authorize('admin', 'faculty'),
  requireSectionOwner,
  ctrl.updateAssessment,
);
router.delete(
  '/sections/:id/assessments/:assessmentId',
  authenticate, authorize('admin', 'faculty'),
  requireSectionOwner,
  ctrl.deleteAssessment,
);

/**
 * @openapi
 * /sections/{id}/scores/bulk:
 *   put:
 *     tags: [Gradebook]
 *     summary: Bulk save scores (single round-trip from the grid)
 *     description: Upserts multiple score cells at once. Each entry targets one assessment × one enrollment cell.
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
 *             required: [scores]
 *             properties:
 *               scores:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [assessmentId, enrollmentId, score]
 *                   properties:
 *                     assessmentId:
 *                       type: string
 *                       format: uuid
 *                     enrollmentId:
 *                       type: string
 *                       format: uuid
 *                     score:
 *                       type: number
 *                       nullable: true
 *     responses:
 *       200:
 *         description: Scores saved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 saved:
 *                   type: integer
 */
router.put(
  '/sections/:id/scores/bulk',
  authenticate, authorize('admin', 'faculty'),
  requireSectionOwner,
  ctrl.bulkSaveScores,
);

/**
 * @openapi
 * /sections/{id}/finalize:
 *   post:
 *     tags: [Gradebook]
 *     summary: Finalize grades for all students in a section
 *     description: Computes numeric grades from current scores and locks them. Optionally accepts letter grade overrides per student.
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
 *               grades:
 *                 type: array
 *                 description: Optional letter grade overrides per student
 *                 items:
 *                   type: object
 *                   required: [enrollmentId]
 *                   properties:
 *                     enrollmentId:
 *                       type: string
 *                       format: uuid
 *                     letterGrade:
 *                       type: string
 *                       example: "1.75"
 *     responses:
 *       200:
 *         description: Grades finalized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 finalized:
 *                   type: integer
 *                 grades:
 *                   type: array
 */
router.post(
  '/sections/:id/finalize',
  authenticate, authorize('admin', 'faculty'),
  requireSectionOwner,
  ctrl.finalizeGrades,
);

/**
 * @openapi
 * /sections/{id}/export:
 *   get:
 *     tags: [Gradebook]
 *     summary: Export gradebook as CSV
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 */
router.get(
  '/sections/:id/export',
  authenticate, authorize('admin', 'faculty'),
  requireSectionOwner,
  ctrl.exportCsv,
);

/**
 * @openapi
 * /students/{studentId}/grades:
 *   get:
 *     tags: [Gradebook]
 *     summary: Get a student's grades across all enrolled sections
 *     description: Students can only access their own grades. Admins can access any student.
 *     parameters:
 *       - in: path
 *         name: studentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of enrollments with computed and finalized grades
 *       403:
 *         description: Access denied
 */
router.get(
  '/students/:studentId/grades',
  authenticate, authorize('admin', 'faculty', 'student'),
  ctrl.getStudentGrades,
);

/**
 * @openapi
 * /students/me/transcript:
 *   get:
 *     tags: [Gradebook]
 *     summary: Download the calling student's transcript as CSV
 *     description: |
 *       One row per enrollment (every section ever taken), ordered chronologically
 *       by term start date then course code.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema: { type: string }
 */
router.get('/students/me/transcript', authenticate, authorize('student'), ctrl.exportTranscript);

/**
 * @openapi
 * /students/me/cor:
 *   get:
 *     tags: [Gradebook]
 *     summary: Certificate of Registration — JSON payload (preview)
 *     description: |
 *       Returns the data that will appear on the student's Certificate of
 *       Registration: the active term, student profile, and enrolled
 *       subjects with schedule. The frontend renders an on-page preview
 *       from this payload before the student downloads the PDF.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Registration payload }
 *       404: { description: No active registration }
 */
router.get('/students/me/cor', authenticate, authorize('student'), ctrl.getCor);

/**
 * @openapi
 * /students/me/cor.pdf:
 *   get:
 *     tags: [Gradebook]
 *     summary: Download the Certificate of Registration as a PDF
 *     description: Landscape A4 PDF — single page covering the active term.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: PDF file download
 *         content:
 *           application/pdf:
 *             schema: { type: string, format: binary }
 *       404: { description: No active registration }
 */
router.get('/students/me/cor.pdf', authenticate, authorize('student'), ctrl.downloadCor);

/**
 * @openapi
 * /sections/{id}/roster:
 *   get:
 *     tags: [Gradebook]
 *     summary: Compact section roster (faculty / admin)
 *     description: Just the enrolled student list — no scores, no categories. Used for the dedicated roster page.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Section info + student array }
 */
router.get(
  '/sections/:id/roster',
  authenticate, authorize('admin', 'faculty'),
  requireSectionOwner,
  ctrl.getRoster,
);

/**
 * @openapi
 * /sections/{id}/roster/csv:
 *   get:
 *     tags: [Gradebook]
 *     summary: Download the section roster as CSV (faculty / admin)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: CSV file download }
 */
router.get(
  '/sections/:id/roster/csv',
  authenticate, authorize('admin', 'faculty'),
  requireSectionOwner,
  ctrl.exportRosterCsv,
);

export default router;
