import path from 'node:path';
import fs from 'node:fs/promises';
import { PipelineRun, RunStatus } from '../db/models/pipelineRunModel';
import { Project } from '../db/models/projectModel';
import { TrackedBranch } from '../db/models/trackedBranchModel';
import { getConfig } from '../config';
import { logger } from '../shared/logger';
import {
  cloneRepo,
  fetchAll,
  checkoutBranch,
  attemptMerge,
  hasStagedChanges,
  commitMerge,
  pushToOrigin,
  getHeadSha,
  getFileDiff,
  removeWorkspace,
} from './git/gitService';
import { parseAllConflicts } from './git/conflictParser';
import { runTests } from './shell/testRunner';
import { createNotification } from '../notifications/notificationsService';
import { writeAudit } from '../audit/auditService';
import { AuditActionType, AuditResourceType, AuditOutcome } from '../db/models/auditEventModel';

const cancelControllers = new Map<string, AbortController>();

let workerInterval: ReturnType<typeof setInterval> | null = null;

// Serializes claim phase across overlapping tick() invocations so that
// the (count + claim) sequence cannot interleave and over-subscribe past
// the configured max concurrency. Single Node process model — see
// docs/architecture.md.
let claimChain: Promise<void> = Promise.resolve();

export function cancelRun(runId: string): void {
  cancelControllers.get(runId)?.abort();
}

export function startWorker(): void {
  workerInterval = setInterval(() => void tick(), 2000);
  logger().info('Pipeline worker started');
}

export function stopWorker(): void {
  if (workerInterval) clearInterval(workerInterval);
  workerInterval = null;
}

/**
 * Atomically claims as many QUEUED runs as fit under the maxConcurrent cap.
 * Serialized across overlapping callers so the (count + claim) pair cannot
 * interleave and over-subscribe. Exported for tests.
 */
export async function claimRunsForCapacity(): Promise<InstanceType<typeof PipelineRun>[]> {
  const claimed: InstanceType<typeof PipelineRun>[] = [];
  const next = claimChain.then(async () => {
    const cfg = getConfig();
    const runningCount = await PipelineRun.countDocuments({ status: RunStatus.RUNNING });
    const slots = cfg.pipeline.maxConcurrent - runningCount;
    if (slots <= 0) return;

    for (let i = 0; i < slots; i++) {
      const run = await PipelineRun.findOneAndUpdate(
        { status: RunStatus.QUEUED },
        { $set: { status: RunStatus.RUNNING, startedAt: new Date() } },
        { sort: { queueSequence: 1 }, new: true },
      );
      if (!run) break;
      claimed.push(run);
    }
  });
  claimChain = next.catch((err) => {
    logger().error({ err }, 'tick claim phase failed');
  });
  await claimChain;
  return claimed;
}

export async function tick(): Promise<void> {
  const claimed = await claimRunsForCapacity();
  for (const run of claimed) void processRun(run);
}

