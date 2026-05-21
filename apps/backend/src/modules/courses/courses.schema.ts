import { z } from 'zod';

export const createCourseSchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  units: z.number().int().positive(),
  programId: z.string().uuid().optional(),
});

export const updateCourseSchema = createCourseSchema.partial();
