import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction,
): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation error', details: err.flatten() });
    return;
  }

  if (err instanceof Error) {
    // Service-layer errors may carry an HTTP status (e.g. 404 / 409)
    const status = (err as Error & { status?: number }).status;
    if (typeof status === 'number') {
      res.status(status).json({ error: err.message });
      return;
    }
    console.error(`[error] ${req.method} ${req.path}:`, err.message);
    res.status(500).json({ error: 'Internal server error' });
    return;
  }

  res.status(500).json({ error: 'Unknown error' });
}
