import { z } from 'zod';

export const retentionQuerySchema = z.object({
  programId: z.string().uuid().optional(),
});

export const facultyLoadQuerySchema = z.object({
  /** Optional — defaults to the currently active term. */
  termId: z.string().uuid().optional(),
});

export const sectionFillQuerySchema = z.object({
  /** Optional — defaults to the currently active term. */
  termId: z.string().uuid().optional(),
});

export const gwaStatsQuerySchema = z.object({
  programId: z.string().uuid().optional(),
  groupBy:   z.enum(['cohort', 'term']).default('cohort'),
});
