import { z } from 'zod';

export const submitRequestSchema = z.object({
  userCode: z.string().min(1).max(40),
});

export const resolveRequestSchema = z.object({
  note: z.string().max(500).optional(),
});
