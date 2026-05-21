import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { login, me } from '../modules/auth/auth.controller';

const router = Router();

// Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth
router.post('/auth/login', login);
router.get('/auth/me', authenticate, me);

export default router;
