import type { MongoMemoryServer } from 'mongodb-memory-server';
import fs from 'node:fs';

export default async function globalTeardown(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mem: MongoMemoryServer | undefined = (globalThis as any).__MS_MEM__;
  if (mem) await mem.stop();

  // Clean up the test bare git repo created in globalSetup.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const testRepoPath: string | undefined = (globalThis as any).__MS_TEST_REPO_PATH__;
  if (testRepoPath && fs.existsSync(testRepoPath)) {
    fs.rmSync(testRepoPath, { recursive: true, force: true });
  }
}
