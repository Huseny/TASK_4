import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Project } from '../db/models/projectModel';
import { UserRole } from '../db/models/userModel';
import { errors } from '../shared/errors';
import type { AuthenticatedRequest } from '../shared/types';

export type ProjectAccessLevel = 'read' | 'write' | 'admin';

/**
 * Middleware factory that validates the caller has at least the given
 * access level on `req.params.projectId`.
 *
 * Access rules:
 *  - ADMIN: always granted.
 *  - MAINTAINER: granted if in maintainerUserIds (write+read) or developerUserIds (read).
 *  - DEVELOPER: read granted if in developerUserIds or maintainerUserIds; write denied.
 */
export function requireProjectAccess(level: ProjectAccessLevel) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const auth = (req as AuthenticatedRequest).auth!;
      if (auth.role === UserRole.ADMIN) return next();

      const projectId = req.params.projectId;
      if (!mongoose.Types.ObjectId.isValid(projectId)) return next(errors.projectNotFound());
      const project = await Project.findById(projectId).lean();
      if (!project) return next(errors.projectNotFound());

      const userId = auth.userId;
      const isMaintainer = project.maintainerUserIds?.some((id) => String(id) === userId);
      const isDeveloper = project.developerUserIds?.some((id) => String(id) === userId);
      const isMember = isMaintainer || isDeveloper;

      if (!isMember) return next(errors.projectAccessDenied());

      if (level === 'write' && !isMaintainer) {
        return next(errors.forbidden());
      }
      if (level === 'admin') {
        return next(errors.forbidden());
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
