import { z } from 'zod';

export const createProgramSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  // Block configuration — used to auto-generate year/program block sections.
  yearLevels: z.number().int().min(1).max(8).optional(),
  blocksPerYear: z.number().int().positive().optional(),
  blockCapacity: z.number().int().positive().optional(),
  // total_units intentionally NOT accepted — it's computed live from the
  // program's curriculum entries (sum of placed course units).
});

export const updateProgramSchema = createProgramSchema.partial();
