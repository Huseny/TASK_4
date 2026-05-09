/**
 * Create a local bare Git repository under fixtures/repos/ with three
 * pre-populated branches that the seed script expects:
 *   - main              — the configured target branch
 *   - feature/green     — merges cleanly, tests pass
 *   - feature/conflict  — conflicts with main on README.md
 *   - feature/failing   — merges cleanly, tests fail (exit 1)
 *
 * Safe to re-run: if the bare repo already exists it is left alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execa } from 'execa';
import { getConfig } from '../app/server/src/config';

async function gitRun(args: string[], cwd: string): Promise<void> {
  await execa('git', args, { cwd, stdio: 'inherit' });
}

async function main(): Promise<void> {
  const cfg = getConfig();
  const root = cfg.pipeline.allowedRepoRoots[0];
  fs.mkdirSync(root, { recursive: true });

  const bareRepo = path.resolve(root, 'sample-service.git');
  if (fs.existsSync(bareRepo)) {
    // eslint-disable-next-line no-console
    console.log(`Sample bare repo already exists at ${bareRepo} — skipping.`);
    return;
  }

  await execa('git', ['init', '--bare', bareRepo], { stdio: 'inherit' });

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ms-seed-'));
  try {
    await execa('git', ['clone', bareRepo, scratch], { stdio: 'inherit' });
    await gitRun(['config', 'user.email', 'seed@mergestream.local'], scratch);
    await gitRun(['config', 'user.name', 'MergeStream Seed'], scratch);
    await gitRun(['checkout', '-b', 'main'], scratch);

    fs.writeFileSync(
      path.join(scratch, 'README.md'),
      '# Sample Service\n\nInitial main-branch content.\n',
    );
    fs.writeFileSync(
      path.join(scratch, 'package.json'),
      JSON.stringify({ name: 'sample-service', version: '0.0.1', scripts: { test: "node -e \"console.log('ok')\"" } }, null, 2) + '\n',
    );
    await gitRun(['add', '.'], scratch);
    await gitRun(['commit', '-m', 'initial commit'], scratch);
    await gitRun(['push', '-u', 'origin', 'main'], scratch);

    // Green branch: adds a new file, merges cleanly.
    await gitRun(['checkout', '-b', 'feature/green'], scratch);
    fs.writeFileSync(path.join(scratch, 'GREEN.md'), 'green branch content\n');
    await gitRun(['add', '.'], scratch);
    await gitRun(['commit', '-m', 'green: add GREEN.md'], scratch);
    await gitRun(['push', '-u', 'origin', 'feature/green'], scratch);

    // Conflict branch: edits README.md so it collides with future main edits.
    await gitRun(['checkout', 'main'], scratch);
    await gitRun(['checkout', '-b', 'feature/conflict'], scratch);
    fs.writeFileSync(
      path.join(scratch, 'README.md'),
      '# Sample Service\n\nFEATURE BRANCH REWRITE OF INTRO.\n',
    );
    await gitRun(['add', '.'], scratch);
    await gitRun(['commit', '-m', 'conflict: rewrite readme intro'], scratch);
    await gitRun(['push', '-u', 'origin', 'feature/conflict'], scratch);

    // Make a divergent main so conflict branch actually conflicts.
    await gitRun(['checkout', 'main'], scratch);
    fs.writeFileSync(
      path.join(scratch, 'README.md'),
      '# Sample Service\n\nMAIN BRANCH UPDATED INTRO.\n',
    );
    await gitRun(['add', '.'], scratch);
    await gitRun(['commit', '-m', 'main: rewrite readme intro'], scratch);
    await gitRun(['push', 'origin', 'main'], scratch);

    // Failing branch: test command exits 1.
    await gitRun(['checkout', '-b', 'feature/failing'], scratch);
    fs.writeFileSync(path.join(scratch, 'FAIL.md'), 'failing branch content\n');
    await gitRun(['add', '.'], scratch);
    await gitRun(['commit', '-m', 'failing: add FAIL.md'], scratch);
    await gitRun(['push', '-u', 'origin', 'feature/failing'], scratch);

    // eslint-disable-next-line no-console
    console.log(`Created sample bare repo at ${bareRepo}`);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
