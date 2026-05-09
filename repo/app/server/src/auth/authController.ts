import type { Request, Response, NextFunction } from 'express';
import { User, UserStatus } from '../db/models/userModel';
import { errors } from '../shared/errors';
import { toUserDto } from '../shared/dto';
import {
  isCurrentlyLocked,
  registerFailedLogin,
  registerSuccessfulLogin,
  releaseLockIfExpired,
  retryAfterSeconds,
} from './lockoutService';
import { hashPassword, verifyPassword } from './passwordService';
import {
  createSession,
  findActiveSession,
  revokeAllSessionsForUser,
  revokeSession,
  rotateSession,
} from './sessionService';
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from './cookieService';
import { verifyRefreshToken, hashRefreshToken } from './tokenService';
import { Session } from '../db/models/sessionModel';
import { writeAudit } from '../audit/auditService';
import { AuditActionType, AuditOutcome, AuditResourceType } from '../db/models/auditEventModel';
import type { AuthenticatedRequest } from '../shared/types';

export async function loginHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { username, password } = req.body as { username: string; password: string };
    const user = await User.findOne({ username });
    const requestId = (req as AuthenticatedRequest).requestId ?? null;

    if (!user) {
      await writeAudit({
        actionType: AuditActionType.AUTH_LOGIN_FAILURE,
        resourceType: AuditResourceType.USER,
        outcome: AuditOutcome.FAILURE,
        actorUsername: username,
        metadata: { reason: 'unknown-user' },
        requestId,
      });
      return next(errors.invalidCredentials());
    }

    if (user.status === UserStatus.DEACTIVATED || user.status === UserStatus.DELETED) {
      await writeAudit({
        actionType: AuditActionType.AUTH_LOGIN_FAILURE,
        resourceType: AuditResourceType.USER,
        resourceId: String(user._id),
        outcome: AuditOutcome.FAILURE,
        actorUserId: String(user._id),
        actorUsername: user.username,
        metadata: { reason: 'deactivated' },
        requestId,
      });
      return next(errors.accountDeactivated());
    }

    await releaseLockIfExpired(user._id);
    const fresh = await User.findById(user._id);
    if (!fresh) return next(errors.invalidCredentials());

    if (isCurrentlyLocked(fresh)) {
      await writeAudit({
        actionType: AuditActionType.AUTH_LOGIN_FAILURE,
        resourceType: AuditResourceType.USER,
        resourceId: String(fresh._id),
        outcome: AuditOutcome.FAILURE,
        actorUserId: String(fresh._id),
        actorUsername: fresh.username,
        metadata: { reason: 'locked' },
        requestId,
      });
      return next(errors.accountLocked(retryAfterSeconds(fresh)));
    }

    const ok = await verifyPassword(password, fresh.passwordHash);
    if (!ok) {
      await registerFailedLogin(fresh._id);
      await writeAudit({
        actionType: AuditActionType.AUTH_LOGIN_FAILURE,
        resourceType: AuditResourceType.USER,
        resourceId: String(fresh._id),
        outcome: AuditOutcome.FAILURE,
        actorUserId: String(fresh._id),
        actorUsername: fresh.username,
        metadata: { reason: 'bad-password' },
        requestId,
      });
      // Re-check for lockout that may have been triggered by this attempt.
      const after = await User.findById(fresh._id).lean();
      if (after && isCurrentlyLocked(after)) {
        return next(errors.accountLocked(retryAfterSeconds(after)));
      }
      return next(errors.invalidCredentials());
    }

    await registerSuccessfulLogin(fresh._id);
    const issued = await createSession({
      userId: String(fresh._id),
      role: fresh.role,
      ipAddress: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
    });
    setAuthCookies(res, issued);
    await writeAudit({
      actionType: AuditActionType.AUTH_LOGIN_SUCCESS,
      resourceType: AuditResourceType.USER,
      resourceId: String(fresh._id),
      actorUserId: String(fresh._id),
      actorUsername: fresh.username,
      outcome: AuditOutcome.SUCCESS,
      metadata: { sessionId: issued.sessionId },
      requestId,
    });
    res.status(200).json({ user: toUserDto(fresh) });
  } catch (err) {
    next(err);
  }
}

export async function refreshHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cookieValue = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    const requestId = (req as AuthenticatedRequest).requestId ?? null;
    if (!cookieValue) return next(errors.refreshInvalid());
    let payload;
    try {
      payload = verifyRefreshToken(cookieValue);
    } catch {
      return next(errors.refreshInvalid());
    }
    const session = await findActiveSession(payload.sid);
    if (!session) return next(errors.refreshInvalid());
    if (session.refreshTokenHash !== hashRefreshToken(cookieValue)) {
      // Token reuse or rotation detected — revoke for safety.
      await revokeSession(payload.sid);
      return next(errors.refreshInvalid());
    }
    const user = await User.findById(payload.sub);
    if (!user) return next(errors.refreshInvalid());
    if (user.status === UserStatus.DEACTIVATED || user.status === UserStatus.DELETED) {
      return next(errors.accountDeactivated());
    }
    const issued = await rotateSession(payload.sid, String(user._id), user.role);
    if (!issued) return next(errors.refreshInvalid());
    setAuthCookies(res, issued);
    await writeAudit({
      actionType: AuditActionType.AUTH_REFRESH,
      resourceType: AuditResourceType.SESSION,
      resourceId: payload.sid,
      actorUserId: String(user._id),
      actorUsername: user.username,
      requestId,
    });
    res.status(200).json({ user: toUserDto(user) });
  } catch (err) {
    next(err);
  }
}

export async function logoutHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = (req as AuthenticatedRequest).auth;
    if (auth) {
      await revokeSession(auth.sessionId);
      await writeAudit({
        actionType: AuditActionType.AUTH_LOGOUT,
        resourceType: AuditResourceType.SESSION,
        resourceId: auth.sessionId,
        actorUserId: auth.userId,
        actorUsername: auth.username,
        requestId: (req as AuthenticatedRequest).requestId ?? null,
      });
    }
    clearAuthCookies(res);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function meHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) return next(errors.sessionInvalid());
    const user = await User.findById(auth.userId);
    if (!user) return next(errors.sessionInvalid());
    res.status(200).json({ user: toUserDto(user) });
  } catch (err) {
    next(err);
  }
}

export async function changePasswordHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) return next(errors.sessionInvalid());
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
    const user = await User.findById(auth.userId);
    if (!user) return next(errors.sessionInvalid());
    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) return next(errors.invalidCredentials());
    user.passwordHash = await hashPassword(newPassword);
    user.mustChangePassword = false;
    await user.save();
    // Rotate out sessions other than this one so the new password takes effect everywhere.
    await Session.updateMany(
      { userId: user._id, _id: { $ne: auth.sessionId }, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    await writeAudit({
      actionType: AuditActionType.AUTH_PASSWORD_CHANGED,
      resourceType: AuditResourceType.USER,
      resourceId: String(user._id),
      actorUserId: String(user._id),
      actorUsername: user.username,
      requestId: (req as AuthenticatedRequest).requestId ?? null,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export { revokeAllSessionsForUser };
