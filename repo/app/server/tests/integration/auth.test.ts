import request from 'supertest';
import { createApp } from '../../src/app';
import { User, UserStatus } from '../../src/db/models/userModel';
import { Session } from '../../src/db/models/sessionModel';
import { hashPassword } from '../../src/auth/passwordService';
import { createSession } from '../../src/auth/sessionService';
import { resetRateLimitBucketsForTests } from '../../src/middleware/rateLimit';
import { ErrorCode } from '../../src/shared/errors';

const app = createApp();

async function createUser(opts: { username?: string; password?: string; status?: string } = {}) {
  const password = opts.password ?? 'ValidPass1';
  const passwordHash = await hashPassword(password);
  const user = await User.create({
    username: opts.username ?? 'testuser',
    displayName: 'Test User',
    passwordHash,
    role: 'DEVELOPER',
    status: opts.status ?? UserStatus.ACTIVE,
  });
  return { user, password };
}

async function loginAndGetCookies(username: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  return { res, cookies: res.headers['set-cookie'] as string[] | undefined };
}

function csrfToken(cookies: string[]): string {
  for (const c of cookies) {
    const m = c.match(/ms_csrf=([^;]+)/);
    if (m) return m[1];
  }
  throw new Error('No ms_csrf cookie found');
}

beforeEach(() => {
  resetRateLimitBucketsForTests();
});

describe('POST /api/auth/login', () => {
  it('returns 200 and user dto on valid credentials', async () => {
    const { user, password } = await createUser({ username: 'logintest' });
    const res = await request(app).post('/api/auth/login').send({ username: user.username, password });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe(user.username);
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('returns 401 on unknown username', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'nobody', password: 'pass' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe(ErrorCode.AUTH_INVALID_CREDENTIALS);
  });

  it('returns 401 on wrong password', async () => {
    const { user } = await createUser({ username: 'wrongpass' });
    const res = await request(app).post('/api/auth/login').send({ username: user.username, password: 'wrongpassword1' });
    expect(res.status).toBe(401);
  });

  it('locks account after threshold failures', async () => {
    const { user } = await createUser({ username: 'lockout' });
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').send({ username: user.username, password: 'wrong' });
      resetRateLimitBucketsForTests();
    }
    const res = await request(app).post('/api/auth/login').send({ username: user.username, password: 'wrong' });
    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe(ErrorCode.AUTH_ACCOUNT_LOCKED);
  });

  it('resets failed counter after successful login', async () => {
    const { user, password } = await createUser({ username: 'resetcounter' });
    await request(app).post('/api/auth/login').send({ username: user.username, password: 'wrong' });
    resetRateLimitBucketsForTests();
    await request(app).post('/api/auth/login').send({ username: user.username, password });
    resetRateLimitBucketsForTests();
    const fresh = await User.findById(user._id).lean();
    expect(fresh!.failedLoginAttempts).toBe(0);
  });

  it('returns 403 for deactivated accounts', async () => {
    const { user, password } = await createUser({ username: 'deactivated', status: UserStatus.DEACTIVATED });
    const res = await request(app).post('/api/auth/login').send({ username: user.username, password });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ErrorCode.AUTH_ACCOUNT_DEACTIVATED);
  });
});

describe('POST /api/auth/refresh', () => {
  it('issues new tokens and rotates session', async () => {
    const { user, password } = await createUser({ username: 'refreshtest' });
    const { cookies } = await loginAndGetCookies(user.username, password);
    expect(cookies).toBeDefined();
    resetRateLimitBucketsForTests();
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookies!.join('; '));
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe(user.username);
  });

  it('returns 401 with no refresh cookie', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('rejects a revoked session', async () => {
    const { user, password } = await createUser({ username: 'revokedrefresh' });
    const { cookies } = await loginAndGetCookies(user.username, password);
    resetRateLimitBucketsForTests();
    // Revoke all sessions
    await Session.updateMany({ userId: user._id }, { $set: { revokedAt: new Date() } });
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookies!.join('; '));
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  it('clears cookies and revokes session', async () => {
    const { user, password } = await createUser({ username: 'logouttest' });
    const { cookies } = await loginAndGetCookies(user.username, password);
    resetRateLimitBucketsForTests();
    const csrf = csrfToken(cookies!);
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookies!.join('; '))
      .set('X-CSRF-Token', csrf);
    expect(res.status).toBe(204);
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns current user for authenticated requests', async () => {
    const { user, password } = await createUser({ username: 'metest' });
    const { cookies } = await loginAndGetCookies(user.username, password);
    resetRateLimitBucketsForTests();
    const res = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookies!.join('; '));
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe(user.username);
  });

  it('returns 401 without authentication', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('CSRF protection', () => {
  it('rejects POST /api/auth/logout without CSRF token', async () => {
    const { user, password } = await createUser({ username: 'csrftest' });
    const { cookies } = await loginAndGetCookies(user.username, password);
    resetRateLimitBucketsForTests();
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookies!.join('; '));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe(ErrorCode.CSRF_TOKEN_INVALID);
  });

  it('allows POST /api/auth/refresh without CSRF token (exempt by design)', async () => {
    const { user, password } = await createUser({ username: 'csrfrefresh' });
    const { cookies } = await loginAndGetCookies(user.username, password);
    resetRateLimitBucketsForTests();
    // Refresh must succeed without X-CSRF-Token — it is cookie-based, not form-triggered
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookies!.join('; '));
    expect(res.status).toBe(200);
  });
});

describe('Rate limiting', () => {
  it('returns 429 after exceeding rate limit', async () => {
    const { user } = await createUser({ username: 'ratelimit' });
    // Flood the rate limiter (default 60 rpm in test)
    for (let i = 0; i < 60; i++) {
      await request(app).post('/api/auth/login').send({ username: user.username, password: 'wrong' });
    }
    const res = await request(app).post('/api/auth/login').send({ username: user.username, password: 'wrong' });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe(ErrorCode.RATE_LIMITED);
    resetRateLimitBucketsForTests();
  });
});
