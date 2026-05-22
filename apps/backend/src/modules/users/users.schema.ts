import { z } from 'zod';

export const createUserSchema = z.object({
  email:     z.string().email(),
  password:  z.string().min(8, 'Password must be at least 8 characters'),
  fullName:  z.string().min(1),
  role:      z.enum(['admin', 'faculty', 'student']),
  branch:    z.string().min(1).max(10).optional(),
  programId: z.string().uuid().optional(),
}).refine(
  d => d.role !== 'student' || !!d.programId,
  { message: 'A program must be selected for students', path: ['programId'] },
);

export const updateUserSchema = z.object({
  fullName:  z.string().min(1).optional(),
  isActive:  z.boolean().optional(),
  password:  z.string().min(8).optional(),
  branch:    z.string().min(1).max(10).optional(),
  programId: z.string().uuid().optional(),
});
