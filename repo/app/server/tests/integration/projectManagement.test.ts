import request from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app';
import { User, UserRole, UserStatus } from '../../src/db/models/userModel';
import { AuditEvent } from '../../src/db/models/auditEventModel';
import { hashPassword } from '../../src/auth/passwordService';
import { resetRateLimitBucketsForTests } from '../../src/middleware/rateLimit';
import { getConfig } from '../../src/config';

const app = createApp();

async function makeUser(role: string, suffix: string) {
  const password = 'ValidPass1';
  const passwordHash = await hashPassword(password);
  const user = await User.create({
    username: `pm_${role.toLowerCase()}_${suffix}`,
    displayName: `PM ${role}`,
    passwordHash,
    role,
    status: UserStatus.ACTIVE,
  });
  const res = await request(app).post('/api/auth/login').send({ username: user.username, password });
  const cookies = res.headers['set-cookie'] as string[];
  const csrf = cookies.map((c: string) => c.match(/ms_csrf=([^;]+)/)).filter(Boolean).map((m) => m![1])[0] ?? '';
  return { user, cookies, csrf };
}

const cfg = getConfig();
const REPO_PATH = cfg.pipeline.allowedRepoRoots[0] + '/test-proj.git';

beforeEach(() => resetRateLimitBucketsForTests());

describe('Project membership assignment', () => {
  it('creates project with valid maintainer and developer IDs', async () => {
    const admin = await makeUser(UserRole.ADMIN, 'create1');
    resetRateLimitBucketsForTests();
    const maintainer = await makeUser(UserRole.MAINTAINER, 'create1m');
    resetRateLimitBucketsForTests();
    const developer = await makeUser(UserRole.DEVELOPER, 'create1d');
    resetRateLimitBucketsForTests();

    const res = await request(app)
      .post('/api/projects')
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', `test-pm-create1-${Date.now()}`)
      .send({
        name: 'PM Test Project',
        slug: `pm-proj-${Date.now()}`,
        repoPath: REPO_PATH,
        targetBranch: 'main',
        testCommand: 'echo ok',
        maintainerUserIds: [String(maintainer.user._id)],
        developerUserIds: [String(developer.user._id)],
      });

    expect(res.status).toBe(201);
    expect(res.body.project.maintainerUserIds).toContain(String(maintainer.user._id));
    expect(res.body.project.developerUserIds).toContain(String(developer.user._id));
  });

  it('rejects project create when maintainerUserIds contains non-existent user', async () => {
    const admin = await makeUser(UserRole.ADMIN, 'create2');
    resetRateLimitBucketsForTests();

    const fakeId = new mongoose.Types.ObjectId().toHexString();
    const res = await request(app)
      .post('/api/projects')
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', `test-pm-create2-${Date.now()}`)
      .send({
        name: 'Bad Members Project',
        slug: `pm-bad-${Date.now()}`,
        repoPath: REPO_PATH,
        targetBranch: 'main',
        testCommand: 'echo ok',
        maintainerUserIds: [fakeId],
        developerUserIds: [],
      });

    expect(res.status).toBe(400);
  });

  it('rejects project update when developerUserIds contains non-existent user', async () => {
    const admin = await makeUser(UserRole.ADMIN, 'update1');
    resetRateLimitBucketsForTests();

    const createRes = await request(app)
      .post('/api/projects')
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', `test-pm-update1-${Date.now()}`)
      .send({
        name: 'Update Test Project',
        slug: `pm-upd-${Date.now()}`,
        repoPath: REPO_PATH,
        targetBranch: 'main',
        testCommand: 'echo ok',
        maintainerUserIds: [],
        developerUserIds: [],
      });
    expect(createRes.status).toBe(201);
    resetRateLimitBucketsForTests();

    const fakeId = new mongoose.Types.ObjectId().toHexString();
    const patchRes = await request(app)
      .patch(`/api/projects/${createRes.body.project.id}`)
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', `test-pm-update2-${Date.now()}`)
      .send({ developerUserIds: [fakeId] });

    expect(patchRes.status).toBe(400);
  });
});

