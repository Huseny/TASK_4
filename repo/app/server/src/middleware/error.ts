import type { Request, Response, NextFunction } from 'express';
import { AppError, ErrorCode, errors } from '../shared/errors';
import { logger } from '../shared/logger';
import type { AuthenticatedRequest } from '../shared/types';

/**
 * Centralized error middleware. Converts thrown errors into the canonical
 * envelope defined in `docs/api-contract.md` §1.
 */
export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const requestId = (req as AuthenticatedRequest).requestId ?? null;
  let app: AppError;
  if (err instanceof AppError) {
    app = err;
  } else if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'ValidationError') {
    app = errors.validation({ message: (err as Error).message });
  } else {
    logger().error({ err, requestId }, 'unhandled error');
    app = errors.internal();
  }
  if (app.code === ErrorCode.RATE_LIMITED) {
    const retry = (app.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds ?? 1;
    res.setHeader('Retry-After', String(retry));
  }
  res.status(app.status).json({
    error: {
      code: app.code,
      message: app.message,
      details: app.details ?? null,
      requestId,
    },
  });
}

export function notFoundMiddleware(req: Request, res: Response): void {
  const requestId = (req as AuthenticatedRequest).requestId ?? null;
  res.status(404).json({
    error: {
      code: ErrorCode.NOT_FOUND,
      message: 'Route not found.',
      details: { path: req.path, method: req.method },
      requestId,
    },
  });
}
