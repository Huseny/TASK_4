import request from 'supertest';
import { createApp } from '../../src/app';
import { User, UserStatus } from '../../src/db/models/userModel';
import { hashPassword } from '../../src/auth/passwordService';
import { resetRateLimitBucketsForTests } from '../../src/middleware/rateLimit';

const app = createApp();

async function createUser(username = 'contractuser', password = 'ContractPass1') {
  const passwordHash = await hashPassword(password);
  const user = await User.create({
    username,
    displayName: 'Contract User',
    passwordHash,
    role: 'DEVELOPER',
    status: UserStatus.ACTIVE,
  });
  return { user, password };
}

async function fullLogin(username: string, password: string) {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  const cookies = res.headers['set-cookie'] as string[];
  const csrf = cookies
    .map((c: string) => c.match(/ms_csrf=([^;]+)/))
    .filter(Boolean)
    .map((m) => m![1])[0] ?? '';
  return { res, cookies, csrf };
}

beforeEach(() => {
  resetRateLimitBucketsForTests();
});

describe('Auth API contract', () => {
  it('login → me → logout full flow', async () => {
    const { user, password } = await createUser('contractflow');
    const { cookies, csrf } = await fullLogin(user.username, password);
    resetRateLimitBucketsForTests();

    const meRes = await request(app).get('/api/auth/me').set('Cookie', cookies.join('; '));
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.id).toBeDefined();
    expect(meRes.body.user.username).toBe(user.username);
    resetRateLimitBucketsForTests();

    const logoutRes = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookies.join('; '))
      .set('X-CSRF-Token', csrf);
    expect(logoutRes.status).toBe(204);
    resetRateLimitBucketsForTests();

    // After logout, session should be invalid
    const afterLogout = await request(app).get('/api/auth/me').set('Cookie', cookies.join('; '));
    expect(afterLogout.status).toBe(401);
  });

  it('change-password flow invalidates other sessions', async () => {
    const { user, password } = await createUser('changepwtest');
    const { cookies: cookies1, csrf: csrf1 } = await fullLogin(user.username, password);
    resetRateLimitBucketsForTests();
    const { cookies: cookies2 } = await fullLogin(user.username, password);
    resetRateLimitBucketsForTests();

    // Change password from session 1
    const changeRes = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', cookies1.join('; '))
      .set('X-CSRF-Token', csrf1)
      .set('Idempotency-Key', `auth-changepw-${Date.now()}`)
      .send({ currentPassword: password, newPassword: 'NewValidPass1' });
    expect(changeRes.status).toBe(204);
    resetRateLimitBucketsForTests();

    // Session 2 should be revoked
    const meWithSession2 = await request(app).get('/api/auth/me').set('Cookie', cookies2.join('; '));
    expect(meWithSession2.status).toBe(401);
  });

  it('error envelope has canonical shape', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'noone', password: 'x' });
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toHaveProperty('code');
    expect(res.body.error).toHaveProperty('message');
    expect(res.body.error).toHaveProperty('details');
    expect(res.body.error).toHaveProperty('requestId');
  });

  it('GET /api/nonexistent returns 404 NOT_FOUND', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
