import type { Request, Response, NextFunction } from 'express';
import { csrfVerify } from '../../src/middleware/csrf';
import { AppError, ErrorCode } from '../../src/shared/errors';
import type { AuthenticatedRequest } from '../../src/shared/types';

function runCsrf(
  method: string,
  headers: Record<string, string>,
  auth: AuthenticatedRequest['auth'] | undefined,
): { called: boolean; err: unknown } {
  let outcome: { called: boolean; err: unknown } = { called: false, err: undefined };
  const get = (h: string): string | undefined => headers[h] ?? headers[h.toLowerCase()];
  const req = { method, get, auth } as unknown as Request;
  const next: NextFunction = ((err?: unknown) => {
    outcome = { called: !err, err };
  }) as unknown as NextFunction;
  csrfVerify(req, {} as Response, next);
  return outcome;
}

const validAuth = {
  userId: 'u1',
  username: 'u',
  role: 'ADMIN',
  sessionId: 's1',
  csrfToken: 'good-token',
} as unknown as AuthenticatedRequest['auth'];

describe('csrfVerify middleware', () => {
  it('skips check entirely for safe methods (GET/HEAD)', () => {
    const result = runCsrf('GET', {}, validAuth);
    expect(result.called).toBe(true);
  });

  it('passes when X-CSRF-Token matches the session token', () => {
    const result = runCsrf('POST', { 'X-CSRF-Token': 'good-token' }, validAuth);
    expect(result.called).toBe(true);
  });

  it('rejects POST with no X-CSRF-Token header', () => {
    const result = runCsrf('POST', {}, validAuth);
    expect(result.called).toBe(false);
    expect(result.err).toBeInstanceOf(AppError);
    expect((result.err as AppError).code).toBe(ErrorCode.CSRF_TOKEN_INVALID);
  });

  it('rejects PATCH with a wrong token value', () => {
    const result = runCsrf('PATCH', { 'X-CSRF-Token': 'wrong' }, validAuth);
    expect(result.called).toBe(false);
    expect((result.err as AppError).code).toBe(ErrorCode.CSRF_TOKEN_INVALID);
  });

  it('falls through silently when there is no auth (auth middleware will reject)', () => {
    const result = runCsrf('POST', {}, undefined);
    expect(result.called).toBe(true);
  });
});
