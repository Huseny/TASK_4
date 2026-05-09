import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { IdempotencyKey } from '../db/models/idempotencyKeyModel';
import { errors } from '../shared/errors';
import type { AuthenticatedRequest } from '../shared/types';

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const TTL_SECONDS = 24 * 60 * 60;

function fingerprint(value: unknown): string {
  const str = JSON.stringify(value ?? null, Object.keys(value ?? {}).sort());
  return crypto.createHash('sha256').update(str).digest('hex');
}

/**
 * Idempotency middleware for non-auth writes.
 *
 * Requires an `Idempotency-Key` header. On first call, stores the
 * response body + status under (userId, key, method, routeFingerprint).
 * Subsequent calls with the same payload replay the stored response;
 * a different payload returns `IDEMPOTENCY_CONFLICT`.
 */
export function idempotency(routeName: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!WRITE_METHODS.has(req.method)) return next();
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) return next();
    const key = req.get('Idempotency-Key');
    if (!key) return next(errors.idempotencyKeyMissing());
    if (!/^[A-Za-z0-9_\-:.]{8,200}$/.test(key)) return next(errors.validation({ message: 'Idempotency-Key must be 8-200 chars of [A-Za-z0-9_-:.] .' }));

    const paramsSuffix = Object.keys(req.params ?? {}).sort().map((k) => `${k}=${req.params[k]}`).join(';');
    const routeFingerprint = paramsSuffix ? `${req.method}:${routeName}[${paramsSuffix}]` : `${req.method}:${routeName}`;
    const reqFingerprint = fingerprint(req.body);
    const existing = await IdempotencyKey.findOne({
      userId: auth.userId,
      key,
      method: req.method,
      routeFingerprint,
    }).lean();
    if (existing) {
      if (existing.requestFingerprint !== reqFingerprint) return next(errors.idempotencyConflict());
      if (existing.statusCode === 204 || existing.responseBody === null) {
        res.status(existing.statusCode).end();
      } else {
        res.status(existing.statusCode).json(existing.responseBody);
      }
      return;
    }

    // Capture the outgoing response so we can record it.
    const origJson = res.json.bind(res);
    let captured: unknown;
    res.json = ((body: unknown) => {
      captured = body;
      return origJson(body);
    }) as typeof res.json;

    res.on('finish', () => {
      // Only record 2xx writes — transient errors should remain retryable.
      if (res.statusCode >= 200 && res.statusCode < 300) {
        IdempotencyKey.create({
          userId: auth.userId,
          key,
          method: req.method,
          routeFingerprint,
          requestFingerprint: reqFingerprint,
          statusCode: res.statusCode,
          responseBody: captured ?? null,
          expiresAt: new Date(Date.now() + TTL_SECONDS * 1000),
        }).catch(() => {
          // Non-fatal — the request already completed.
        });
      }
    });

    next();
  };
}
