import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePasswordChanged } from '../middleware/authenticate';
import { requireMaintainerOrAdmin } from '../middleware/rbac';
import { requireProjectAccess } from '../projects/projectScope';
import { rateLimit } from '../middleware/rateLimit';
import { csrfVerify } from '../middleware/csrf';
import { validate } from '../middleware/validate';
import { idempotency } from '../middleware/idempotency';
import {
  triggerRunHandler,
  listRunsHandler,
  getRunHandler,
  cancelRunHandler,
  getDashboardHandler,
} from './pipelineController';

export const pipelineRouter = Router();

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format');
const projectIdParamsSchema = z.object({ projectId: objectIdSchema });
const runParamsSchema = z.object({ projectId: objectIdSchema, runId: objectIdSchema });
const gitRefRegex = /^[A-Za-z0-9_][A-Za-z0-9._/\-]*$/;
const triggerBodySchema = z.object({ sourceBranch: z.string().min(1).max(256).regex(gitRefRegex, 'Invalid branch name') }).strict();

pipelineRouter.use(authenticate, requirePasswordChanged, rateLimit);

pipelineRouter.get('/dashboard', getDashboardHandler);

pipelineRouter.post(
  '/projects/:projectId/runs',
  requireProjectAccess('read'),
  csrfVerify,
  idempotency('POST:/api/pipeline/projects/:projectId/runs'),
  validate({ params: projectIdParamsSchema, body: triggerBodySchema }),
  triggerRunHandler,
);
pipelineRouter.get('/projects/:projectId/runs', requireProjectAccess('read'), validate({ params: projectIdParamsSchema }), listRunsHandler);
pipelineRouter.get('/projects/:projectId/runs/:runId', requireProjectAccess('read'), validate({ params: runParamsSchema }), getRunHandler);
pipelineRouter.post(
  '/projects/:projectId/runs/:runId/cancel',
  requireMaintainerOrAdmin,
  requireProjectAccess('write'),
  csrfVerify,
  idempotency('POST:/api/pipeline/projects/:projectId/runs/:runId/cancel'),
  validate({ params: runParamsSchema }),
  cancelRunHandler,
);
