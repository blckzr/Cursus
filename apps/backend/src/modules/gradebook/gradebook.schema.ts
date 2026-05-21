import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().min(1),
  weight: z.number().min(0).max(100),
  displayOrder: z.number().int().optional().default(0),
});

export const updateCategorySchema = createCategorySchema.partial();

export const createAssessmentSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1),
  maxScore: z.number().positive(),
  displayOrder: z.number().int().optional().default(0),
});

export const updateAssessmentSchema = createAssessmentSchema.omit({ categoryId: true }).partial();

export const bulkScoreSchema = z.object({
  scores: z.array(z.object({
    assessmentId: z.string().uuid(),
    enrollmentId: z.string().uuid(),
    score: z.number().min(0).nullable(),
  })),
});

export const finalizeSchema = z.object({
  grades: z.array(z.object({
    enrollmentId: z.string().uuid(),
    letterGrade: z.string().optional(),
  })).optional(),
});
