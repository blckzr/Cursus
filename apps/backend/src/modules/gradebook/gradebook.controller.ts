import { Request, Response, NextFunction } from 'express';
import {
  createCategorySchema, updateCategorySchema,
  createAssessmentSchema, updateAssessmentSchema,
  bulkScoreSchema, finalizeSchema,
} from './gradebook.schema';
import * as svc from './gradebook.service';
import { renderCorPdf } from '../../lib/pdf/cor';
import { buildScheduleIcs } from '../../lib/ics/schedule';

export async function getGradebook(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.getGradebook(req.params.id);
    if (!data) { res.status(404).json({ error: 'Section not found' }); return; }
    res.json(data);
  } catch (e) { next(e); }
}

export async function createCategory(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await svc.createCategory(req.params.id, createCategorySchema.parse(req.body)));
  } catch (e) { next(e); }
}

export async function updateCategory(req: Request, res: Response, next: NextFunction) {
  try {
    const cat = await svc.updateCategory(req.params.categoryId, updateCategorySchema.parse(req.body));
    if (!cat) { res.status(404).json({ error: 'Category not found' }); return; }
    res.json(cat);
  } catch (e) { next(e); }
}

export async function deleteCategory(req: Request, res: Response, next: NextFunction) {
  try {
    await svc.deleteCategory(req.params.categoryId);
    res.status(204).send();
  } catch (e) { next(e); }
}

export async function createAssessment(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await svc.createAssessment(createAssessmentSchema.parse(req.body)));
  } catch (e) { next(e); }
}

export async function updateAssessment(req: Request, res: Response, next: NextFunction) {
  try {
    const a = await svc.updateAssessment(req.params.assessmentId, updateAssessmentSchema.parse(req.body));
    if (!a) { res.status(404).json({ error: 'Assessment not found' }); return; }
    res.json(a);
  } catch (e) { next(e); }
}

export async function deleteAssessment(req: Request, res: Response, next: NextFunction) {
  try {
    await svc.deleteAssessment(req.params.assessmentId);
    res.status(204).send();
  } catch (e) { next(e); }
}

export async function bulkSaveScores(req: Request, res: Response, next: NextFunction) {
  try {
    const { scores } = bulkScoreSchema.parse(req.body);
    await svc.bulkSaveScores(scores, req.user!.sub);
    res.json({ saved: scores.length });
  } catch (e) { next(e); }
}

export async function finalizeGrades(req: Request, res: Response, next: NextFunction) {
  try {
    const { grades } = finalizeSchema.parse(req.body);
    const results = await svc.finalizeGrades(req.params.id, grades ?? [], req.user!.sub);
    res.json({ finalized: results.length, grades: results });
  } catch (e: unknown) {
    if (e instanceof Error && 'status' in e) {
      res.status((e as NodeJS.ErrnoException & { status: number }).status).json({ error: e.message });
      return;
    }
    next(e);
  }
}

export async function exportCsv(req: Request, res: Response, next: NextFunction) {
  try {
    const csv = await svc.exportGradebookCsv(req.params.id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="gradebook-${req.params.id}.csv"`);
    res.send(csv);
  } catch (e) { next(e); }
}

export async function getStudentGrades(req: Request, res: Response, next: NextFunction) {
  try {
    // Students can only view their own grades
    if (req.user!.role === 'student' && req.user!.sub !== req.params.studentId) {
      res.status(403).json({ error: 'Access denied' }); return;
    }
    res.json(await svc.getStudentGrades(req.params.studentId));
  } catch (e) { next(e); }
}

export async function exportTranscript(req: Request, res: Response, next: NextFunction) {
  try {
    const { csv, studentCode } = await svc.exportTranscriptCsv(req.user!.sub);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="transcript-${studentCode}.csv"`);
    res.send(csv);
  } catch (e) { next(e); }
}

/**
 * GET /students/me/cor  — returns the Certificate of Registration as a PDF.
 * 404 when the student has no enrollments in the active term so the UI can
 * show a useful empty state ("wait until the registrar opens the term").
 */
export async function getCor(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.getCorData(req.user!.sub);
    if (!data) {
      res.status(404).json({ error: 'No active registration. Wait until the registrar opens the term.' });
      return;
    }
    res.json(data);
  } catch (e) { next(e); }
}

