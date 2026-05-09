import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePasswordChanged } from '../middleware/authenticate';
import { requireAdmin } from '../middleware/rbac';
import { rateLimit } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { AuditEvent } from '../db/models/auditEventModel';
import { toAuditDto } from '../shared/dto';
import { getConfig } from '../config';
import type { Request, Response, NextFunction } from 'express';

const auditQuerySchema = z.object({
  actionType: z.string().optional(),
  actorUserId: z.string().optional(),
  resourceType: z.string().optional(),
  outcome: z.string().optional(),
  projectId: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(1000),
});

export const auditRouter = Router();

auditRouter.use(authenticate, requireAdmin, requirePasswordChanged, rateLimit);

auditRouter.get(
  '/',
  validate({ query: auditQuerySchema }),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const cfg = getConfig();
      const q = req.query as unknown as z.infer<typeof auditQuerySchema>;
      const filter: Record<string, unknown> = {};
      if (q.actionType) filter.actionType = q.actionType;
      if (q.actorUserId) filter.actorUserId = q.actorUserId;
      if (q.resourceType) filter.resourceType = q.resourceType;
      if (q.outcome) filter.outcome = q.outcome;
      if (q.projectId) filter.projectId = q.projectId;
      if (q.from || q.to) {
        const ts: Record<string, unknown> = {};
        if (q.from) ts.$gte = new Date(q.from);
        if (q.to) ts.$lte = new Date(q.to);
        filter.timestamp = ts;
      }
      const limit = Math.min(q.limit ?? 100, cfg.audit.searchLimit);
      const events = await AuditEvent.find(filter).sort({ timestamp: -1 }).limit(limit).lean();
      res.json({ events: events.map(toAuditDto) });
    } catch (err) {
      next(err);
    }
  },
);
