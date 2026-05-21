import { z } from 'zod';

export const createProgramSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  totalUnits: z.number().int().positive(),
});

export const updateProgramSchema = createProgramSchema.partial();
