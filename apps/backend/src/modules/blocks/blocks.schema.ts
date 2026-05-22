import { z } from 'zod';

export const promoteSchema = z.object({
  programId: z.string().uuid(),
  yearLevel: z.number().int().positive(),
});
