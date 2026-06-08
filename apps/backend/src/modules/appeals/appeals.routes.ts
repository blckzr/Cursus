import { Router } from 'express';
import { authenticate, authorize, authorizeStudentActive } from '../../middleware/auth';
import * as ctrl from './appeals.controller';

const router = Router();

// Student — listMine stays open to alumni for read-only history;
// create + withdraw are blocked because the appeal window has expired.
router.get   ('/me',           authenticate, authorize('student'), ctrl.listMine);
router.post  ('/me',           authenticate, authorize('student'), authorizeStudentActive, ctrl.create);
router.post  ('/me/:id/withdraw', authenticate, authorize('student'), authorizeStudentActive, ctrl.withdraw);

// Faculty
router.get   ('/faculty',                  authenticate, authorize('faculty'), ctrl.listFaculty);
router.post  ('/faculty/:id/accept',       authenticate, authorize('faculty'), ctrl.accept);
router.post  ('/faculty/:id/resolve',      authenticate, authorize('faculty'), ctrl.resolveByFaculty);
router.post  ('/faculty/:id/escalate',     authenticate, authorize('faculty'), ctrl.escalate);

// Admin (acting as dean)
router.get   ('/admin',               authenticate, authorize('admin'), ctrl.listAdmin);
router.post  ('/admin/:id/resolve',   authenticate, authorize('admin'), ctrl.resolveByDean);

export default router;