describe('Tracked branch owner membership', () => {
  it('rejects branch create when ownerUserId is not a project member', async () => {
    const admin = await makeUser(UserRole.ADMIN, 'branch1');
    resetRateLimitBucketsForTests();
    const nonMember = await makeUser(UserRole.DEVELOPER, 'branch1nm');
    resetRateLimitBucketsForTests();

    const proj = await request(app)
      .post('/api/projects')
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', `test-branch1-${Date.now()}`)
      .send({
        name: 'Branch Test Project',
        slug: `pm-br-${Date.now()}`,
        repoPath: REPO_PATH,
        targetBranch: 'main',
        testCommand: 'echo ok',
        maintainerUserIds: [],
        developerUserIds: [],
      });
    expect(proj.status).toBe(201);
    resetRateLimitBucketsForTests();

    const branchRes = await request(app)
      .post(`/api/projects/${proj.body.project.id}/branches`)
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', `test-branch1-create-${Date.now()}`)
      .send({ branchName: 'feature/test', ownerUserId: String(nonMember.user._id) });

    expect(branchRes.status).toBe(400);
  });

  it('creates branch when ownerUserId is a project member', async () => {
    const admin = await makeUser(UserRole.ADMIN, 'branch2');
    resetRateLimitBucketsForTests();
    const developer = await makeUser(UserRole.DEVELOPER, 'branch2dev');
    resetRateLimitBucketsForTests();

    const proj = await request(app)
      .post('/api/projects')
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', `test-branch2-${Date.now()}`)
      .send({
        name: 'Branch Test Project 2',
        slug: `pm-br2-${Date.now()}`,
        repoPath: REPO_PATH,
        targetBranch: 'main',
        testCommand: 'echo ok',
        maintainerUserIds: [],
        developerUserIds: [String(developer.user._id)],
      });
    expect(proj.status).toBe(201);
    resetRateLimitBucketsForTests();

    const branchRes = await request(app)
      .post(`/api/projects/${proj.body.project.id}/branches`)
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', `test-branch2-create-${Date.now()}`)
      .send({ branchName: 'feature/test', ownerUserId: String(developer.user._id) });

    expect(branchRes.status).toBe(201);
    expect(branchRes.body.branch.branchName).toBe('feature/test');
  });
});

describe('Tracked branch owner update membership', () => {
  it('rejects branch owner update to a non-member user', async () => {
    const admin = await makeUser(UserRole.ADMIN, 'bupdate1');
    resetRateLimitBucketsForTests();
    const developer = await makeUser(UserRole.DEVELOPER, 'bupdate1dev');
    resetRateLimitBucketsForTests();
    const nonMember = await makeUser(UserRole.DEVELOPER, 'bupdate1nm');
    resetRateLimitBucketsForTests();

    const proj = await request(app)
      .post('/api/projects')
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', `test-bupdate1-${Date.now()}`)
      .send({
        name: 'Branch Update Test',
        slug: `pm-bu1-${Date.now()}`,
        repoPath: REPO_PATH,
        targetBranch: 'main',
        testCommand: 'echo ok',
        maintainerUserIds: [],
        developerUserIds: [String(developer.user._id)],
      });
    expect(proj.status).toBe(201);
    resetRateLimitBucketsForTests();

    const branchRes = await request(app)
      .post(`/api/projects/${proj.body.project.id}/branches`)
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', `test-bupdate1-create-${Date.now()}`)
      .send({ branchName: 'feature/owned', ownerUserId: String(developer.user._id) });
    expect(branchRes.status).toBe(201);
    resetRateLimitBucketsForTests();

    const updateRes = await request(app)
      .patch(`/api/projects/${proj.body.project.id}/branches/${branchRes.body.branch.id}`)
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', `test-bupdate1-update-${Date.now()}`)
      .send({ ownerUserId: String(nonMember.user._id) });

    expect(updateRes.status).toBe(400);
  });

  it('accepts branch owner update to a project member', async () => {
    const admin = await makeUser(UserRole.ADMIN, 'bupdate2');
    resetRateLimitBucketsForTests();
    const devA = await makeUser(UserRole.DEVELOPER, 'bupdate2a');
    resetRateLimitBucketsForTests();
    const devB = await makeUser(UserRole.DEVELOPER, 'bupdate2b');
    resetRateLimitBucketsForTests();

    const proj = await request(app)
      .post('/api/projects')
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', `test-bupdate2-${Date.now()}`)
      .send({
        name: 'Branch Update Test 2',
        slug: `pm-bu2-${Date.now()}`,
        repoPath: REPO_PATH,
        targetBranch: 'main',
        testCommand: 'echo ok',
        maintainerUserIds: [],
        developerUserIds: [String(devA.user._id), String(devB.user._id)],
      });
    expect(proj.status).toBe(201);
    resetRateLimitBucketsForTests();

    const branchRes = await request(app)
      .post(`/api/projects/${proj.body.project.id}/branches`)
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', `test-bupdate2-create-${Date.now()}`)
      .send({ branchName: 'feature/transfer', ownerUserId: String(devA.user._id) });
    expect(branchRes.status).toBe(201);
    resetRateLimitBucketsForTests();

    const updateRes = await request(app)
      .patch(`/api/projects/${proj.body.project.id}/branches/${branchRes.body.branch.id}`)
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', `test-bupdate2-update-${Date.now()}`)
      .send({ ownerUserId: String(devB.user._id) });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.branch.ownerUserId).toBe(String(devB.user._id));
  });
});

