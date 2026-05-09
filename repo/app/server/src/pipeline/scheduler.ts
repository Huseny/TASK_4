import { Project } from '../db/models/projectModel';
import { TrackedBranch } from '../db/models/trackedBranchModel';
import { logger } from '../shared/logger';
import { listRemoteRefs } from './git/gitService';
import { enqueueRun } from './queue';
import { AppError } from '../shared/errors';

// NOTE: The scheduler does NOT auto-register remote branches. New branches
// must be added explicitly via the Tracked Branches UI so that an owner is
// chosen and project-membership ownership stays intact. See
// docs/requirements-matrix.md row 1a.

const projectTimers = new Map<string, ReturnType<typeof setInterval>>();

export function startScheduler(): void {
  void bootstrapScheduler();
  logger().info('Pipeline scheduler started');
}

export function stopScheduler(): void {
  for (const [id, timer] of projectTimers) {
    clearInterval(timer);
    projectTimers.delete(id);
  }
}

async function bootstrapScheduler(): Promise<void> {
  try {
    const projects = await Project.find({ isActive: true }).lean();
    for (const p of projects) {
      scheduleProject(String(p._id), p.pollIntervalSeconds);
    }
  } catch (err) {
    logger().error({ err }, 'scheduler bootstrap failed');
  }
}

export function scheduleProject(projectId: string, pollIntervalSeconds: number): void {
  if (projectTimers.has(projectId)) {
    clearInterval(projectTimers.get(projectId)!);
  }
  const timer = setInterval(() => void pollProject(projectId), pollIntervalSeconds * 1000);
  projectTimers.set(projectId, timer);
}

export function unscheduleProject(projectId: string): void {
  const timer = projectTimers.get(projectId);
  if (timer) {
    clearInterval(timer);
    projectTimers.delete(projectId);
  }
}

async function pollProject(projectId: string): Promise<void> {
  try {
    const project = await Project.findById(projectId).lean();
    if (!project || !project.isActive) {
      unscheduleProject(projectId);
      return;
    }

    const remoteRefs = await listRemoteRefs(project.repoPath);
    const refMap = new Map<string, string>();
    for (const r of remoteRefs) {
      const branchName = r.ref.replace('refs/heads/', '');
      refMap.set(branchName, r.sha);
    }

    const branches = await TrackedBranch.find({ projectId, isActive: true }).lean();

    for (const branch of branches) {
      const remoteSha = refMap.get(branch.branchName);
      if (!remoteSha) continue;
      if (remoteSha === branch.lastSeenCommitSha) continue;

      // New commit seen — enqueue
      const result = await enqueueRun({
        projectId,
        sourceBranch: branch.branchName,
        sourceCommitSha: remoteSha,
        targetBranch: project.targetBranch,
        triggerType: 'MONITOR',
      });

      if (!(result instanceof AppError)) {
        // Update lastSeenCommitSha
        await TrackedBranch.updateOne({ _id: branch._id }, { $set: { lastSeenCommitSha: remoteSha } });
      }
    }
  } catch (err) {
    logger().error({ err, projectId }, 'scheduler poll failed');
  }
}
