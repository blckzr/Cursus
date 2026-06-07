import { z } from 'zod';

export const semesterEnum = z.enum(['1', '2', 'summer']);

export const addCurriculumEntrySchema = z.object({
  courseId:        z.string().uuid(),
  yearLevel:       z.number().int().positive(),
  semester:        semesterEnum,
  displayOrder:    z.number().int().nonnegative().optional(),
  meetingsPerWeek: z.union([z.literal(1), z.literal(2)]).optional(),
});

export const updateCurriculumEntrySchema = z.object({
  meetingsPerWeek: z.union([z.literal(1), z.literal(2)]),
});

export type Semester = z.infer<typeof semesterEnum>;
