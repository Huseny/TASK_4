import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { rateLimit } from '../middleware/rateLimit';
import { csrfVerify } from '../middleware/csrf';
import { validate } from '../middleware/validate';
import { idempotency } from '../middleware/idempotency';
import { loginBodySchema, changePasswordBodySchema } from './authSchemas';
import {
  changePasswordHandler,
  loginHandler,
  logoutHandler,
  meHandler,
  refreshHandler,
} from './authController';

/**
 * Auth routes.
 *   - login: rate-limited by IP only (pre-session); does NOT run CSRF.
 *   - refresh: reads the ms_refresh cookie, no CSRF required (not triggered from a form).
 *   - logout/me/change-password: require auth + CSRF.
 */
export const authRouter = Router();

authRouter.post('/login', rateLimit, validate({ body: loginBodySchema }), loginHandler);
authRouter.post('/refresh', rateLimit, refreshHandler);
authRouter.post('/logout', authenticate, rateLimit, csrfVerify, logoutHandler);
authRouter.get('/me', authenticate, rateLimit, meHandler);
authRouter.post(
  '/change-password',
  authenticate,
  rateLimit,
  csrfVerify,
  idempotency('POST:/api/auth/change-password'),
  validate({ body: changePasswordBodySchema }),
  changePasswordHandler,
);
