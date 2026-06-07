import { z } from 'zod';

export const listSchema = z.object({
  action:     z.string().optional(),
  entityType: z.string().optional(),
  actor:      z.string().optional(),                // free-text: name / user_code / email
  from:       z.string().optional(),                // ISO date
  to:         z.string().optional(),                // ISO date
  // Hard cap raised to 5,000 so the admin's "Export CSV" action can pull a
  // full filtered set in one round-trip instead of paginating through dozens
  // of requests. Day-to-day list calls still default to 50.
  limit:      z.coerce.number().int().min(1).max(5000).default(50),
  offset:     z.coerce.number().int().min(0).default(0),
});
