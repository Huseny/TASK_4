import type { Request, Response, NextFunction } from 'express';
import { getConfig } from '../config';
import { errors } from '../shared/errors';
import type { AuthenticatedRequest } from '../shared/types';

/**
 * In-memory rolling-window rate limiter. 60 requests per minute per
 * session (per `MS_RATE_LIMIT_PER_MINUTE`). Sessions are keyed by the
 * session id populated by `authenticate()`. Unauthenticated requests
 * (e.g. login) fall back to IP.
 *
 * A sliding window with per-key arrays of timestamps; lightweight for
 * local use. Sweep on every access keeps memory bounded.
 */
interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

export function resetRateLimitBucketsForTests(): void {
  buckets.clear();
}

function keyFor(req: Request): string {
  const auth = (req as AuthenticatedRequest).auth;
  if (auth) return 'sid:' + auth.sessionId;
  return 'ip:' + (req.ip ?? req.socket.remoteAddress ?? 'unknown');
}

export function rateLimit(req: Request, _res: Response, next: NextFunction): void {
  const cfg = getConfig();
  const max = cfg.rateLimit.perMinute;
  const windowMs = 60_000;
  const now = Date.now();
  const key = keyFor(req);
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= max) {
    const retryAfter = Math.ceil((windowMs - (now - bucket.hits[0])) / 1000);
    buckets.set(key, bucket);
    return next(errors.rateLimited(Math.max(1, retryAfter)));
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  next();
}
