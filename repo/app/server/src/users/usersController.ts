import type { Request, Response, NextFunction } from 'express';
import { User, UserStatus, UserRole } from '../db/models/userModel';
import { Session } from '../db/models/sessionModel';
import { hashPassword } from '../auth/passwordService';
import { errors } from '../shared/errors';
import { toUserDto } from '../shared/dto';
import { writeAudit } from '../audit/auditService';
import { AuditActionType, AuditResourceType } from '../db/models/auditEventModel';
import type { AuthenticatedRequest } from '../shared/types';

export async function listUsersHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const users = await User.find({ status: { $ne: UserStatus.DELETED } }).sort({ createdAt: -1 }).lean();
    res.json({ users: users.map(toUserDto) });
  } catch (err) {
    next(err);
  }
}

export async function createUserHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = (req as AuthenticatedRequest).auth!;
    const { username, displayName, role, password } = req.body as {
      username: string; displayName: string; role: string; password: string;
    };
    const existing = await User.findOne({ username });
    if (existing) return next(errors.userConflict(`Username '${username}' is already taken.`));
    const passwordHash = await hashPassword(password);
    const user = await User.create({ username, displayName, role, passwordHash });
    await writeAudit({
      actionType: AuditActionType.USER_CREATE,
      resourceType: AuditResourceType.USER,
      resourceId: String(user._id),
      actorUserId: auth.userId,
      actorUsername: auth.username,
      requestId: (req as AuthenticatedRequest).requestId ?? null,
    });
    res.status(201).json({ user: toUserDto(user) });
  } catch (err) {
    next(err);
  }
}

export async function getUserHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await User.findOne({ _id: req.params.userId, status: { $ne: UserStatus.DELETED } });
    if (!user) return next(errors.userNotFound());
    res.json({ user: toUserDto(user) });
  } catch (err) {
    next(err);
  }
}

export async function updateRoleHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = (req as AuthenticatedRequest).auth!;
    const { role } = req.body as { role: string };
    const user = await User.findOne({ _id: req.params.userId, status: { $ne: UserStatus.DELETED } });
    if (!user) return next(errors.userNotFound());
    if (String(user._id) === auth.userId && role !== UserRole.ADMIN) {
      return next(errors.conflict('Cannot demote your own admin account.'));
    }
    user.role = role as typeof UserRole[keyof typeof UserRole];
    await user.save();
    await writeAudit({
      actionType: AuditActionType.USER_ROLE_ASSIGN,
      resourceType: AuditResourceType.USER,
      resourceId: String(user._id),
      actorUserId: auth.userId,
      actorUsername: auth.username,
      metadata: { newRole: role },
      requestId: (req as AuthenticatedRequest).requestId ?? null,
    });
    res.json({ user: toUserDto(user) });
  } catch (err) {
    next(err);
  }
}

export async function resetPasswordHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = (req as AuthenticatedRequest).auth!;
    const { newPassword } = req.body as { newPassword: string };
    const user = await User.findOne({ _id: req.params.userId, status: { $ne: UserStatus.DELETED } });
    if (!user) return next(errors.userNotFound());
    user.passwordHash = await hashPassword(newPassword);
    user.mustChangePassword = true;
    await user.save();
    // Revoke all sessions so the user must log in fresh
    await Session.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    await writeAudit({
      actionType: AuditActionType.USER_PASSWORD_RESET,
      resourceType: AuditResourceType.USER,
      resourceId: String(user._id),
      actorUserId: auth.userId,
      actorUsername: auth.username,
      requestId: (req as AuthenticatedRequest).requestId ?? null,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function deactivateUserHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = (req as AuthenticatedRequest).auth!;
    const user = await User.findOne({ _id: req.params.userId, status: { $ne: UserStatus.DELETED } });
    if (!user) return next(errors.userNotFound());
    if (String(user._id) === auth.userId) {
      return next(errors.conflict('Cannot deactivate your own account.'));
    }
    user.status = UserStatus.DEACTIVATED;
    await user.save();
    await Session.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    await writeAudit({
      actionType: AuditActionType.USER_DEACTIVATE,
      resourceType: AuditResourceType.USER,
      resourceId: String(user._id),
      actorUserId: auth.userId,
      actorUsername: auth.username,
      requestId: (req as AuthenticatedRequest).requestId ?? null,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function deleteUserHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = (req as AuthenticatedRequest).auth!;
    const user = await User.findOne({ _id: req.params.userId, status: { $ne: UserStatus.DELETED } });
    if (!user) return next(errors.userNotFound());
    if (String(user._id) === auth.userId) {
      return next(errors.conflict('Cannot delete your own account.'));
    }
    user.status = UserStatus.DELETED;
    user.deletedAt = new Date();
    await user.save();
    await Session.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    await writeAudit({
      actionType: AuditActionType.USER_DELETE,
      resourceType: AuditResourceType.USER,
      resourceId: String(user._id),
      actorUserId: auth.userId,
      actorUsername: auth.username,
      requestId: (req as AuthenticatedRequest).requestId ?? null,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
