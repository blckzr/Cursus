import { z } from 'zod';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const meetingSchema = z.object({
  dayOfWeek: z.enum(['Mon','Tue','Wed','Thu','Fri','Sat','Sun']),
  startTime: z.string().regex(HHMM, 'Must be HH:MM'),
  endTime:   z.string().regex(HHMM, 'Must be HH:MM'),
});

const meetingsSchema = z.array(meetingSchema).max(2, 'A section can have at most 2 meetings per week.');

// Block + course + term are immutable once a section exists.
// section_code is derived (block_label + course code) by the service.
// faculty_id is optional — the bulk "Open Term" creates TBA sections.
export const createSectionSchema = z.object({
  blockId:    z.string().uuid(),
  courseId:   z.string().uuid(),
  termId:     z.string().uuid(),
  facultyId:  z.string().uuid().optional(),
  meetings:   meetingsSchema.optional(),
  room:       z.string().optional(),
  capacity:   z.number().int().positive().optional(),
});

// Only faculty + meetings + room/capacity are editable post-creation.
export const updateSectionSchema = z.object({
  facultyId: z.string().uuid().nullable().optional(),
  meetings:  meetingsSchema.optional(),
  room:      z.string().nullable().optional(),
  capacity:  z.number().int().positive().optional(),
});
