import { z } from 'zod';

export const retentionQuerySchema = z.object({
  programId: z.string().uuid().optional(),
});
