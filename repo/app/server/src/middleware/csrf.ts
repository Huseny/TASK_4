import type { Request, Response, NextFunction } from 'express';
import { errors } from '../shared/errors';
import type { AuthenticatedRequest } from '../shared/types';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF verification. State-changing requests must carry an
 * `X-CSRF-Token` header that exactly matches the per-session token
 * stored server-side in `sessions.csrfToken` (mirrored to the readable
 * `ms_csrf` cookie).
 *
 * The login route is exempt because there is no session yet.
 */
export function csrfVerify(req: Request, _res: Response, next: NextFunction): void {
  if (!UNSAFE_METHODS.has(req.method)) return next();
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) {
    // Authentication middleware already rejected; do not double-error.
    return next();
  }
  const provided = req.get('X-CSRF-Token');
  if (!provided || provided !== auth.csrfToken) return next(errors.csrfInvalid());
  next();
}
