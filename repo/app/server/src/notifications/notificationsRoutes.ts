import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePasswordChanged } from '../middleware/authenticate';
import { rateLimit } from '../middleware/rateLimit';
import { csrfVerify } from '../middleware/csrf';
import { validate } from '../middleware/validate';
import { idempotency } from '../middleware/idempotency';
import {
  listNotificationsHandler,
  unreadCountHandler,
  markReadHandler,
  markAllReadHandler,
} from './notificationsController';

export const notificationsRouter = Router();

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format');
const notifIdParamsSchema = z.object({ notificationId: objectIdSchema });

notificationsRouter.use(authenticate, requirePasswordChanged, rateLimit);

notificationsRouter.get('/', listNotificationsHandler);
notificationsRouter.get('/unread-count', unreadCountHandler);
notificationsRouter.post(
  '/mark-all-read',
  csrfVerify,
  idempotency('POST:/api/notifications/mark-all-read'),
  markAllReadHandler,
);
notificationsRouter.post(
  '/:notificationId/mark-read',
  csrfVerify,
  idempotency('POST:/api/notifications/:notificationId/mark-read'),
  validate({ params: notifIdParamsSchema }),
  markReadHandler,
);
