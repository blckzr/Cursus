import { z } from 'zod';

// Block + course + term are immutable once a section exists.
// section_code is derived (block_label + course code) by the service.
// faculty_id is optional — the bulk "Open Term" creates TBA sections.
export const createSectionSchema = z.object({
  blockId:    z.string().uuid(),
  courseId:   z.string().uuid(),
  termId:     z.string().uuid(),
  facultyId:  z.string().uuid().optional(),
  dayOfWeek:  z.string().optional(),
  startTime:  z.string().optional(),
  endTime:    z.string().optional(),
  room:       z.string().optional(),
  capacity:   z.number().int().positive().optional(),
});

// Only faculty + schedule fields are editable post-creation.
export const updateSectionSchema = z.object({
  facultyId: z.string().uuid().nullable().optional(),
  dayOfWeek: z.string().nullable().optional(),
  startTime: z.string().nullable().optional(),
  endTime:   z.string().nullable().optional(),
  room:      z.string().nullable().optional(),
  capacity:  z.number().int().positive().optional(),
});
