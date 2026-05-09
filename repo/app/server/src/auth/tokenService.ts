import crypto from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { getConfig } from '../config';

export interface AccessTokenPayload {
  sub: string; // userId
  sid: string; // sessionId
  role: string;
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  jti: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const cfg = getConfig();
  const opts: SignOptions = { expiresIn: cfg.auth.accessTtlSeconds, issuer: 'mergestream', audience: 'mergestream-client' };
  return jwt.sign(payload, cfg.auth.accessSecret, opts);
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  const cfg = getConfig();
  const opts: SignOptions = { expiresIn: cfg.auth.refreshTtlSeconds, issuer: 'mergestream', audience: 'mergestream-client' };
  return jwt.sign(payload, cfg.auth.refreshSecret, opts);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const cfg = getConfig();
  return jwt.verify(token, cfg.auth.accessSecret, { issuer: 'mergestream', audience: 'mergestream-client' }) as AccessTokenPayload;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const cfg = getConfig();
  return jwt.verify(token, cfg.auth.refreshSecret, { issuer: 'mergestream', audience: 'mergestream-client' }) as RefreshTokenPayload;
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function randomCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}
