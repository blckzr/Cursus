import { z } from 'zod';

export const createAppealSchema = z.object({
  enrollmentId: z.string().uuid(),
  reason:       z.string().min(20, 'Please describe your reason in at least 20 characters').max(2000),
});

/** Faculty picks up a pending appeal. */
export const acceptAppealSchema = z.object({
  facultyNote: z.string().max(2000).optional(),
});

/** Faculty resolves (denies or changes grade). */
export const facultyResolveSchema = z.object({
  outcome:         z.enum(['grade_changed', 'denied']),
  facultyNote:     z.string().min(10, 'Add a short justification').max(2000),
  resolvedGrade:   z.string().max(10).optional(),                      // e.g. '1.75'
  resolvedNumeric: z.coerce.number().min(0).max(100).optional(),
}).refine(
  d => d.outcome !== 'grade_changed' || (!!d.resolvedGrade && d.resolvedNumeric != null),
  { message: 'Provide both the new letter and numeric grade when changing the grade', path: ['resolvedGrade'] },
);

/** Faculty escalates to admin/dean review. */
export const escalateSchema = z.object({
  facultyNote: z.string().min(10, 'Add a short note for the dean').max(2000),
});

/** Admin (acting as dean) resolves a dean-review appeal. */
export const deanResolveSchema = z.object({
  outcome:         z.enum(['grade_changed', 'denied']),
  deanNote:        z.string().min(10).max(2000),
  resolvedGrade:   z.string().max(10).optional(),
  resolvedNumeric: z.coerce.number().min(0).max(100).optional(),
}).refine(
  d => d.outcome !== 'grade_changed' || (!!d.resolvedGrade && d.resolvedNumeric != null),
  { message: 'Provide both the new letter and numeric grade when changing the grade', path: ['resolvedGrade'] },
);

export const listSchema = z.object({
  status: z.string().optional(),
});
