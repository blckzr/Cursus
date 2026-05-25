import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import * as ctrl from './availability.controller';

const router = Router();

/**
 * @openapi
 * /availability/{facultyId}:
 *   get:
 *     tags: [Availability]
 *     summary: List a faculty member's weekly availability slots
 *     description: Accessible to the faculty themselves or an admin.
 *     parameters:
 *       - in: path
 *         name: facultyId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of availability slots
 *   put:
 *     tags: [Availability]
 *     summary: Replace a faculty member's entire weekly availability
 *     description: |
 *       Atomically swaps out the old slot list for a new one.
 *       Accessible to the faculty themselves or an admin.
 *     parameters:
 *       - in: path
 *         name: facultyId
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
 *             required: [slots]
 *             properties:
 *               slots:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [dayOfWeek, startTime, endTime, kind]
 *                   properties:
 *                     dayOfWeek: { type: string,  example: 'MWF' }
 *                     startTime: { type: string,  example: '08:00' }
 *                     endTime:   { type: string,  example: '12:00' }
 *                     kind:      { type: string,  enum: ['teaching', 'office_hour'] }
 *     responses:
 *       200:
 *         description: Updated slot list
 */
router.get('/:facultyId', authenticate, ctrl.listForFaculty);
router.put('/:facultyId', authenticate, ctrl.replaceForFaculty);

export default router;