describe('Audit log default limit', () => {
  it('returns up to 1000 events by default', async () => {
    const admin = await makeUser(UserRole.ADMIN, 'audit1');
    resetRateLimitBucketsForTests();

    const res = await request(app)
      .get('/api/audit')
      .set('Cookie', admin.cookies.join('; '));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.events)).toBe(true);
    // Verifies the endpoint is reachable and returns an array (no 100-cap forced by schema default)
    expect(res.body.events.length).toBeLessThanOrEqual(1000);
  });

  it('returns newest 1000 when more than 1000 events exist', async () => {
    const admin = await makeUser(UserRole.ADMIN, 'audit2');
    resetRateLimitBucketsForTests();

    // Insert 1100 audit events directly
    const events = Array.from({ length: 1100 }, (_, i) => ({
      actorUserId: null,
      actorUsername: 'system',
      actionType: 'PIPELINE_TRIGGER',
      resourceType: 'PIPELINE_RUN',
      resourceId: new mongoose.Types.ObjectId().toHexString(),
      projectId: null,
      outcome: 'SUCCESS',
      metadata: {},
      timestamp: new Date(Date.now() - i * 1000),
    }));
    await AuditEvent.insertMany(events);
    resetRateLimitBucketsForTests();

    const res = await request(app)
      .get('/api/audit')
      .set('Cookie', admin.cookies.join('; '));

    expect(res.status).toBe(200);
    expect(res.body.events.length).toBe(1000);
  });
});

describe('Idempotency on project create', () => {
  it('replays stored response for duplicate key + same body', async () => {
    const admin = await makeUser(UserRole.ADMIN, 'idem1');
    resetRateLimitBucketsForTests();
    const key = `idem-test-${Date.now()}`;
    const body = {
      name: 'Idempotency Test',
      slug: `idem-${Date.now()}`,
      repoPath: REPO_PATH,
      targetBranch: 'main',
      testCommand: 'echo ok',
      maintainerUserIds: [],
      developerUserIds: [],
    };

    const first = await request(app)
      .post('/api/projects')
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', key)
      .send(body);
    expect(first.status).toBe(201);
    resetRateLimitBucketsForTests();

    const second = await request(app)
      .post('/api/projects')
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', key)
      .send(body);
    expect(second.status).toBe(201);
    expect(second.body.project.id).toBe(first.body.project.id);
  });

  it('returns 409 IDEMPOTENCY_CONFLICT for same key with different body', async () => {
    const admin = await makeUser(UserRole.ADMIN, 'idem2');
    resetRateLimitBucketsForTests();
    const key = `idem-conflict-${Date.now()}`;

    const first = await request(app)
      .post('/api/projects')
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', key)
      .send({
        name: 'Idem Conflict A',
        slug: `idem-ca-${Date.now()}`,
        repoPath: REPO_PATH,
        targetBranch: 'main',
        testCommand: 'echo ok',
        maintainerUserIds: [],
        developerUserIds: [],
      });
    expect(first.status).toBe(201);
    resetRateLimitBucketsForTests();

    const second = await request(app)
      .post('/api/projects')
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', key)
      .send({
        name: 'Idem Conflict B',
        slug: `idem-cb-${Date.now()}`,
        repoPath: REPO_PATH,
        targetBranch: 'main',
        testCommand: 'echo ok',
        maintainerUserIds: [],
        developerUserIds: [],
      });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('IDEMPOTENCY_CONFLICT');
  });
});

