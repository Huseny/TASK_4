import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePasswordChanged } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/rbac';
import { rateLimit } from '../middleware/rateLimit';
import { csrfVerify } from '../middleware/csrf';
import { validate } from '../middleware/validate';
import { idempotency } from '../middleware/idempotency';
import { createUserBodySchema, updateRoleBodySchema, resetPasswordBodySchema } from './usersSchemas';
import {
  listUsersHandler,
  createUserHandler,
  getUserHandler,
  updateRoleHandler,
  resetPasswordHandler,
  deactivateUserHandler,
  deleteUserHandler,
} from './usersController';

export const usersRouter = Router();

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format');
const userIdParamsSchema = z.object({ userId: objectIdSchema });

usersRouter.use(authenticate, requireAdmin, requirePasswordChanged, rateLimit);

usersRouter.get('/', listUsersHandler);
usersRouter.post('/', csrfVerify, idempotency('POST:/api/users'), validate({ body: createUserBodySchema }), createUserHandler);
usersRouter.get('/:userId', validate({ params: userIdParamsSchema }), getUserHandler);
usersRouter.patch(
  '/:userId/role',
  csrfVerify,
  idempotency('PATCH:/api/users/:userId/role'),
  validate({ params: userIdParamsSchema, body: updateRoleBodySchema }),
  updateRoleHandler,
);
usersRouter.post(
  '/:userId/reset-password',
  csrfVerify,
  idempotency('POST:/api/users/:userId/reset-password'),
  validate({ params: userIdParamsSchema, body: resetPasswordBodySchema }),
  resetPasswordHandler,
);
usersRouter.post(
  '/:userId/deactivate',
  csrfVerify,
  idempotency('POST:/api/users/:userId/deactivate'),
  validate({ params: userIdParamsSchema }),
  deactivateUserHandler,
);
usersRouter.delete(
  '/:userId',
  csrfVerify,
  idempotency('DELETE:/api/users/:userId'),
  validate({ params: userIdParamsSchema }),
  deleteUserHandler,
);
