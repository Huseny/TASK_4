import { nanoid } from 'nanoid';
import { Session, type SessionDoc } from '../db/models/sessionModel';
import { getConfig } from '../config';
import {
  hashRefreshToken,
  randomCsrfToken,
  signAccessToken,
  signRefreshToken,
  type AccessTokenPayload,
  type RefreshTokenPayload,
} from './tokenService';

export interface IssuedSession {
  sessionId: string;
  csrfToken: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export async function createSession(params: {
  userId: string;
  role: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<IssuedSession> {
  const cfg = getConfig();
  const sessionId = nanoid(24);
  const csrfToken = randomCsrfToken();
  const refreshJti = nanoid(16);
  const expiresAt = new Date(Date.now() + cfg.auth.sessionTtlSeconds * 1000);

  const accessPayload: AccessTokenPayload = { sub: params.userId, sid: sessionId, role: params.role };
  const refreshPayload: RefreshTokenPayload = { sub: params.userId, sid: sessionId, jti: refreshJti };
  const accessToken = signAccessToken(accessPayload);
  const refreshToken = signRefreshToken(refreshPayload);

  await Session.create({
    _id: sessionId,
    userId: params.userId,
    refreshTokenHash: hashRefreshToken(refreshToken),
    csrfToken,
    issuedAt: new Date(),
    lastSeenAt: new Date(),
    expiresAt,
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
  });
  return { sessionId, csrfToken, accessToken, refreshToken, expiresAt };
}

export async function rotateSession(
  sessionId: string,
  userId: string,
  role: string,
): Promise<IssuedSession | null> {
  const cfg = getConfig();
  const session = await Session.findById(sessionId);
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;

  const refreshJti = nanoid(16);
  const accessToken = signAccessToken({ sub: userId, sid: sessionId, role });
  const refreshToken = signRefreshToken({ sub: userId, sid: sessionId, jti: refreshJti });
  const csrfToken = randomCsrfToken();
  const expiresAt = new Date(Date.now() + cfg.auth.sessionTtlSeconds * 1000);

  session.refreshTokenHash = hashRefreshToken(refreshToken);
  session.csrfToken = csrfToken;
  session.lastSeenAt = new Date();
  session.expiresAt = expiresAt;
  await session.save();
  return { sessionId, csrfToken, accessToken, refreshToken, expiresAt };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await Session.updateOne(
    { _id: sessionId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function revokeAllSessionsForUser(userId: string): Promise<number> {
  const res = await Session.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  return res.modifiedCount ?? 0;
}

export async function findActiveSession(sessionId: string): Promise<SessionDoc | null> {
  const session = await Session.findById(sessionId);
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  return session;
}

export async function touchSession(sessionId: string): Promise<void> {
  await Session.updateOne({ _id: sessionId }, { $set: { lastSeenAt: new Date() } });
}
