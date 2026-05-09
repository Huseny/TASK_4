import { spawn } from 'node:child_process';
import treeKill from 'tree-kill';

const LOG_BUDGET_BYTES = 2 * 1024 * 1024; // 2 MB shared budget

export interface TestRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  logsTruncated: boolean;
  durationMs: number;
}

/**
 * Run `testCommand` in `workspaceDir` with a shared 2 MB stdout+stderr budget.
 * On cancel, the `cancelSignal` AbortController can be used to kill the process.
 */
export function runTests(
  testCommand: string,
  workspaceDir: string,
  timeoutMs: number,
  cancelSignal?: AbortController,
): Promise<TestRunResult> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let stdoutBuf = '';
    let stderrBuf = '';
    let bytesUsed = 0;
    let logsTruncated = false;

    const child = spawn(testCommand, {
      shell: true,
      cwd: workspaceDir,
      env: sanitizeEnv(),
      detached: false,
    });

    const appendLog = (chunk: string, target: 'stdout' | 'stderr'): void => {
      if (logsTruncated) return;
      const available = LOG_BUDGET_BYTES - bytesUsed;
      if (available <= 0) {
        logsTruncated = true;
        return;
      }
      const bytes = Buffer.byteLength(chunk, 'utf8');
      if (bytes > available) {
        const truncated = chunk.slice(0, available);
        if (target === 'stdout') stdoutBuf += truncated;
        else stderrBuf += truncated;
        bytesUsed += available;
        logsTruncated = true;
      } else {
        if (target === 'stdout') stdoutBuf += chunk;
        else stderrBuf += chunk;
        bytesUsed += bytes;
      }
    };

    child.stdout?.on('data', (data: Buffer) => appendLog(data.toString(), 'stdout'));
    child.stderr?.on('data', (data: Buffer) => appendLog(data.toString(), 'stderr'));

    const timeoutHandle = setTimeout(() => {
      if (child.pid) treeKill(child.pid, 'SIGKILL');
    }, timeoutMs);

    if (cancelSignal) {
      cancelSignal.signal.addEventListener('abort', () => {
        if (child.pid) treeKill(child.pid, 'SIGKILL');
      });
    }

    child.on('error', (err) => {
      clearTimeout(timeoutHandle);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timeoutHandle);
      resolve({
        exitCode: code ?? 1,
        stdout: stdoutBuf,
        stderr: stderrBuf,
        logsTruncated,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

function sanitizeEnv(): Record<string, string> {
  const safe: Record<string, string> = {};
  const allow = [
    'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'TEMP', 'TMP',
    'LANG', 'LC_ALL', 'LC_CTYPE',
    'NODE_VERSION', 'NVM_DIR',
    'JAVA_HOME', 'MAVEN_HOME', 'GRADLE_HOME',
    'GOROOT', 'GOPATH',
  ];
  for (const key of allow) {
    if (process.env[key] !== undefined) {
      safe[key] = process.env[key]!;
    }
  }
  return safe;
}
