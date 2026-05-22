import { z } from 'zod';

export const loginSchema = z.object({
  // Users sign in with their user code (e.g. 2026-00001-MN-2), not email.
  userCode: z.string().min(1, 'User code is required').transform(s => s.trim().toUpperCase()),
  password: z.string().min(1, 'Password is required'),
});
