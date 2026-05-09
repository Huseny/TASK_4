import type { Request, Response, NextFunction } from 'express';
import { nanoid } from 'nanoid';
import type { AuthenticatedRequest } from '../shared/types';

/**
 * Generates a short request id, attaches it to `req.requestId`, and echoes
 * it as the `X-Request-Id` response header so logs and clients agree.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const id = 'req_' + nanoid(16);
  (req as AuthenticatedRequest).requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}
