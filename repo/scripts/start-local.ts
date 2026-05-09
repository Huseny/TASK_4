import path from 'node:path';
import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const ROOT = path.resolve(__dirname, '..');
const CLIENT_DIR = path.join(ROOT, 'app', 'client');
const CLIENT_DIST = path.join(CLIENT_DIR, 'dist');
const SERVER_ENTRY = path.join(ROOT, 'app', 'server', 'src', 'index.ts');

function requireEnv(name: string): void {
  if (!process.env[name]) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
}

function checkEnv(): void {
  requireEnv('MONGO_URI');
  requireEnv('JWT_SECRET');
  requireEnv('MS_ALLOWED_REPO_ROOTS');
  requireEnv('MS_WORKSPACE_ROOT');
}

function buildClient(): void {
  if (!existsSync(CLIENT_DIST)) {
    console.log('Building client bundle...');
    execSync('npm run build', { cwd: CLIENT_DIR, stdio: 'inherit' });
  } else {
    console.log('Client dist already exists — skipping build (delete dist/ to rebuild).');
  }
}

function startServer(): void {
  console.log('Starting MergeStream server (tsx)...');
  const child = spawn(
    'npx',
    ['tsx', SERVER_ENTRY],
    {
      stdio: 'inherit',
      env: { ...process.env, CLIENT_DIST },
      shell: process.platform === 'win32',
    },
  );

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      child.kill(sig);
      process.exit(0);
    });
  }

  child.on('exit', (code) => process.exit(code ?? 0));
}

checkEnv();
buildClient();
startServer();
