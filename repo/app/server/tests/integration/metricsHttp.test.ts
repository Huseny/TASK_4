import request from 'supertest';
import { createApp } from '../../src/app';
import { User, UserRole, UserStatus } from '../../src/db/models/userModel';
import { hashPassword } from '../../src/auth/passwordService';
import { resetRateLimitBucketsForTests } from '../../src/middleware/rateLimit';

const app = createApp();

async function login(role: keyof typeof UserRole, suffix: string): Promise<string[]> {
  const password = 'ValidPass1';
  const passwordHash = await hashPassword(password);
  const user = await User.create({
    username: `metrics_${role.toLowerCase()}_${suffix}`,
    displayName: `Metrics ${role}`,
    passwordHash,
    role,
    status: UserStatus.ACTIVE,
  });
  const res = await request(app).post('/api/auth/login').send({ username: user.username, password });
  return res.headers['set-cookie'] as string[];
}

beforeEach(() => {
  resetRateLimitBucketsForTests();
});

describe('GET /api/metrics', () => {
  it('admin gets a metrics snapshot', async () => {
    const cookies = await login(UserRole.ADMIN, 'ok');
    resetRateLimitBucketsForTests();

    const res = await request(app).get('/api/metrics').set('Cookie', cookies.join('; '));

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('rpm');
    expect(res.body).toHaveProperty('avgLatencyMs');
    expect(res.body.rpm).toHaveProperty('1m');
    expect(res.body.rpm).toHaveProperty('5m');
    expect(res.body.rpm).toHaveProperty('15m');
    expect(res.body.avgLatencyMs).toHaveProperty('1m');
    expect(res.body).toHaveProperty('mongoPool');
  });

  it('rejects maintainer with 403', async () => {
    const cookies = await login(UserRole.MAINTAINER, 'blk-mnt');
    resetRateLimitBucketsForTests();

    const res = await request(app).get('/api/metrics').set('Cookie', cookies.join('; '));

    expect(res.status).toBe(403);
  });

  it('rejects developer with 403', async () => {
    const cookies = await login(UserRole.DEVELOPER, 'blk-dev');
    resetRateLimitBucketsForTests();

    const res = await request(app).get('/api/metrics').set('Cookie', cookies.join('; '));

    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/metrics');
    expect(res.status).toBe(401);
  });
});
