import { Router } from 'express';
import { authenticate, requirePasswordChanged } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/rbac';
import { rateLimit } from '../middleware/rateLimit';
import { getMetricsSnapshot } from './metricsService';
import type { Request, Response, NextFunction } from 'express';

export const metricsRouter = Router();

metricsRouter.use(authenticate, requireAdmin, requirePasswordChanged, rateLimit);

metricsRouter.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json(getMetricsSnapshot());
  } catch (err) {
    next(err);
  }
});
