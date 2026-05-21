import { z } from 'zod';

export const createSectionSchema = z.object({
  courseId: z.string().uuid(),
  termId: z.string().uuid(),
  facultyId: z.string().uuid(),
  sectionCode: z.string().min(1),
  dayOfWeek: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  room: z.string().optional(),
  capacity: z.number().int().positive(),
});

export const updateSectionSchema = createSectionSchema.partial();
