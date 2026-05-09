import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePasswordChanged } from '../middleware/authenticate';
import { requireAdmin, requireMaintainerOrAdmin } from '../middleware/rbac';
import { rateLimit } from '../middleware/rateLimit';
import { csrfVerify } from '../middleware/csrf';
import { validate } from '../middleware/validate';
import { idempotency } from '../middleware/idempotency';
import { requireProjectAccess } from './projectScope';
import {
  createProjectBodySchema,
  updateProjectBodySchema,
  createTrackedBranchBodySchema,
  updateTrackedBranchBodySchema,
} from './projectsSchemas';
import {
  listProjectsHandler,
  createProjectHandler,
  getProjectHandler,
  updateProjectHandler,
  getProjectMembersHandler,
  listTrackedBranchesHandler,
  createTrackedBranchHandler,
  updateTrackedBranchHandler,
  deleteTrackedBranchHandler,
} from './projectsController';

export const projectsRouter = Router();

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format');
const projectIdParamsSchema = z.object({ projectId: objectIdSchema });
const branchParamsSchema = z.object({ projectId: objectIdSchema, branchId: objectIdSchema });

projectsRouter.use(authenticate, requirePasswordChanged, rateLimit);

projectsRouter.get('/', listProjectsHandler);
projectsRouter.post(
  '/',
  requireAdmin,
  csrfVerify,
  idempotency('POST:/api/projects'),
  validate({ body: createProjectBodySchema }),
  createProjectHandler,
);
projectsRouter.get('/:projectId', requireProjectAccess('read'), validate({ params: projectIdParamsSchema }), getProjectHandler);
projectsRouter.patch(
  '/:projectId',
  requireMaintainerOrAdmin,
  requireProjectAccess('write'),
  csrfVerify,
  idempotency('PATCH:/api/projects/:projectId'),
  validate({ params: projectIdParamsSchema, body: updateProjectBodySchema }),
  updateProjectHandler,
);

projectsRouter.get('/:projectId/members', requireProjectAccess('read'), validate({ params: projectIdParamsSchema }), getProjectMembersHandler);
projectsRouter.get('/:projectId/branches', requireProjectAccess('read'), validate({ params: projectIdParamsSchema }), listTrackedBranchesHandler);
projectsRouter.post(
  '/:projectId/branches',
  requireMaintainerOrAdmin,
  requireProjectAccess('write'),
  csrfVerify,
  idempotency('POST:/api/projects/:projectId/branches'),
  validate({ params: projectIdParamsSchema, body: createTrackedBranchBodySchema }),
  createTrackedBranchHandler,
);
projectsRouter.patch(
  '/:projectId/branches/:branchId',
  requireMaintainerOrAdmin,
  requireProjectAccess('write'),
  csrfVerify,
  idempotency('PATCH:/api/projects/:projectId/branches/:branchId'),
  validate({ params: branchParamsSchema, body: updateTrackedBranchBodySchema }),
  updateTrackedBranchHandler,
);
projectsRouter.delete(
  '/:projectId/branches/:branchId',
  requireMaintainerOrAdmin,
  requireProjectAccess('write'),
  csrfVerify,
  idempotency('DELETE:/api/projects/:projectId/branches/:branchId'),
  validate({ params: branchParamsSchema }),
  deleteTrackedBranchHandler,
);
