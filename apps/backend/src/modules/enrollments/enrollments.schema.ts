import { z } from 'zod';

export const createEnrollmentSchema = z.object({
  studentId: z.string().uuid(),
  sectionId: z.string().uuid(),
});

export const updateEnrollmentSchema = z.object({
  status: z.enum(['enrolled', 'dropped', 'completed']),
});
