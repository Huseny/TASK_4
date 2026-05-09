import request from 'supertest';
import { createApp } from '../../src/app';
import { User, UserRole, UserStatus } from '../../src/db/models/userModel';
import { hashPassword } from '../../src/auth/passwordService';
import { resetRateLimitBucketsForTests } from '../../src/middleware/rateLimit';
import { ErrorCode } from '../../src/shared/errors';

const app = createApp();

async function createAndLogin(role: string, suffix: string) {
  const password = 'ValidPass1';
  const passwordHash = await hashPassword(password);
  const user = await User.create({
    username: `rbac_${role.toLowerCase()}_${suffix}`,
    displayName: `RBAC ${role}`,
    passwordHash,
    role,
    status: UserStatus.ACTIVE,
  });
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password });
  return {
    user,
    cookies: loginRes.headers['set-cookie'] as string[],
    csrf: (loginRes.headers['set-cookie'] as string[])
      .map((c: string) => c.match(/ms_csrf=([^;]+)/))
      .filter(Boolean)
      .map((m) => m![1])[0] ?? '',
  };
}

beforeEach(() => {
  resetRateLimitBucketsForTests();
});

describe('Admin-only endpoints', () => {
  it('allows admin to list users (response is { users: [...] })', async () => {
    const { cookies } = await createAndLogin(UserRole.ADMIN, 'list');
    resetRateLimitBucketsForTests();
    const res = await request(app).get('/api/users').set('Cookie', cookies.join('; '));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users.length).toBeGreaterThan(0);
    expect(res.body.users[0]).toHaveProperty('username');
    expect(res.body.users[0]).toHaveProperty('role');
    // Sensitive fields are stripped at the DTO boundary.
    expect(res.body.users[0]).not.toHaveProperty('passwordHash');
    expect(res.body.users[0]).not.toHaveProperty('failedLoginAttempts');
  });

  it('rejects developer from listing users with full error envelope', async () => {
    const { cookies } = await createAndLogin(UserRole.DEVELOPER, 'noaccess');
    resetRateLimitBucketsForTests();
    const res = await request(app).get('/api/users').set('Cookie', cookies.join('; '));
    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatchObject({
      code: ErrorCode.RBAC_FORBIDDEN,
    });
    expect(typeof res.body.error.message).toBe('string');
    expect(res.body.error).toHaveProperty('requestId');
  });

  it('rejects maintainer from listing users', async () => {
    const { cookies } = await createAndLogin(UserRole.MAINTAINER, 'noaccess');
    resetRateLimitBucketsForTests();
    const res = await request(app).get('/api/users').set('Cookie', cookies.join('; '));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ErrorCode.RBAC_FORBIDDEN);
  });

  it('rejects unauthenticated request to admin route with AUTH_SESSION_INVALID', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.AUTH_SESSION_INVALID);
  });

  it('allows admin to access audit logs', async () => {
    const { cookies } = await createAndLogin(UserRole.ADMIN, 'audit');
    resetRateLimitBucketsForTests();
    const res = await request(app).get('/api/audit').set('Cookie', cookies.join('; '));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('events');
    expect(Array.isArray(res.body.events)).toBe(true);
  });

  it('rejects developer from audit logs', async () => {
    const { cookies } = await createAndLogin(UserRole.DEVELOPER, 'noaudit');
    resetRateLimitBucketsForTests();
    const res = await request(app).get('/api/audit').set('Cookie', cookies.join('; '));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ErrorCode.RBAC_FORBIDDEN);
  });
});
