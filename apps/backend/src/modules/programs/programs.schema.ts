import { z } from 'zod';

export const createProgramSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  totalUnits: z.number().int().positive(),
  // Block configuration — used to auto-generate year/program block sections.
  yearLevels: z.number().int().min(1).max(8).optional(),
  blocksPerYear: z.number().int().positive().optional(),
  blockCapacity: z.number().int().positive().optional(),
});

export const updateProgramSchema = createProgramSchema.partial();
