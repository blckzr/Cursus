import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import * as ctrl from './wishlist.controller';

const router = Router();

/**
 * @openapi
 * /wishlist/terms:
 *   get:
 *     tags: [Wishlist]
 *     summary: List terms a student can pre-register for
 *     description: |
 *       Returns inactive terms ordered by `start_date` ASC. The frontend
 *       picks the first one as the default target term.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: Array of terms }
 */
router.get('/terms', authenticate, authorize('student'), ctrl.listEligibleTerms);

/**
 * @openapi
 * /wishlist/candidates:
 *   get:
 *     tags: [Wishlist]
 *     summary: Courses the student could wishlist for a given term
 *     parameters:
 *       - in: query
 *         name: termId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Candidate courses, each annotated with locked/blockedBy/onWishlist flags.
 */
router.get('/candidates', authenticate, authorize('student'), ctrl.listCandidates);

/**
 * @openapi
 * /wishlist/me:
 *   get:
 *     tags: [Wishlist]
 *     summary: Caller's wishlist entries
 *     parameters:
 *       - in: query
 *         name: termId
 *         description: Optional — narrow to a single term
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Wishlist entries }
 */
router.get('/me', authenticate, authorize('student'), ctrl.listMyWishlist);

/**
 * @openapi
 * /wishlist/me:
 *   post:
 *     tags: [Wishlist]
 *     summary: Add (or update by upsert) a wishlist entry
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [termId, courseId]
 *             properties:
 *               termId:    { type: string, format: uuid }
 *               courseId:  { type: string, format: uuid }
 *               priority:  { type: integer, minimum: 1, maximum: 5, default: 3 }
 *               notes:     { type: string, maxLength: 500 }
 *     responses:
 *       201: { description: Entry created (or updated by upsert) }
 *       409: { description: Term is already open — wishlist locked }
 */
router.post('/me', authenticate, authorize('student'), ctrl.createEntry);

/**
 * @openapi
 * /wishlist/me/{id}:
 *   patch:
 *     tags: [Wishlist]
 *     summary: Edit priority or notes on an existing entry
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Updated entry }
 *       404: { description: Not found / not owned by caller }
 *   delete:
 *     tags: [Wishlist]
 *     summary: Remove an entry from the wishlist
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       204: { description: Deleted }
 */
router.patch ('/me/:id', authenticate, authorize('student'), ctrl.updateEntry);
router.delete('/me/:id', authenticate, authorize('student'), ctrl.deleteEntry);

/**
 * @openapi
 * /wishlist/demand:
 *   get:
 *     tags: [Wishlist]
 *     summary: Per-course demand aggregate for a term (admin)
 *     description: |
 *       For each course wished-for in the target term, returns total demand,
 *       how many marked it high-priority (1–2), a breakdown by student year
 *       level, and the underlying list of interested students.
 *     parameters:
 *       - in: query
 *         name: termId
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Demand rows }
 */
router.get('/demand', authenticate, authorize('admin'), ctrl.listDemand);

export default router;