async function processRun(run: InstanceType<typeof PipelineRun>): Promise<void> {
  const cfg = getConfig();
  const runId = String(run._id);
  const cancelCtrl = new AbortController();
  cancelControllers.set(runId, cancelCtrl);

  const project = await Project.findById(run.projectId).lean();
  if (!project) {
    await finalizeRun(runId, RunStatus.FAILED, { errorMessage: 'Project not found' });
    cancelControllers.delete(runId);
    return;
  }

  const workspaceDir = path.join(cfg.pipeline.workspaceRoot, runId);

  try {
    await fs.mkdir(workspaceDir, { recursive: true });
    await run.updateOne({ workspacePath: workspaceDir });

    await cloneRepo(project.repoPath, workspaceDir);
    await fetchAll(workspaceDir);
    await checkoutBranch(workspaceDir, project.targetBranch);

    const mergeResult = await attemptMerge(workspaceDir, run.sourceBranch, project.targetBranch);

    if (!mergeResult.success) {
      // Parse conflicts
      const diffsByFile = new Map<string, string>();
      for (const f of mergeResult.conflictedFiles) {
        const diff = await getFileDiff(workspaceDir, f);
        diffsByFile.set(f, diff);
      }
      const conflicts = parseAllConflicts(mergeResult.conflictedFiles, diffsByFile);
      await finalizeRun(runId, RunStatus.CONFLICT, { conflicts, finishedAt: new Date() });

      await writeAudit({
        actionType: AuditActionType.PIPELINE_CONFLICT,
        resourceType: AuditResourceType.PIPELINE_RUN,
        resourceId: runId,
        projectId: String(run.projectId),
        outcome: AuditOutcome.FAILURE,
        metadata: { conflictedFiles: mergeResult.conflictedFiles },
      });

      // Notify branch owner
      const branch = await TrackedBranch.findOne({
        projectId: run.projectId,
        branchName: run.sourceBranch,
      }).lean();
      if (branch) {
        await createNotification({
          userId: String(branch.ownerUserId),
          projectId: String(run.projectId),
          pipelineRunId: runId,
          type: 'CONFLICT',
          title: 'Merge conflict detected',
          message: `Branch "${run.sourceBranch}" has merge conflicts in ${mergeResult.conflictedFiles.length} file(s).`,
        });
      }
      return;
    }

    // Check for cancellation before running tests
    const freshRun = await PipelineRun.findById(runId).lean();
    if (freshRun?.cancelRequested) {
      await finalizeRun(runId, RunStatus.CANCELLED, { finishedAt: new Date() });
      return;
    }

    // Run tests with retries
    let lastResult: ReturnType<typeof runTests> extends Promise<infer T> ? T : never;
    let passed = false;
    const maxAttempts = (project.autoRetryAttempts ?? 0) + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const freshCheck = await PipelineRun.findById(runId).lean();
      if (freshCheck?.cancelRequested) {
        await finalizeRun(runId, RunStatus.CANCELLED, { finishedAt: new Date() });
        return;
      }

      const attemptStart = new Date();
      lastResult = await runTests(
        project.testCommand,
        workspaceDir,
        cfg.pipeline.testTimeoutSeconds * 1000,
        cancelCtrl,
      );

      const attemptRecord = {
        attemptIndex: attempt,
        startedAt: attemptStart,
        finishedAt: new Date(),
        exitCode: lastResult.exitCode,
        stdout: lastResult.stdout,
        stderr: lastResult.stderr,
        logsTruncated: lastResult.logsTruncated,
        timedOut: false,
      };

      await PipelineRun.updateOne(
        { _id: runId },
        {
          $push: { attempts: attemptRecord },
          $set: {
            attemptCount: attempt + 1,
            logsTruncated: lastResult.logsTruncated,
          },
        },
      );

      if (lastResult.exitCode === 0) {
        passed = true;
        break;
      }
    }

    const finalStatus = passed ? RunStatus.PASSED : RunStatus.FAILED;
    let mergeCommitSha: string | null = null;
    if (passed) {
      const staged = await hasStagedChanges(workspaceDir);
      if (staged) {
        const commitMsg = `Merge branch '${run.sourceBranch}' into ${project.targetBranch}`;
        mergeCommitSha = await commitMerge(workspaceDir, commitMsg);
        await pushToOrigin(workspaceDir, project.targetBranch);
      } else {
        // Fast-forward or already up-to-date — record current HEAD as the merge commit
        mergeCommitSha = await getHeadSha(workspaceDir);
      }
    }
    await finalizeRun(runId, finalStatus, { mergeCommitSha, finishedAt: new Date() });

    if (finalStatus === RunStatus.FAILED) {
      await writeAudit({
        actionType: AuditActionType.PIPELINE_TEST_FAILURE,
        resourceType: AuditResourceType.PIPELINE_RUN,
        resourceId: runId,
        projectId: String(run.projectId),
        outcome: AuditOutcome.FAILURE,
      });

      // Notify branch owner and triggering user
      const branch = await TrackedBranch.findOne({
        projectId: run.projectId,
        branchName: run.sourceBranch,
      }).lean();

      const notifyUserIds = new Set<string>();
      if (branch) notifyUserIds.add(String(branch.ownerUserId));
      if (run.triggeredByUserId) notifyUserIds.add(String(run.triggeredByUserId));

      for (const uid of notifyUserIds) {
        await createNotification({
          userId: uid,
          projectId: String(run.projectId),
          pipelineRunId: runId,
          type: 'FAILURE',
          title: 'Tests failed',
          message: `Tests failed for branch "${run.sourceBranch}".`,
        });
      }
    }
  } catch (err) {
    const cancelCheck = await PipelineRun.findById(runId).lean();
    if (cancelCheck?.cancelRequested) {
      await finalizeRun(runId, RunStatus.CANCELLED, { finishedAt: new Date() });
    } else {
      logger().error({ err, runId }, 'Pipeline run failed with unhandled error');
      await finalizeRun(runId, RunStatus.FAILED, {
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        finishedAt: new Date(),
      });
    }
  } finally {
    cancelControllers.delete(runId);
    try {
      await removeWorkspace(workspaceDir);
    } catch (err) {
      logger().error({ err, runId, workspaceDir }, 'workspace cleanup failed');
      await writeAudit({
        actionType: AuditActionType.PIPELINE_WORKSPACE_CLEANUP_FAILED,
        resourceType: AuditResourceType.PIPELINE_RUN,
        resourceId: runId,
        metadata: { workspaceDir },
        outcome: AuditOutcome.FAILURE,
      });
    }
  }
}

async function finalizeRun(
  runId: string,
  status: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await PipelineRun.updateOne({ _id: runId }, { $set: { status, finishedAt: new Date(), ...extra } });
}
