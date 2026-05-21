import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { login, me } from '../modules/auth/auth.controller';
import usersRouter from '../modules/users/users.routes';
import programsRouter from '../modules/programs/programs.routes';
import coursesRouter from '../modules/courses/courses.routes';
import termsRouter from '../modules/terms/terms.routes';
import sectionsRouter from '../modules/sections/sections.routes';
import enrollmentsRouter from '../modules/enrollments/enrollments.routes';
import gradebookRouter from '../modules/gradebook/gradebook.routes';

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
 *         description: Invalid email or password
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

router.use('/users', usersRouter);
router.use('/programs', programsRouter);
router.use('/courses', coursesRouter);
router.use('/terms', termsRouter);
router.use('/sections', sectionsRouter);
router.use('/enrollments', enrollmentsRouter);
router.use('/', gradebookRouter);

export default router;
