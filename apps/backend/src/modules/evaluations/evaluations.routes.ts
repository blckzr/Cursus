import { Router } from 'express';
import { authenticate, authorize, authorizeStudentActive } from '../../middleware/auth';
import * as ctrl from './evaluations.controller';

const router = Router();

/**
 * @openapi
 * /evaluations/status:
 *   get:
 *     tags: [Evaluations]
 *     summary: Calling student's pending + completed evaluations for the active term
 *     responses:
 *       200: { description: Status payload with pending/done sections + window state }
 */
router.get('/evaluations/status', authenticate, authorize('student'), authorizeStudentActive, ctrl.getStatus);

/**
 * @openapi
 * /students/me/must-evaluate-first:
 *   get:
 *     tags: [Evaluations]
 *     summary: Sections the calling student must evaluate before their finalized grade unlocks
 *     responses:
 *       200: { description: Empty array when nothing is locked }
 */
router.get('/students/me/must-evaluate-first', authenticate, authorize('student'), authorizeStudentActive, ctrl.getMustEvaluateFirst);

/**
 * @openapi
 * /evaluations/questions:
 *   get:
 *     tags: [Evaluations]
 *     summary: Active question bank for the student form
 *     responses:
 *       200: { description: List of questions (likert_5 + text), display-ordered }
 */
router.get('/evaluations/questions', authenticate, authorize('student'), authorizeStudentActive, ctrl.getActiveQuestions);

/**
 * @openapi
 * /evaluations/section/{sectionId}:
 *   post:
 *     tags: [Evaluations]
 *     summary: Submit the calling student's evaluation for a section (one-shot)
 *     parameters:
 *       - { in: path, name: sectionId, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [answers]
 *             properties:
 *               answers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [questionId]
 *                   properties:
 *                     questionId:  { type: string, format: uuid }
 *                     likertValue: { type: integer, minimum: 1, maximum: 5 }
 *                     textValue:   { type: string }
 *     responses:
 *       201: { description: Evaluation submitted }
 *       409: { description: Period closed, already submitted, or section has no faculty }
 */
router.post('/evaluations/section/:sectionId', authenticate, authorize('student'), authorizeStudentActive, ctrl.submit);

/**
 * @openapi
 * /evaluations/faculty/term/{termId}:
 *   get:
 *     tags: [Evaluations]
 *     summary: Calling faculty's K-anonymous rollup for one term
 *     description: |
 *       Each section's per-question means + distributions and a shuffled list
 *       of free-text answers, all gated by `eval_periods.min_response_n`
 *       (default 3). Sections below the threshold return `meetsThreshold:false`
 *       with no numbers or texts.
 *     parameters:
 *       - { in: path, name: termId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Faculty rollup payload }
 */
router.get('/evaluations/faculty/term/:termId', authenticate, authorize('faculty'), ctrl.getFacultyRollup);

/**
 * @openapi
 * /evaluations/admin/term/{termId}:
 *   get:
 *     tags: [Evaluations]
 *     summary: Institution-wide rollup (admin)
 *     parameters:
 *       - { in: path, name: termId, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200: { description: Per-faculty mean rating, K-anonymous }
 *
 * /evaluations/admin/questions:
 *   get:
 *     tags: [Evaluations]
 *     summary: Question bank (admin — includes archived)
 *     responses:
 *       200: { description: All questions, active first }
 *   post:
 *     tags: [Evaluations]
 *     summary: Add a question (admin)
 *     responses:
 *       201: { description: Created }
 *
 * /evaluations/admin/questions/{id}:
 *   patch:
 *     tags: [Evaluations]
 *     summary: Edit prompt / display_order / archived (admin)
 *     responses:
 *       200: { description: Updated }
 *       404: { description: Question not found }
 *
 * /evaluations/admin/period/{termId}:
 *   get:
 *     tags: [Evaluations]
 *     summary: Current evaluation window for a term (admin)
 *   post:
 *     tags: [Evaluations]
 *     summary: Set the window (admin — pass {preset:'auto'} for end_date ± 30/7 days)
 */
router.get ('/evaluations/admin/term/:termId',  authenticate, authorize('admin'), ctrl.getAdminRollup);
router.get ('/evaluations/admin/questions',     authenticate, authorize('admin'), ctrl.listQuestions);
router.post('/evaluations/admin/questions',     authenticate, authorize('admin'), ctrl.createQuestion);
router.patch('/evaluations/admin/questions/:id',authenticate, authorize('admin'), ctrl.updateQuestion);
router.get ('/evaluations/admin/period/:termId',authenticate, authorize('admin'), ctrl.getOrSetPeriod);
router.post('/evaluations/admin/period/:termId',authenticate, authorize('admin'), ctrl.getOrSetPeriod);

export default router;
