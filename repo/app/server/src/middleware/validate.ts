import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { errors } from '../shared/errors';

export interface ValidateOptions<Body, Params, Query> {
  body?: z.ZodType<Body>;
  params?: z.ZodType<Params>;
  query?: z.ZodType<Query>;
}

/**
 * Wraps a route handler with per-segment zod schemas. Rejects any request
 * that fails validation with a consistent `VALIDATION_FAILED` envelope.
 * Parsed values replace `req.body`, `req.params`, `req.query`.
 */
export function validate<Body = unknown, Params = unknown, Query = unknown>(
  opts: ValidateOptions<Body, Params, Query>,
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const details: Record<string, unknown> = {};
    if (opts.params) {
      const r = opts.params.safeParse(req.params);
      if (!r.success) details.params = r.error.issues;
      else req.params = r.data as unknown as typeof req.params;
    }
    if (opts.query) {
      const r = opts.query.safeParse(req.query);
      if (!r.success) details.query = r.error.issues;
      else req.query = r.data as unknown as typeof req.query;
    }
    if (opts.body) {
      const r = opts.body.safeParse(req.body);
      if (!r.success) details.body = r.error.issues;
      else req.body = r.data as unknown;
    }
    if (Object.keys(details).length > 0) return next(errors.validation(details));
    next();
  };
}
