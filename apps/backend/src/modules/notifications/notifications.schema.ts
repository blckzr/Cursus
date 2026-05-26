import { z } from 'zod';

export const listSchema = z.object({
  limit:      z.coerce.number().int().min(1).max(50).default(20),
  unreadOnly: z.coerce.boolean().default(false),
});
