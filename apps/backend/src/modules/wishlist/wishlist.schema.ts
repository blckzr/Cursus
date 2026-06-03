import { z } from 'zod';

export const createWishlistEntrySchema = z.object({
  termId:   z.string().uuid(),
  courseId: z.string().uuid(),
  priority: z.coerce.number().int().min(1).max(5).default(3),
  notes:    z.string().max(500).optional(),
});

export const updateWishlistEntrySchema = z.object({
  priority: z.coerce.number().int().min(1).max(5).optional(),
  notes:    z.string().max(500).nullable().optional(),
});

export const listMyWishlistSchema = z.object({
  termId: z.string().uuid().optional(),
});

export const demandSchema = z.object({
  termId: z.string().uuid(),
});
