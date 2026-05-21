import { Request, Response, NextFunction } from 'express';
import { db } from '../config/db';

/** Allows admin through unconditionally.
 *  For faculty, verifies they are assigned to the section in :id or :sectionId. */
export async function requireSectionOwner(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (req.user!.role === 'admin') { next(); return; }

  const sectionId = req.params.id ?? req.params.sectionId;
  const { rows } = await db.query(
    'SELECT faculty_id FROM sections WHERE id = $1',
    [sectionId],
  );

  if (!rows[0]) { res.status(404).json({ error: 'Section not found' }); return; }
  if (rows[0].faculty_id !== req.user!.sub) {
    res.status(403).json({ error: 'You are not assigned to this section' });
    return;
  }
  next();
}
