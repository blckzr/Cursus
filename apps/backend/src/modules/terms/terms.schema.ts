import { z } from 'zod';

export const createTermSchema = z.object({
  name: z.string().min(1),
  startDate: z.string().date(),
  endDate: z.string().date(),
  isActive: z.boolean().optional().default(false),
});

export const updateTermSchema = createTermSchema.partial();
