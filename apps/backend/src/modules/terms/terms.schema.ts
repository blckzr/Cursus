import { z } from 'zod';

export const createTermSchema = z.object({
  name:      z.string().min(1),
  semester:  z.enum(['1', '2', 'summer']),
  startDate: z.string().date(),
  endDate:   z.string().date(),
  isActive:  z.boolean().optional().default(false),
});

export const updateTermSchema = createTermSchema.partial();

export const openTermSchema = z.object({
  programIds: z.array(z.string().uuid()).optional(),
});
