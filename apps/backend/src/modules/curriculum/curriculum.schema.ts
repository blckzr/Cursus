import { z } from 'zod';

export const semesterEnum = z.enum(['1', '2', 'summer']);

export const addCurriculumEntrySchema = z.object({
  courseId:     z.string().uuid(),
  yearLevel:    z.number().int().positive(),
  semester:     semesterEnum,
  displayOrder: z.number().int().nonnegative().optional(),
});

export type Semester = z.infer<typeof semesterEnum>;
