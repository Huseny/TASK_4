import request from 'supertest';
import { createApp } from '../../src/app';
import { User, UserRole, UserStatus } from '../../src/db/models/userModel';
import { hashPassword } from '../../src/auth/passwordService';
import { resetRateLimitBucketsForTests } from '../../src/middleware/rateLimit';

const app = createApp();

interface Session {
  cookies: string[];
  csrf: string;
  user: { _id: string; username: string };
}

async function createAndLogin(role: keyof typeof UserRole, suffix: string): Promise<Session> {
  const password = 'ValidPass1';
  const passwordHash = await hashPassword(password);
  const user = await User.create({
    username: `users_${role.toLowerCase()}_${suffix}`,
    displayName: `Users ${role}`,
    passwordHash,
    role,
    status: UserStatus.ACTIVE,
  });
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password });
  const cookies = loginRes.headers['set-cookie'] as string[];
  const csrf =
    (cookies.map((c) => c.match(/ms_csrf=([^;]+)/)).filter(Boolean).map((m) => m![1])[0]) ?? '';
  return {
    cookies,
    csrf,
    user: { _id: String(user._id), username: user.username },
  };
}

function key(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

beforeEach(() => {
  resetRateLimitBucketsForTests();
});

describe('POST /api/users', () => {
  it('admin creates a developer user', async () => {
    const admin = await createAndLogin(UserRole.ADMIN, 'create-ok');
    resetRateLimitBucketsForTests();

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', key('user-create'))
      .send({
        username: `freshdev-${Date.now()}`,
        displayName: 'Fresh Dev',
        role: UserRole.DEVELOPER,
        password: 'NewValidPass1',
      });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      role: UserRole.DEVELOPER,
      status: UserStatus.ACTIVE,
    });
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('developer cannot create users', async () => {
    const dev = await createAndLogin(UserRole.DEVELOPER, 'create-block');
    resetRateLimitBucketsForTests();

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', dev.cookies.join('; '))
      .set('X-CSRF-Token', dev.csrf)
      .set('Idempotency-Key', key('user-create-blk'))
      .send({
        username: `nope-${Date.now()}`,
        displayName: 'X',
        role: UserRole.DEVELOPER,
        password: 'NewValidPass1',
      });

    expect(res.status).toBe(403);
  });

  it('rejects duplicate username with USER_CONFLICT', async () => {
    const admin = await createAndLogin(UserRole.ADMIN, 'create-dup');
    resetRateLimitBucketsForTests();

    const username = `dupuser-${Date.now()}`;
    await User.create({
      username,
      displayName: 'Existing',
      passwordHash: await hashPassword('ValidPass1'),
      role: UserRole.DEVELOPER,
      status: UserStatus.ACTIVE,
    });

    const res = await request(app)
      .post('/api/users')
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', key('user-create-dup'))
      .send({
        username,
        displayName: 'Conflicting',
        role: UserRole.DEVELOPER,
        password: 'NewValidPass1',
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('USER_CONFLICT');
  });
});

describe('GET /api/users/:userId', () => {
  it('admin fetches a user by id', async () => {
    const admin = await createAndLogin(UserRole.ADMIN, 'getbyid-ok');
    resetRateLimitBucketsForTests();

    const target = await User.create({
      username: `target-${Date.now()}`,
      displayName: 'Target User',
      passwordHash: await hashPassword('ValidPass1'),
      role: UserRole.DEVELOPER,
      status: UserStatus.ACTIVE,
    });

    const res = await request(app)
      .get(`/api/users/${target._id}`)
      .set('Cookie', admin.cookies.join('; '));

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe(target.username);
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('returns 404 USER_NOT_FOUND for missing id', async () => {
    const admin = await createAndLogin(UserRole.ADMIN, 'getbyid-404');
    resetRateLimitBucketsForTests();

    const res = await request(app)
      .get('/api/users/000000000000000000000abc')
      .set('Cookie', admin.cookies.join('; '));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('USER_NOT_FOUND');
  });
});

describe('PATCH /api/users/:userId/role', () => {
  it('admin promotes a developer to maintainer', async () => {
    const admin = await createAndLogin(UserRole.ADMIN, 'role-ok');
    resetRateLimitBucketsForTests();

    const target = await User.create({
      username: `roletarget-${Date.now()}`,
      displayName: 'Promote Me',
      passwordHash: await hashPassword('ValidPass1'),
      role: UserRole.DEVELOPER,
      status: UserStatus.ACTIVE,
    });

    const res = await request(app)
      .patch(`/api/users/${target._id}/role`)
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', key('role-promote'))
      .send({ role: UserRole.MAINTAINER });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe(UserRole.MAINTAINER);
  });

  it('rejects admin self-demotion', async () => {
    const admin = await createAndLogin(UserRole.ADMIN, 'role-self');
    resetRateLimitBucketsForTests();

    const res = await request(app)
      .patch(`/api/users/${admin.user._id}/role`)
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', key('role-self'))
      .send({ role: UserRole.DEVELOPER });

    expect(res.status).toBe(409);
  });
});

describe('POST /api/users/:userId/reset-password', () => {
  it('admin resets a password and forces change-on-login', async () => {
    const admin = await createAndLogin(UserRole.ADMIN, 'reset-ok');
    resetRateLimitBucketsForTests();

    const target = await User.create({
      username: `resettarget-${Date.now()}`,
      displayName: 'Reset Me',
      passwordHash: await hashPassword('ValidPass1'),
      role: UserRole.DEVELOPER,
      status: UserStatus.ACTIVE,
      mustChangePassword: false,
    });

    const res = await request(app)
      .post(`/api/users/${target._id}/reset-password`)
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', key('reset'))
      .send({ newPassword: 'BrandNewPass1' });

    expect(res.status).toBe(204);

    const fresh = await User.findById(target._id).lean();
    expect(fresh?.mustChangePassword).toBe(true);
  });
});

describe('POST /api/users/:userId/deactivate', () => {
  it('admin deactivates a user', async () => {
    const admin = await createAndLogin(UserRole.ADMIN, 'deact-ok');
    resetRateLimitBucketsForTests();

    const target = await User.create({
      username: `deactarget-${Date.now()}`,
      displayName: 'Off',
      passwordHash: await hashPassword('ValidPass1'),
      role: UserRole.DEVELOPER,
      status: UserStatus.ACTIVE,
    });

    const res = await request(app)
      .post(`/api/users/${target._id}/deactivate`)
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', key('deact'))
      .send({});

    expect(res.status).toBe(204);
    const fresh = await User.findById(target._id).lean();
    expect(fresh?.status).toBe(UserStatus.DEACTIVATED);
  });

  it('cannot deactivate yourself', async () => {
    const admin = await createAndLogin(UserRole.ADMIN, 'deact-self');
    resetRateLimitBucketsForTests();

    const res = await request(app)
      .post(`/api/users/${admin.user._id}/deactivate`)
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', key('deact-self'))
      .send({});

    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/users/:userId', () => {
  it('admin soft-deletes a user', async () => {
    const admin = await createAndLogin(UserRole.ADMIN, 'del-ok');
    resetRateLimitBucketsForTests();

    const target = await User.create({
      username: `deltarget-${Date.now()}`,
      displayName: 'Bye',
      passwordHash: await hashPassword('ValidPass1'),
      role: UserRole.DEVELOPER,
      status: UserStatus.ACTIVE,
    });

    const res = await request(app)
      .delete(`/api/users/${target._id}`)
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', key('del'));

    expect(res.status).toBe(204);
    const fresh = await User.findById(target._id).lean();
    expect(fresh?.status).toBe(UserStatus.DELETED);
    expect(fresh?.deletedAt).toBeTruthy();
  });

  it('developer cannot delete users', async () => {
    const dev = await createAndLogin(UserRole.DEVELOPER, 'del-blk');
    resetRateLimitBucketsForTests();

    const target = await User.create({
      username: `untouchable-${Date.now()}`,
      displayName: 'Stay',
      passwordHash: await hashPassword('ValidPass1'),
      role: UserRole.DEVELOPER,
      status: UserStatus.ACTIVE,
    });

    const res = await request(app)
      .delete(`/api/users/${target._id}`)
      .set('Cookie', dev.cookies.join('; '))
      .set('X-CSRF-Token', dev.csrf)
      .set('Idempotency-Key', key('del-blk'));

    expect(res.status).toBe(403);
  });
});
