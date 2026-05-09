import { MongoMemoryServer } from 'mongodb-memory-server';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export default async function globalSetup(): Promise<void> {
  const mem = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
  const uri = mem.getUri('mergestream_test');
  process.env.MS_MONGO_URL = uri;
  process.env.NODE_ENV = 'test';
  process.env.MS_JWT_ACCESS_SECRET = 'test-access-secret-test-access-secret-32bytes';
  process.env.MS_JWT_REFRESH_SECRET = 'test-refresh-secret-test-refresh-secret-32bytes';
  process.env.MS_BCRYPT_ROUNDS = '4';
  process.env.MS_ALLOWED_REPO_ROOTS = './fixtures/repos';
  process.env.MS_WORKSPACE_ROOT = './.tmp/workspaces';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__MS_MEM__ = mem;

  // Create a real bare git repo so integration tests pass the isBareGitRepo check.
  const repoRoot = path.resolve(process.cwd(), 'fixtures/repos');
  const testRepoPath = path.join(repoRoot, 'test-proj.git');
  if (!fs.existsSync(testRepoPath)) {
    fs.mkdirSync(testRepoPath, { recursive: true });
    spawnSync('git', ['init', '--bare', testRepoPath], { stdio: 'ignore' });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).__MS_TEST_REPO_PATH__ = testRepoPath;
}
