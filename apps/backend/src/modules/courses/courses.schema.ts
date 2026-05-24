import { z } from 'zod';

export const createCourseSchema = z.object({
  code:       z.string().min(1),
  title:      z.string().min(1),
  units:      z.number().int().positive(),
  visibility: z.enum(['public', 'restricted']).optional().default('public'),
  // Only honored when visibility === 'restricted'. Required in that case.
  programIds: z.array(z.string().uuid()).optional(),
}).refine(
  d => d.visibility !== 'restricted' || (d.programIds && d.programIds.length > 0),
  { message: 'Restricted courses must specify at least one program', path: ['programIds'] },
);

export const updateCourseSchema = z.object({
  code:       z.string().min(1).optional(),
  title:      z.string().min(1).optional(),
  units:      z.number().int().positive().optional(),
  visibility: z.enum(['public', 'restricted']).optional(),
  programIds: z.array(z.string().uuid()).optional(),
});
