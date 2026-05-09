import type { Request, Response, NextFunction } from 'express';
import { requireRole, requireAdmin, requireMaintainerOrAdmin } from '../../src/middleware/rbac';
import { UserRole } from '../../src/db/models/userModel';
import { AppError, ErrorCode } from '../../src/shared/errors';
import type { AuthenticatedRequest } from '../../src/shared/types';

function run(
  middleware: ReturnType<typeof requireRole>,
  auth: AuthenticatedRequest['auth'] | undefined,
): { called: boolean; err: unknown } {
  let outcome: { called: boolean; err: unknown } = { called: false, err: undefined };
  const req = { auth } as unknown as Request;
  const next: NextFunction = ((err?: unknown) => {
    outcome = { called: !err, err };
  }) as unknown as NextFunction;
  middleware(req, {} as Response, next);
  return outcome;
}

function authWith(role: keyof typeof UserRole): AuthenticatedRequest['auth'] {
  return {
    userId: 'u', username: 'u', role, sessionId: 's',
    csrfToken: 't', mustChangePassword: false,
  };
}

describe('rbac middleware', () => {
  it('rejects when there is no auth context (session invalid)', () => {
    const result = run(requireAdmin, undefined);
    expect(result.called).toBe(false);
    expect((result.err as AppError).code).toBe(ErrorCode.AUTH_SESSION_INVALID);
  });

  it('requireAdmin allows ADMIN', () => {
    expect(run(requireAdmin, authWith(UserRole.ADMIN)).called).toBe(true);
  });

  it('requireAdmin rejects MAINTAINER', () => {
    const r = run(requireAdmin, authWith(UserRole.MAINTAINER));
    expect(r.called).toBe(false);
    expect((r.err as AppError).code).toBe(ErrorCode.RBAC_FORBIDDEN);
  });

  it('requireAdmin rejects DEVELOPER', () => {
    const r = run(requireAdmin, authWith(UserRole.DEVELOPER));
    expect((r.err as AppError).code).toBe(ErrorCode.RBAC_FORBIDDEN);
  });

  it('requireMaintainerOrAdmin allows ADMIN and MAINTAINER but not DEVELOPER', () => {
    expect(run(requireMaintainerOrAdmin, authWith(UserRole.ADMIN)).called).toBe(true);
    expect(run(requireMaintainerOrAdmin, authWith(UserRole.MAINTAINER)).called).toBe(true);
    const r = run(requireMaintainerOrAdmin, authWith(UserRole.DEVELOPER));
    expect((r.err as AppError).code).toBe(ErrorCode.RBAC_FORBIDDEN);
  });
});