export async function downloadCor(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.getCorData(req.user!.sub);
    if (!data) {
      res.status(404).json({ error: 'No active registration. Wait until the registrar opens the term.' });
      return;
    }
    const pdf = await renderCorPdf(data);
    const code = data.student.user_code ?? 'student';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="COR-${code}.pdf"`);
    res.send(pdf);
  } catch (e) { next(e); }
}

/**
 * GET /terms/:id/tba-auto-pass-preview (admin) — counts the sections/students
 * that would be affected if the auto-pass action ran now.
 */
export async function previewTbaAutoPass(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await svc.previewTbaAutoPass(req.params.id));
  } catch (e: unknown) {
    if (e instanceof Error && 'status' in e) {
      const err = e as Error & { status: number };
      res.status(err.status).json({ error: err.message });
      return;
    }
    next(e);
  }
}

/**
 * POST /terms/:id/tba-auto-pass (admin) — give every still-enrolled student
 * in every TBA section a 1.00 final grade. Reason recorded per enrollment in
 * the audit log; notifications fan out to students.
 */
export async function autoPassTbaSections(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await svc.autoPassTbaSections(req.params.id, req.user!.sub));
  } catch (e: unknown) {
    if (e instanceof Error && 'status' in e) {
      const err = e as Error & { status: number };
      res.status(err.status).json({ error: err.message });
      return;
    }
    next(e);
  }
}

/**
 * GET /students/me/pending-enrollment — returns the pending sections so the
 * COR page can render the "confirm enrollment" banner + modal. 204 when
 * there's nothing to confirm.
 */
export async function getPendingEnrollment(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.getPendingEnrollment(req.user!.sub);
    if (!data) { res.status(204).send(); return; }
    res.json(data);
  } catch (e) { next(e); }
}

/**
 * POST /students/me/confirm-enrollment — flips pending → enrolled for the
 * active term. Returns `{ confirmed, termName }`.
 */
export async function confirmEnrollment(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await svc.confirmEnrollment(req.user!.sub));
  } catch (e: unknown) {
    if (e instanceof Error && 'status' in e) {
      const err = e as Error & { status: number };
      res.status(err.status).json({ error: err.message });
      return;
    }
    next(e);
  }
}

/**
 * GET /students/me/schedule.ics — returns the student's active-term schedule
 * as an iCalendar feed (RFC 5545). Google Calendar, Apple Calendar, and
 * Outlook all consume this format directly on import.
 */
export async function downloadScheduleIcs(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.getActiveSchedule(req.user!.sub);
    if (!data) {
      res.status(404).json({ error: 'No active schedule. Wait until the registrar opens the term.' });
      return;
    }
    const ics = buildScheduleIcs({
      studentCode: data.student.code,
      studentName: data.student.fullName,
      termName:    data.term.name,
      termStart:   new Date(data.term.startDate),
      termEnd:     new Date(data.term.endDate),
      enrollments: data.enrollments.map((e: {
        enrollment_id: string; section_code: string;
        day_of_week: string | null; start_time: string | null; end_time: string | null;
        room: string | null;
        course_code: string; course_title: string; faculty_name: string | null;
      }) => ({
        enrollmentId: e.enrollment_id,
        courseCode:   e.course_code,
        courseTitle:  e.course_title,
        sectionCode:  e.section_code,
        dayOfWeek:    e.day_of_week,
        startTime:    e.start_time,
        endTime:      e.end_time,
        room:         e.room,
        facultyName:  e.faculty_name,
      })),
    });
    const code = data.student.code ?? 'student';
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="schedule-${code}.ics"`);
    res.send(ics);
  } catch (e) { next(e); }
}

export async function getRoster(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.getRoster(req.params.id);
    if (!data) { res.status(404).json({ error: 'Section not found' }); return; }
    res.json(data);
  } catch (e) { next(e); }
}

export async function exportRosterCsv(req: Request, res: Response, next: NextFunction) {
  try {
    const { csv, sectionCode } = await svc.exportRosterCsv(req.params.id);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="roster-${sectionCode.replace(/\s+/g, '_')}.csv"`);
    res.send(csv);
  } catch (e) { next(e); }
}
