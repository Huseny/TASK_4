import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app';
import { User, UserRole, UserStatus } from '../../src/db/models/userModel';
import { PipelineRun, RunStatus, nextQueueSequence } from '../../src/db/models/pipelineRunModel';
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
    username: `phttp2_${role.toLowerCase()}_${suffix}`,
    displayName: `PHttp2 ${role}`,
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

async function makeProject(admin: Session, slug: string, devId: string): Promise<string> {
  const res = await request(app)
    .post('/api/projects')
    .set('Cookie', admin.cookies.join('; '))
    .set('X-CSRF-Token', admin.csrf)
    .set('Idempotency-Key', key(`pp-${slug}`))
    .send({
      name: `Pipe ${slug}`,
      slug,
      repoPath: REPO_PATH,
      targetBranch: 'main',
      testCommand: 'echo ok',
      maintainerUserIds: [],
      developerUserIds: [devId],
    });
  expect(res.status).toBe(201);
  return res.body.project.id;
}

async function seedRun(
  projectId: string,
  status: keyof typeof RunStatus,
  sourceBranch: string,
): Promise<string> {
  const seq = await nextQueueSequence();
  const doc = await PipelineRun.create({
    projectId: new mongoose.Types.ObjectId(projectId),
    sourceBranch,
    sourceCommitSha: `sha-${sourceBranch}-${seq}`,
    targetBranch: 'main',
    triggerType: 'MONITOR',
    status,
    queuedAt: new Date(Date.now() - seq * 1000),
    queueSequence: seq,
  });
  return String(doc._id);
}

beforeEach(() => resetRateLimitBucketsForTests());

describe('GET /api/pipeline/dashboard', () => {
  it('returns role-scoped projects + queue counters', async () => {
    const admin = await login(UserRole.ADMIN, 'dash-admin');
    resetRateLimitBucketsForTests();
    const dev = await login(UserRole.DEVELOPER, 'dash-dev');
    resetRateLimitBucketsForTests();

    const projId = await makeProject(admin, `dash-${Date.now()}`, dev.user._id);
    resetRateLimitBucketsForTests();

    await seedRun(projId, RunStatus.QUEUED, 'feature/queue-a');
    await seedRun(projId, RunStatus.QUEUED, 'feature/queue-b');
    await seedRun(projId, RunStatus.RUNNING, 'feature/run');

    // Admin sees all
    const adminRes = await request(app)
      .get('/api/pipeline/dashboard')
      .set('Cookie', admin.cookies.join('; '));
    expect(adminRes.status).toBe(200);
    expect(adminRes.body).toHaveProperty('projects');
    expect(adminRes.body).toHaveProperty('queue');
    expect(adminRes.body.queue.queued).toBe(2);
    expect(adminRes.body.queue.running).toBe(1);

    // Developer scoped to projects they belong to
    const devRes = await request(app)
      .get('/api/pipeline/dashboard')
      .set('Cookie', dev.cookies.join('; '));
    expect(devRes.status).toBe(200);
    expect(devRes.body.projects).toHaveLength(1);
    expect(devRes.body.projects[0].projectId).toBe(projId);
  });

  it('rejects unauthenticated callers with 401', async () => {
    const res = await request(app).get('/api/pipeline/dashboard');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/pipeline/projects/:projectId/runs', () => {
  it('returns runs in newest-first order respecting limit', async () => {
    const admin = await login(UserRole.ADMIN, 'list-runs-a');
    resetRateLimitBucketsForTests();
    const dev = await login(UserRole.DEVELOPER, 'list-runs-d');
    resetRateLimitBucketsForTests();

    const projId = await makeProject(admin, `runs-${Date.now()}`, dev.user._id);
    resetRateLimitBucketsForTests();

    for (let i = 0; i < 5; i++) {
      await seedRun(projId, RunStatus.PASSED, `feature/run-${i}`);
    }

    const res = await request(app)
      .get(`/api/pipeline/projects/${projId}/runs?limit=3`)
      .set('Cookie', admin.cookies.join('; '));

    expect(res.status).toBe(200);
    expect(res.body.runs).toHaveLength(3);
    const seqs = res.body.runs.map((r: { queueSequence: number }) => r.queueSequence);
    const sorted = [...seqs].sort((a, b) => b - a);
    expect(seqs).toEqual(sorted);
  });

  it('non-member developer is denied', async () => {
    const admin = await login(UserRole.ADMIN, 'list-runs-blk-a');
    resetRateLimitBucketsForTests();
    const outsider = await login(UserRole.DEVELOPER, 'list-runs-blk-o');
    resetRateLimitBucketsForTests();

    const projId = await makeProject(admin, `runs-blk-${Date.now()}`, admin.user._id);
    resetRateLimitBucketsForTests();

    const res = await request(app)
      .get(`/api/pipeline/projects/${projId}/runs`)
      .set('Cookie', outsider.cookies.join('; '));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/pipeline/projects/:projectId/runs/:runId', () => {
  it('returns full run detail (status, queueSequence)', async () => {
    const admin = await login(UserRole.ADMIN, 'getrun-a');
    resetRateLimitBucketsForTests();
    const dev = await login(UserRole.DEVELOPER, 'getrun-d');
    resetRateLimitBucketsForTests();

    const projId = await makeProject(admin, `getrun-${Date.now()}`, dev.user._id);
    resetRateLimitBucketsForTests();

    const runId = await seedRun(projId, RunStatus.PASSED, 'feature/detail');

    const res = await request(app)
      .get(`/api/pipeline/projects/${projId}/runs/${runId}`)
      .set('Cookie', admin.cookies.join('; '));

    expect(res.status).toBe(200);
    expect(res.body.run).toMatchObject({
      id: runId,
      status: RunStatus.PASSED,
      sourceBranch: 'feature/detail',
    });
  });

  it('returns PIPELINE_RUN_NOT_FOUND for unknown runId', async () => {
    const admin = await login(UserRole.ADMIN, 'getrun-404-a');
    resetRateLimitBucketsForTests();

    const projId = await makeProject(admin, `getrun-404-${Date.now()}`, admin.user._id);
    resetRateLimitBucketsForTests();

    const fakeRunId = new mongoose.Types.ObjectId().toHexString();
    const res = await request(app)
      .get(`/api/pipeline/projects/${projId}/runs/${fakeRunId}`)
      .set('Cookie', admin.cookies.join('; '));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PIPELINE_RUN_NOT_FOUND');
  });
});
