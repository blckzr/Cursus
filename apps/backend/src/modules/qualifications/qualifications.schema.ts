import { z } from 'zod';

/** Replace-all semantics (mirrors availability). One PUT replaces the list. */
export const replaceSchema = z.object({
  maxTeachingUnits: z.coerce.number().int().min(0).max(60).nullable().optional(),
  items: z.array(z.object({
    courseId:   z.string().uuid(),
    preference: z.coerce.number().int().min(1).max(5).default(3),
    notes:      z.string().max(500).optional(),
  })),
});

/** Single-row toggle endpoint used by the "Add / remove" buttons. */
export const upsertOneSchema = z.object({
  courseId:   z.string().uuid(),
  preference: z.coerce.number().int().min(1).max(5).default(3),
  notes:      z.string().max(500).optional(),
});

export const updateOneSchema = z.object({
  preference: z.coerce.number().int().min(1).max(5).optional(),
  notes:      z.string().max(500).nullable().optional(),
});
