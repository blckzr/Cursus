import { z } from 'zod';

export const slotSchema = z.object({
  dayOfWeek: z.string().min(1),
  startTime: z.string().min(1),
  endTime:   z.string().min(1),
  kind:      z.enum(['teaching', 'office_hour']),
});

export const bulkReplaceSchema = z.object({
  slots: z.array(slotSchema),
});
