import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app';
import { User, UserRole, UserStatus } from '../../src/db/models/userModel';
import { hashPassword } from '../../src/auth/passwordService';
import { resetRateLimitBucketsForTests } from '../../src/middleware/rateLimit';
import { getConfig } from '../../src/config';

const app = createApp();
const cfg = getConfig();
const REPO_PATH = cfg.pipeline.allowedRepoRoots[0] + '/test-proj.git';

interface Session {
  user: { _id: string; username: string };
  cookies: string[];
  csrf: string;
}

async function login(role: keyof typeof UserRole, suffix: string): Promise<Session> {
  const password = 'ValidPass1';
  const passwordHash = await hashPassword(password);
  const user = await User.create({
    username: `phttp_${role.toLowerCase()}_${suffix}`,
    displayName: `PHttp ${role}`,
    passwordHash,
    role,
    status: UserStatus.ACTIVE,
  });
  const res = await request(app).post('/api/auth/login').send({ username: user.username, password });
  const cookies = res.headers['set-cookie'] as string[];
  const csrf =
    (cookies.map((c) => c.match(/ms_csrf=([^;]+)/)).filter(Boolean).map((m) => m![1])[0]) ?? '';
  return { user: { _id: String(user._id), username: user.username }, cookies, csrf };
}

function key(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function createProject(
  admin: Session,
  slug: string,
  members: { maintainerUserIds: string[]; developerUserIds: string[] },
): Promise<string> {
  const res = await request(app)
    .post('/api/projects')
    .set('Cookie', admin.cookies.join('; '))
    .set('X-CSRF-Token', admin.csrf)
    .set('Idempotency-Key', key(`proj-${slug}`))
    .send({
      name: `Project ${slug}`,
      slug,
      repoPath: REPO_PATH,
      targetBranch: 'main',
      testCommand: 'echo ok',
      maintainerUserIds: members.maintainerUserIds,
      developerUserIds: members.developerUserIds,
    });
  expect(res.status).toBe(201);
  return res.body.project.id;
}

beforeEach(() => resetRateLimitBucketsForTests());

describe('GET /api/projects', () => {
  it('admin sees all projects', async () => {
    const admin = await login(UserRole.ADMIN, 'list-admin');
    resetRateLimitBucketsForTests();

    await createProject(admin, `list-admin-a-${Date.now()}`, { maintainerUserIds: [], developerUserIds: [] });
    resetRateLimitBucketsForTests();
    await createProject(admin, `list-admin-b-${Date.now()}`, { maintainerUserIds: [], developerUserIds: [] });
    resetRateLimitBucketsForTests();

    const res = await request(app).get('/api/projects').set('Cookie', admin.cookies.join('; '));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.projects)).toBe(true);
    expect(res.body.projects.length).toBeGreaterThanOrEqual(2);
  });

  it('developer only sees projects they are a member of', async () => {
    const admin = await login(UserRole.ADMIN, 'list-dev-admin');
    resetRateLimitBucketsForTests();
    const dev = await login(UserRole.DEVELOPER, 'list-dev-d');
    resetRateLimitBucketsForTests();

    const memberId = await createProject(admin, `list-mine-${Date.now()}`, {
      maintainerUserIds: [],
      developerUserIds: [dev.user._id],
    });
    resetRateLimitBucketsForTests();
    await createProject(admin, `list-not-mine-${Date.now()}`, {
      maintainerUserIds: [],
      developerUserIds: [],
    });
    resetRateLimitBucketsForTests();

    const res = await request(app).get('/api/projects').set('Cookie', dev.cookies.join('; '));
    expect(res.status).toBe(200);
    const ids = res.body.projects.map((p: { id: string }) => p.id);
    expect(ids).toContain(memberId);
    expect(res.body.projects.length).toBe(1);
  });
});

