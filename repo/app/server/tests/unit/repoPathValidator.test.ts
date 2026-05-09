import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { resetConfigForTests } from '../../src/config';

beforeEach(() => {
  resetConfigForTests();
});

afterEach(() => {
  resetConfigForTests();
});

describe('resolveUnderAllowedRoot', () => {
  it('accepts a path under an allowed root', () => {
    const root = path.resolve('./fixtures/repos');
    process.env.MS_ALLOWED_REPO_ROOTS = root;
    const { resolveUnderAllowedRoot } = require('../../src/projects/repoPathValidator');
    const result = resolveUnderAllowedRoot(path.join(root, 'my-project'));
    expect(result).not.toBeNull();
    expect(result!.root).toBe(root);
  });

  it('rejects a path outside allowed roots', () => {
    process.env.MS_ALLOWED_REPO_ROOTS = path.resolve('./fixtures/repos');
    const { resolveUnderAllowedRoot } = require('../../src/projects/repoPathValidator');
    const result = resolveUnderAllowedRoot('/tmp/evil-repo');
    expect(result).toBeNull();
  });

  it('rejects traversal attempts', () => {
    const root = path.resolve('./fixtures/repos');
    process.env.MS_ALLOWED_REPO_ROOTS = root;
    const { resolveUnderAllowedRoot } = require('../../src/projects/repoPathValidator');
    const result = resolveUnderAllowedRoot(path.join(root, '..', '..', 'etc', 'passwd'));
    expect(result).toBeNull();
  });
});

describe('isBareGitRepo', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns true for a real bare git repo', () => {
    const repoPath = path.join(tmpDir, 'test.git');
    fs.mkdirSync(repoPath);
    spawnSync('git', ['init', '--bare', repoPath], { stdio: 'ignore' });
    const { isBareGitRepo } = require('../../src/projects/repoPathValidator');
    expect(isBareGitRepo(repoPath)).toBe(true);
  });

  it('returns false for a non-existent path', () => {
    const { isBareGitRepo } = require('../../src/projects/repoPathValidator');
    expect(isBareGitRepo(path.join(tmpDir, 'does-not-exist'))).toBe(false);
  });

  it('returns false for a plain directory (no git internals)', () => {
    const plainDir = path.join(tmpDir, 'plain');
    fs.mkdirSync(plainDir);
    const { isBareGitRepo } = require('../../src/projects/repoPathValidator');
    expect(isBareGitRepo(plainDir)).toBe(false);
  });

  it('returns false for a regular (non-bare) git repo', () => {
    const repoPath = path.join(tmpDir, 'non-bare');
    fs.mkdirSync(repoPath);
    spawnSync('git', ['init', repoPath], { stdio: 'ignore' });
    const { isBareGitRepo } = require('../../src/projects/repoPathValidator');
    // Non-bare repos store HEAD inside .git/, not at root
    expect(isBareGitRepo(repoPath)).toBe(false);
  });
});