describe('Cross-project access denial', () => {
  it('blocks developer from accessing a project they are not a member of', async () => {
    const admin = await makeUser(UserRole.ADMIN, 'xaccess1');
    resetRateLimitBucketsForTests();
    const developer = await makeUser(UserRole.DEVELOPER, 'xaccess1dev');
    resetRateLimitBucketsForTests();

    const projA = await request(app)
      .post('/api/projects')
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', `test-xaccess-a-${Date.now()}`)
      .send({
        name: 'Access Test A',
        slug: `xa-a-${Date.now()}`,
        repoPath: REPO_PATH,
        targetBranch: 'main',
        testCommand: 'echo ok',
        maintainerUserIds: [],
        developerUserIds: [String(developer.user._id)],
      });
    expect(projA.status).toBe(201);
    resetRateLimitBucketsForTests();

    const projB = await request(app)
      .post('/api/projects')
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', `test-xaccess-b-${Date.now()}`)
      .send({
        name: 'Access Test B',
        slug: `xa-b-${Date.now()}`,
        repoPath: REPO_PATH,
        targetBranch: 'main',
        testCommand: 'echo ok',
        maintainerUserIds: [],
        developerUserIds: [],
      });
    expect(projB.status).toBe(201);
    resetRateLimitBucketsForTests();

    // Developer can access Project A (is a member)
    const resA = await request(app)
      .get(`/api/projects/${projA.body.project.id}`)
      .set('Cookie', developer.cookies.join('; '));
    expect(resA.status).toBe(200);
    resetRateLimitBucketsForTests();

    // Developer cannot access Project B (not a member)
    const resB = await request(app)
      .get(`/api/projects/${projB.body.project.id}`)
      .set('Cookie', developer.cookies.join('; '));
    expect(resB.status).toBe(403);
  });
});

describe('Cancel authorization', () => {
  it('blocks developer from cancelling a run', async () => {
    const admin = await makeUser(UserRole.ADMIN, 'cancel1');
    resetRateLimitBucketsForTests();
    const developer = await makeUser(UserRole.DEVELOPER, 'cancel1dev');
    resetRateLimitBucketsForTests();

    const proj = await request(app)
      .post('/api/projects')
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', `test-cancel1-${Date.now()}`)
      .send({
        name: 'Cancel Test Project',
        slug: `cancel1-${Date.now()}`,
        repoPath: REPO_PATH,
        targetBranch: 'main',
        testCommand: 'echo ok',
        maintainerUserIds: [],
        developerUserIds: [String(developer.user._id)],
      });
    expect(proj.status).toBe(201);
    resetRateLimitBucketsForTests();

    const fakeRunId = new mongoose.Types.ObjectId().toHexString();
    const cancelRes = await request(app)
      .post(`/api/pipeline/projects/${proj.body.project.id}/runs/${fakeRunId}/cancel`)
      .set('Cookie', developer.cookies.join('; '))
      .set('X-CSRF-Token', developer.csrf);

    // Developer role is blocked before CSRF or project checks (403 RBAC_FORBIDDEN)
    expect(cancelRes.status).toBe(403);
  });

  it('allows maintainer to reach cancel handler (404 run-not-found means auth passed)', async () => {
    const admin = await makeUser(UserRole.ADMIN, 'cancel2');
    resetRateLimitBucketsForTests();
    const maintainer = await makeUser(UserRole.MAINTAINER, 'cancel2mnt');
    resetRateLimitBucketsForTests();

    const proj = await request(app)
      .post('/api/projects')
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', `test-cancel2-${Date.now()}`)
      .send({
        name: 'Cancel Test Project 2',
        slug: `cancel2-${Date.now()}`,
        repoPath: REPO_PATH,
        targetBranch: 'main',
        testCommand: 'echo ok',
        maintainerUserIds: [String(maintainer.user._id)],
        developerUserIds: [],
      });
    expect(proj.status).toBe(201);
    resetRateLimitBucketsForTests();

    const fakeRunId = new mongoose.Types.ObjectId().toHexString();
    const cancelRes = await request(app)
      .post(`/api/pipeline/projects/${proj.body.project.id}/runs/${fakeRunId}/cancel`)
      .set('Cookie', maintainer.cookies.join('; '))
      .set('X-CSRF-Token', maintainer.csrf)
      .set('Idempotency-Key', `test-cancel-pass-${Date.now()}`);

    // Auth passes; run does not exist → 404 (not 403)
    expect(cancelRes.status).toBe(404);
  });
});

