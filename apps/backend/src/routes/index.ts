import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { login, me, updateMe, changePassword } from '../modules/auth/auth.controller';
import usersRouter from '../modules/users/users.routes';
import programsRouter from '../modules/programs/programs.routes';
import coursesRouter from '../modules/courses/courses.routes';
import termsRouter from '../modules/terms/terms.routes';
import sectionsRouter from '../modules/sections/sections.routes';
import enrollmentsRouter from '../modules/enrollments/enrollments.routes';
import blocksRouter from '../modules/blocks/blocks.routes';
import curriculumRouter from '../modules/curriculum/curriculum.routes';
import availabilityRouter from '../modules/availability/availability.routes';
import auditLogsRouter from '../modules/audit-logs/audit-logs.routes';
import gradebookRouter from '../modules/gradebook/gradebook.routes';
import notificationsRouter from '../modules/notifications/notifications.routes';
import wishlistRouter from '../modules/wishlist/wishlist.routes';
import qualificationsRouter from '../modules/qualifications/qualifications.routes';

const router = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [System]
 *     summary: Health check
 *     description: Confirms the server is running and the database connection is alive.
 *     security: []
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login
 *     description: Authenticates a user and returns a JWT token plus the user profile.
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       401:
 *         description: Invalid user code or password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/auth/login', login);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Current user
 *     description: Returns the profile of the currently authenticated user.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserProfile'
 *       401:
 *         description: Missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/auth/me', authenticate, me);

/**
 * @openapi
 * /auth/me:
 *   patch:
 *     tags: [Auth]
 *     summary: Update the calling user's name or email
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName: { type: string }
 *               email:    { type: string, format: email }
 *     responses:
 *       200: { description: Updated profile }
 */
router.patch('/auth/me', authenticate, updateMe);

/**
 * @openapi
 * /auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Change the calling user's password
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword: { type: string }
 *               newPassword:     { type: string, minLength: 8 }
 *     responses:
 *       200: { description: Password updated }
 *       401: { description: Current password incorrect }
 */
router.post('/auth/change-password', authenticate, changePassword);

router.use('/users', usersRouter);
router.use('/programs', programsRouter);
router.use('/courses', coursesRouter);
router.use('/terms', termsRouter);
router.use('/sections', sectionsRouter);
router.use('/enrollments', enrollmentsRouter);
router.use('/blocks', blocksRouter);
router.use('/availability', availabilityRouter);
router.use('/audit-logs', auditLogsRouter);
router.use('/notifications', notificationsRouter);
router.use('/wishlist',       wishlistRouter);
router.use('/qualifications', qualificationsRouter);
router.use('/', curriculumRouter);
router.use('/', gradebookRouter);

export default router;
