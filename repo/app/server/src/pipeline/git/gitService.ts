import path from 'node:path';
import fs from 'node:fs/promises';
import execa from 'execa';

export interface GitRef {
  sha: string;
  ref: string;
}

export async function listRemoteRefs(repoPath: string): Promise<GitRef[]> {
  const result = await execa('git', ['ls-remote', '--heads', repoPath], { reject: true });
  return result.stdout
    .split('\n')
    .filter(Boolean)
    .map((line: string) => {
      const [sha, ref] = line.split('\t');
      return { sha: sha.trim(), ref: ref.trim() };
    });
}

export async function getLocalRef(repoPath: string, branch: string): Promise<string | null> {
  try {
    const result = await execa('git', ['show-ref', '--verify', `refs/heads/${branch}`], {
      cwd: repoPath,
      reject: true,
    });
    return result.stdout.split(' ')[0].trim();
  } catch {
    return null;
  }
}

export async function cloneRepo(repoPath: string, workspaceDir: string): Promise<void> {
  await fs.mkdir(workspaceDir, { recursive: true });
  await execa('git', ['clone', '--no-hardlinks', repoPath, workspaceDir], { reject: true });
}

export async function fetchAll(workspaceDir: string): Promise<void> {
  await execa('git', ['fetch', '--all'], { cwd: workspaceDir, reject: true });
}

/**
 * Validates a branch/ref name using git's own check-ref-format.
 * Throws if the name is not a valid git ref.
 */
export async function validateRefName(ref: string): Promise<void> {
  const result = await execa('git', ['check-ref-format', '--branch', ref], { reject: false });
  if (result.exitCode !== 0) {
    throw new Error(`Invalid git ref name: ${ref}`);
  }
}

export async function checkoutBranch(workspaceDir: string, branch: string): Promise<void> {
  await validateRefName(branch);
  // `git switch -- <branch>` treats the operand as a branch name, not an option (git ≥ 2.23).
  await execa('git', ['switch', '--', branch], { cwd: workspaceDir, reject: true });
}

export interface MergeResult {
  success: boolean;
  mergeCommitSha?: string;
  conflictedFiles: string[];
}

export async function attemptMerge(workspaceDir: string, sourceBranch: string, targetBranch: string): Promise<MergeResult> {
  await validateRefName(sourceBranch);
  await validateRefName(targetBranch);
  // Start on target branch; `git switch -- <branch>` treats operand as branch name, not option.
  await execa('git', ['switch', '--', targetBranch], { cwd: workspaceDir, reject: true });

  try {
    await execa('git', ['merge', '--no-commit', '--no-ff', `origin/${sourceBranch}`], {
      cwd: workspaceDir,
      reject: true,
    });
    // Merge succeeded with no conflicts
    return { success: true, conflictedFiles: [] };
  } catch {
    // Check for conflicts
    const conflictResult = await execa(
      'git',
      ['diff', '--name-only', '--diff-filter=U'],
      { cwd: workspaceDir, reject: false },
    );
    const conflictedFiles = conflictResult.stdout.split('\n').filter(Boolean);
    if (conflictedFiles.length > 0) {
      return { success: false, conflictedFiles };
    }
    // Some other error — re-throw
    throw new Error('Merge failed without conflict markers');
  }
}

export async function getHeadSha(workspaceDir: string): Promise<string> {
  const result = await execa('git', ['rev-parse', 'HEAD'], { cwd: workspaceDir, reject: true });
  return result.stdout.trim();
}

export async function getFileDiff(workspaceDir: string, filePath: string): Promise<string> {
  const result = await execa(
    'git',
    ['diff', '--unified=0', filePath],
    { cwd: workspaceDir, reject: false },
  );
  return result.stdout;
}

export async function hasStagedChanges(workspaceDir: string): Promise<boolean> {
  const result = await execa('git', ['diff', '--cached', '--quiet'], { cwd: workspaceDir, reject: false });
  return result.exitCode !== 0;
}

export async function commitMerge(workspaceDir: string, message: string): Promise<string> {
  await execa('git', [
    '-c', 'user.name=MergeStream',
    '-c', 'user.email=mergestream@local',
    'commit', '-m', message,
  ], { cwd: workspaceDir, reject: true });
  const result = await execa('git', ['rev-parse', 'HEAD'], { cwd: workspaceDir, reject: true });
  return result.stdout.trim();
}

export async function pushToOrigin(workspaceDir: string, branch: string): Promise<void> {
  await execa('git', ['push', 'origin', branch], { cwd: workspaceDir, reject: true });
}

export async function removeWorkspace(workspaceDir: string): Promise<void> {
  try {
    await fs.rm(workspaceDir, { recursive: true, force: true });
  } catch {
    // Non-fatal — log outside
  }
}
