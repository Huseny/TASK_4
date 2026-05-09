import path from 'node:path';
import fs from 'node:fs';
import { getConfig } from '../config';

/**
 * Validates that `repoPath` resolves to a directory under one of the
 * configured allow-listed repo roots. Prevents path-traversal attacks.
 */
export function resolveUnderAllowedRoot(repoPath: string): { resolved: string; root: string } | null {
  const cfg = getConfig();
  const resolved = path.resolve(repoPath);
  for (const root of cfg.pipeline.allowedRepoRoots) {
    const rel = path.relative(root, resolved);
    // rel must not start with '..' and must not be an absolute path
    if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
      return { resolved, root };
    }
  }
  return null;
}

/**
 * Returns true if `resolved` looks like a bare git repository.
 * A bare repo has HEAD and objects/ at the root.
 */
export function isBareGitRepo(resolved: string): boolean {
  return fs.existsSync(path.join(resolved, 'HEAD')) && fs.existsSync(path.join(resolved, 'objects'));
}
