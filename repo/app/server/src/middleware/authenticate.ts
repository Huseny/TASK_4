import type { Request, Response, NextFunction } from 'express';
import { ACCESS_COOKIE } from '../auth/cookieService';
import { verifyAccessToken } from '../auth/tokenService';
import { findActiveSession, touchSession } from '../auth/sessionService';
import { User, UserStatus } from '../db/models/userModel';
import { errors } from '../shared/errors';
import type { AuthContext, AuthenticatedRequest } from '../shared/types';

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const cookieValue = (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE];
    if (!cookieValue) return next(errors.sessionInvalid());
    let payload;
    try {
      payload = verifyAccessToken(cookieValue);
    } catch {
      return next(errors.sessionInvalid());
    }
    const session = await findActiveSession(payload.sid);
    if (!session) return next(errors.sessionInvalid());
    const user = await User.findById(payload.sub).lean();
    if (!user) return next(errors.sessionInvalid());
    if (user.status === UserStatus.DEACTIVATED || user.status === UserStatus.DELETED) {
      return next(errors.accountDeactivated());
    }
    if (user.status === UserStatus.LOCKED && user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      return next(errors.accountDeactivated());
    }
    const ctx: AuthContext = {
      userId: String(user._id),
      username: user.username,
      role: user.role,
      sessionId: session._id,
      csrfToken: session.csrfToken,
      mustChangePassword: !!user.mustChangePassword,
    };
    (req as AuthenticatedRequest).auth = ctx;
    void touchSession(session._id);
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!(req as AuthenticatedRequest).auth) return next(errors.sessionInvalid());
  next();
}

export function requirePasswordChanged(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const auth = (req as AuthenticatedRequest).auth;
  if (auth?.mustChangePassword) {
    return next(errors.mustChangePassword());
  }
  next();
}