describe('Pipeline-trigger idempotency cross-project isolation', () => {
  it('does not replay a trigger across two different projects with the same key', async () => {
    const admin = await makeUser(UserRole.ADMIN, 'xpidem1');
    resetRateLimitBucketsForTests();

    const proj1 = await request(app)
      .post('/api/projects')
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', `test-xpidem-p1-${Date.now()}`)
      .send({
        name: 'Idem Cross Project 1',
        slug: `xp1-${Date.now()}`,
        repoPath: REPO_PATH,
        targetBranch: 'main',
        testCommand: 'echo ok',
        maintainerUserIds: [],
        developerUserIds: [],
      });
    expect(proj1.status).toBe(201);
    resetRateLimitBucketsForTests();

    const proj2 = await request(app)
      .post('/api/projects')
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', `test-xpidem-p2-${Date.now()}`)
      .send({
        name: 'Idem Cross Project 2',
        slug: `xp2-${Date.now()}`,
        repoPath: REPO_PATH,
        targetBranch: 'main',
        testCommand: 'echo ok',
        maintainerUserIds: [],
        developerUserIds: [],
      });
    expect(proj2.status).toBe(201);
    resetRateLimitBucketsForTests();

    const sharedKey = `idem-xproj-${Date.now()}`;

    const run1 = await request(app)
      .post(`/api/pipeline/projects/${proj1.body.project.id}/runs`)
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', sharedKey)
      .send({ sourceBranch: 'main' });
    expect(run1.status).toBe(201);
    resetRateLimitBucketsForTests();

    const run2 = await request(app)
      .post(`/api/pipeline/projects/${proj2.body.project.id}/runs`)
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', sharedKey)
      .send({ sourceBranch: 'main' });
    expect(run2.status).toBe(201);

    // Both must be independent runs (same key, different projectId = different fingerprint)
    expect(run2.body.run.id).not.toBe(run1.body.run.id);
    expect(run1.body.run.projectId).toBe(proj1.body.project.id);
    expect(run2.body.run.projectId).toBe(proj2.body.project.id);
  });
});

describe('CSRF rejection on project and branch writes', () => {
  it('rejects POST /api/projects without X-CSRF-Token', async () => {
    const admin = await makeUser(UserRole.ADMIN, 'csrfproj1');
    resetRateLimitBucketsForTests();

    const res = await request(app)
      .post('/api/projects')
      .set('Cookie', admin.cookies.join('; '))
      // intentionally omit X-CSRF-Token
      .set('Idempotency-Key', `csrf-proj-${Date.now()}`)
      .send({
        name: 'CSRF Test Project',
        slug: `csrf-proj-${Date.now()}`,
        repoPath: REPO_PATH,
        targetBranch: 'main',
        testCommand: 'echo ok',
        maintainerUserIds: [],
        developerUserIds: [],
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_TOKEN_INVALID');
  });

  it('rejects PATCH /api/projects/:id without X-CSRF-Token', async () => {
    const admin = await makeUser(UserRole.ADMIN, 'csrfproj2');
    resetRateLimitBucketsForTests();

    const createRes = await request(app)
      .post('/api/projects')
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', `csrf-proj2-${Date.now()}`)
      .send({
        name: 'CSRF Patch Project',
        slug: `csrf-patch-${Date.now()}`,
        repoPath: REPO_PATH,
        targetBranch: 'main',
        testCommand: 'echo ok',
        maintainerUserIds: [],
        developerUserIds: [],
      });
    expect(createRes.status).toBe(201);
    resetRateLimitBucketsForTests();

    const patchRes = await request(app)
      .patch(`/api/projects/${createRes.body.project.id}`)
      .set('Cookie', admin.cookies.join('; '))
      // intentionally omit X-CSRF-Token
      .send({ name: 'Updated Name' });

    expect(patchRes.status).toBe(403);
    expect(patchRes.body.error.code).toBe('CSRF_TOKEN_INVALID');
  });

  it('rejects POST /api/projects/:id/branches without X-CSRF-Token', async () => {
    const admin = await makeUser(UserRole.ADMIN, 'csrfbranch1');
    resetRateLimitBucketsForTests();
    const developer = await makeUser(UserRole.DEVELOPER, 'csrfbranch1dev');
    resetRateLimitBucketsForTests();

    const proj = await request(app)
      .post('/api/projects')
      .set('Cookie', admin.cookies.join('; '))
      .set('X-CSRF-Token', admin.csrf)
      .set('Idempotency-Key', `csrf-branch1-${Date.now()}`)
      .send({
        name: 'CSRF Branch Project',
        slug: `csrf-br-${Date.now()}`,
        repoPath: REPO_PATH,
        targetBranch: 'main',
        testCommand: 'echo ok',
        maintainerUserIds: [],
        developerUserIds: [String(developer.user._id)],
      });
    expect(proj.status).toBe(201);
    resetRateLimitBucketsForTests();

    const branchRes = await request(app)
      .post(`/api/projects/${proj.body.project.id}/branches`)
      .set('Cookie', admin.cookies.join('; '))
      // intentionally omit X-CSRF-Token
      .send({ branchName: 'feature/csrf-test', ownerUserId: String(developer.user._id) });

    expect(branchRes.status).toBe(403);
    expect(branchRes.body.error.code).toBe('CSRF_TOKEN_INVALID');
  });
});
