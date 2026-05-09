import type { Request, Response, NextFunction } from 'express';
import { UserRole, type UserRoleType } from '../db/models/userModel';
import { errors } from '../shared/errors';
import type { AuthenticatedRequest } from '../shared/types';

/**
 * Route-level RBAC. Each protected route declares its minimum required
 * role(s). Object-level authorization (project scope) lives in
 * `middleware/projectScope.ts` and runs AFTER this.
 */
export function requireRole(...allowed: UserRoleType[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) return next(errors.sessionInvalid());
    if (!allowed.includes(auth.role)) return next(errors.forbidden());
    next();
  };
}

export const requireAdmin = requireRole(UserRole.ADMIN);
export const requireMaintainerOrAdmin = requireRole(UserRole.ADMIN, UserRole.MAINTAINER);
export const requireAnyRole = requireRole(UserRole.ADMIN, UserRole.MAINTAINER, UserRole.DEVELOPER);
