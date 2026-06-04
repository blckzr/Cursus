import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import * as ctrl from './users.controller';

const router = Router();

router.use(authenticate, authorize('admin'));

/**
 * @openapi
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: List all users
 *     parameters:
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [admin, faculty, student]
 *         description: Filter by role
 *     responses:
 *       200:
 *         description: List of users
 */
router.get('/', ctrl.listUsers);

/**
 * @openapi
 * /users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get user by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: User profile
 *       404:
 *         description: User not found
 */
router.get('/:id', ctrl.getUser);

/**
 * @openapi
 * /users:
 *   post:
 *     tags: [Users]
 *     summary: Create a user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, fullName, role]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               fullName:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, faculty, student]
 *     responses:
 *       201:
 *         description: User created
 *       400:
 *         description: Validation error
 */
router.post('/', ctrl.createUser);

/**
 * @openapi
 * /users/bulk-import/preview:
 *   post:
 *     tags: [Users]
 *     summary: Validate a CSV-parsed batch without writing anything
 *     description: |
 *       Client parses the CSV locally and posts raw rows; the server validates
 *       each (Zod schema, duplicate email check against the DB and within the
 *       file, program-code lookup) and returns categorised valid/invalid rows.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rows]
 *             properties:
 *               rows:
 *                 type: array
 *                 maxItems: 1000
 *                 items:
 *                   type: object
 *                   required: [rowIndex, email, fullName, role]
 *                   properties:
 *                     rowIndex:    { type: integer }
 *                     email:       { type: string }
 *                     fullName:    { type: string }
 *                     role:        { type: string, enum: [admin, faculty, student] }
 *                     branch:      { type: string }
 *                     programCode: { type: string }
 *     responses:
 *       200: { description: Preview result with valid / invalid arrays + summary }
 */
router.post('/bulk-import/preview', ctrl.bulkPreview);

/**
 * @openapi
 * /users/bulk-import/apply:
 *   post:
 *     tags: [Users]
 *     summary: Create users from a validated batch
 *     description: |
 *       Re-runs validation server-side, then creates the valid rows via the
 *       normal createUser path (default password, sequence-generated code,
 *       block auto-assignment, active-term enrollment fanout). Per-row
 *       failures (block-full, etc.) are reported in the response so a partial
 *       success leaves a clear trail.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BulkImportBody'
 *     responses:
 *       200: { description: Created + failed arrays }
 */
router.post('/bulk-import/apply', ctrl.bulkApply);

/**
 * @openapi
 * /users/{id}:
 *   patch:
 *     tags: [Users]
 *     summary: Update a user
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
 *               fullName:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: User updated
 *       404:
 *         description: User not found
 */
router.patch('/:id', ctrl.updateUser);

export default router;
