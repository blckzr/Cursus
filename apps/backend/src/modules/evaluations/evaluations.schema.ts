import { z } from 'zod';

export const submitEvaluationSchema = z.object({
  answers: z.array(z.object({
    questionId:  z.string().uuid(),
    likertValue: z.number().int().min(1).max(5).optional(),
    textValue:   z.string().max(2000).optional(),
  })).min(1, 'At least one answer is required.'),
});

export const createQuestionSchema = z.object({
  prompt:       z.string().min(5).max(500),
  kind:         z.enum(['likert_5', 'text']),
  displayOrder: z.number().int().nonnegative().optional(),
});

export const updateQuestionSchema = z.object({
  prompt:       z.string().min(5).max(500).optional(),
  displayOrder: z.number().int().nonnegative().optional(),
  archived:     z.boolean().optional(),     // toggles archived_at
});

export const setPeriodSchema = z.object({
  opensAt:        z.string().datetime().optional(),
  closesAt:       z.string().datetime().optional(),
  minResponseN:   z.number().int().min(1).max(50).optional(),
  /** Convenience: 'auto' computes opens_at = term.end - 30d, closes_at = term.end + 7d */
  preset:         z.enum(['auto']).optional(),
});
