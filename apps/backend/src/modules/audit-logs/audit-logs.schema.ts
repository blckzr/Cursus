import { z } from 'zod';

export const listSchema = z.object({
  action:     z.string().optional(),
  entityType: z.string().optional(),
  actor:      z.string().optional(),                // free-text: name / user_code / email
  from:       z.string().optional(),                // ISO date
  to:         z.string().optional(),                // ISO date
  limit:      z.coerce.number().int().min(1).max(200).default(50),
  offset:     z.coerce.number().int().min(0).default(0),
});