describe('GET /api/projects/:projectId/members', () => {
  it('lists members for a project', async () => {
    const admin = await login(UserRole.ADMIN, 'mem-admin');
    resetRateLimitBucketsForTests();
    const maint = await login(UserRole.MAINTAINER, 'mem-m');
    resetRateLimitBucketsForTests();
    const dev = await login(UserRole.DEVELOPER, 'mem-d');
    resetRateLimitBucketsForTests();

    const projId = await createProject(admin, `mem-${Date.now()}`, {
      maintainerUserIds: [maint.user._id],
      developerUserIds: [dev.user._id],
    });
    resetRateLimitBucketsForTests();

    const res = await request(app)
      .get(`/api/projects/${projId}/members`)
      .set('Cookie', admin.cookies.join('; '));

    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(2);
    const usernames = res.body.users.map((u: { username: string }) => u.username);
    expect(usernames).toContain(maint.user.username);
    expect(usernames).toContain(dev.user.username);
  });

  it('non-member is denied', async () => {
    const admin = await login(UserRole.ADMIN, 'mem-blk-admin');
    resetRateLimitBucketsForTests();
    const outsider = await login(UserRole.DEVELOPER, 'mem-blk-out');
    resetRateLimitBucketsForTests();

    const projId = await createProject(admin, `mem-blk-${Date.now()}`, {
      maintainerUserIds: [],
      developerUserIds: [],
    });
    resetRateLimitBucketsForTests();

    const res = await request(app)
      .get(`/api/projects/${projId}/members`)
      .set('Cookie', outsider.cookies.join('; '));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/projects/:projectId/branches', () => {
  it('lists tracked branches', async () => {
    const admin = await login(UserRole.ADMIN, 'br-list-admin');
    resetRateLimitBucketsForTests();
    const dev = await login(UserRole.DEVELOPER, 'br-list-dev');
    resetRateLimitBucketsForTests();

    const projId = await createProject(admin, `br-list-${Date.now()}`, {
      maintainerUserIds: [],
      developerUserIds: [dev.user._id],
    });
    resetRateLimitBucketsForTests();

    await request(app)
      .post(`/api/projects/${projId}/branches`)
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', key('br-list-create'))
      .send({ branchName: 'feature/listme', ownerUserId: dev.user._id });
    resetRateLimitBucketsForTests();

    const res = await request(app)
      .get(`/api/projects/${projId}/branches`)
      .set('Cookie', admin.cookies.join('; '));

    expect(res.status).toBe(200);
    expect(res.body.branches).toHaveLength(1);
    expect(res.body.branches[0]).toMatchObject({ branchName: 'feature/listme' });
  });
});

describe('DELETE /api/projects/:projectId/branches/:branchId', () => {
  it('admin deletes a tracked branch', async () => {
    const admin = await login(UserRole.ADMIN, 'br-del-admin');
    resetRateLimitBucketsForTests();
    const dev = await login(UserRole.DEVELOPER, 'br-del-dev');
    resetRateLimitBucketsForTests();

    const projId = await createProject(admin, `br-del-${Date.now()}`, {
      maintainerUserIds: [],
      developerUserIds: [dev.user._id],
    });
    resetRateLimitBucketsForTests();

    const createRes = await request(app)
      .post(`/api/projects/${projId}/branches`)
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', key('br-del-create'))
      .send({ branchName: 'feature/delete-me', ownerUserId: dev.user._id });
    expect(createRes.status).toBe(201);
    const branchId = createRes.body.branch.id;
    resetRateLimitBucketsForTests();

    const delRes = await request(app)
      .delete(`/api/projects/${projId}/branches/${branchId}`)
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', key('br-del-do'));

    expect(delRes.status).toBe(204);
  });

  it('returns BRANCH_NOT_FOUND when deleting an unknown branch', async () => {
    const admin = await login(UserRole.ADMIN, 'br-del-404');
    resetRateLimitBucketsForTests();

    const projId = await createProject(admin, `br-del-404-${Date.now()}`, {
      maintainerUserIds: [],
      developerUserIds: [],
    });
    resetRateLimitBucketsForTests();

    const fakeBranchId = new mongoose.Types.ObjectId().toHexString();
    const res = await request(app)
      .delete(`/api/projects/${projId}/branches/${fakeBranchId}`)
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', key('br-del-404'));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('BRANCH_NOT_FOUND');
  });

  it('developer cannot delete a tracked branch', async () => {
    const admin = await login(UserRole.ADMIN, 'br-del-blk-admin');
    resetRateLimitBucketsForTests();
    const dev = await login(UserRole.DEVELOPER, 'br-del-blk-dev');
    resetRateLimitBucketsForTests();

    const projId = await createProject(admin, `br-del-blk-${Date.now()}`, {
      maintainerUserIds: [],
      developerUserIds: [dev.user._id],
    });
    resetRateLimitBucketsForTests();

    const createRes = await request(app)
      .post(`/api/projects/${projId}/branches`)
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', key('br-del-blk-create'))
      .send({ branchName: 'feature/keepme', ownerUserId: dev.user._id });
    expect(createRes.status).toBe(201);
    resetRateLimitBucketsForTests();

    const delRes = await request(app)
      .delete(`/api/projects/${projId}/branches/${createRes.body.branch.id}`)
      .set('Cookie', dev.cookies.join('; '))
      .set('X-CSRF-Token', dev.csrf)
      .set('Idempotency-Key', key('br-del-blk-do'));

    expect(delRes.status).toBe(403);
  });
});
