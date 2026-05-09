import { PipelineRun, RunStatus, TriggerType, nextQueueSequence } from '../db/models/pipelineRunModel';
import { errors } from '../shared/errors';
import { getConfig } from '../config';
import { writeAudit } from '../audit/auditService';
import { AuditActionType, AuditResourceType, AuditOutcome } from '../db/models/auditEventModel';
import { pruneRunsForProject } from './retention';
import type { AppError } from '../shared/errors';

export interface EnqueueParams {
  projectId: string;
  sourceBranch: string;
  sourceCommitSha: string | null;
  targetBranch: string;
  triggerType: 'MANUAL' | 'MONITOR';
  triggeredByUserId?: string | null;
  requestId?: string | null;
}

/**
 * Enqueue a new pipeline run. Enforces:
 *  - Deduplicate: same project+branch+sha with QUEUED or RUNNING status → no-op returns existing
 *  - Queue cap: max 50 QUEUED runs total before rejecting
 */
export async function enqueueRun(params: EnqueueParams): Promise<InstanceType<typeof PipelineRun> | AppError> {
  const cfg = getConfig();

  // Deduplicate by (project, branch, sha, status in {QUEUED, RUNNING})
  if (params.sourceCommitSha) {
    const dup = await PipelineRun.findOne({
      projectId: params.projectId,
      sourceBranch: params.sourceBranch,
      sourceCommitSha: params.sourceCommitSha,
      status: { $in: [RunStatus.QUEUED, RunStatus.RUNNING] },
    }).lean();
    if (dup) return dup as unknown as InstanceType<typeof PipelineRun>;
  }

  // Cap: count all QUEUED runs across all projects
  const queuedCount = await PipelineRun.countDocuments({ status: RunStatus.QUEUED });
  if (queuedCount >= cfg.pipeline.maxQueued) {
    if (params.requestId) {
      await writeAudit({
        actionType: AuditActionType.PIPELINE_QUEUE_FULL,
        resourceType: AuditResourceType.PIPELINE_RUN,
        projectId: params.projectId,
        actorUserId: params.triggeredByUserId ?? null,
        outcome: AuditOutcome.FAILURE,
        metadata: { queuedCount },
        requestId: params.requestId,
      });
    }
    return errors.pipelineQueueFull();
  }

  const seq = await nextQueueSequence();
  const run = await PipelineRun.create({
    projectId: params.projectId,
    sourceBranch: params.sourceBranch,
    sourceCommitSha: params.sourceCommitSha,
    targetBranch: params.targetBranch,
    triggerType: params.triggerType,
    triggeredByUserId: params.triggeredByUserId ?? null,
    status: RunStatus.QUEUED,
    queuedAt: new Date(),
    queueSequence: seq,
  });

  if (params.triggerType === TriggerType.MANUAL) {
    await writeAudit({
      actionType: AuditActionType.PIPELINE_TRIGGER,
      resourceType: AuditResourceType.PIPELINE_RUN,
      resourceId: String(run._id),
      projectId: params.projectId,
      actorUserId: params.triggeredByUserId ?? null,
      metadata: { sourceBranch: params.sourceBranch, sourceCommitSha: params.sourceCommitSha },
      requestId: params.requestId ?? null,
    });
  } else {
    await writeAudit({
      actionType: AuditActionType.PIPELINE_SCHEDULER_ENQUEUE,
      resourceType: AuditResourceType.PIPELINE_RUN,
      resourceId: String(run._id),
      projectId: params.projectId,
      metadata: { sourceBranch: params.sourceBranch, sourceCommitSha: params.sourceCommitSha },
    });
  }

  // Prune old runs for this project after insertion (fire-and-forget)
  void pruneRunsForProject(params.projectId);

  return run;
}

export { pruneRunsForProject };
