import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Project } from '../db/models/projectModel';
import { PipelineRun, RunStatus } from '../db/models/pipelineRunModel';
import { errors, AppError } from '../shared/errors';
import { toRunDto } from '../shared/dto';
import { enqueueRun } from './queue';
import { cancelRun } from './worker';
import { writeAudit } from '../audit/auditService';
import { AuditActionType, AuditResourceType } from '../db/models/auditEventModel';
import { getConfig } from '../config';
import type { AuthenticatedRequest } from '../shared/types';

export async function triggerRunHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = (req as AuthenticatedRequest).auth!;
    const project = await Project.findById(req.params.projectId).lean();
    if (!project) return next(errors.projectNotFound());
    const { sourceBranch } = req.body as { sourceBranch: string };
    const result = await enqueueRun({
      projectId: String(project._id),
      sourceBranch,
      sourceCommitSha: null,
      targetBranch: project.targetBranch,
      triggerType: 'MANUAL',
      triggeredByUserId: auth.userId,
      requestId: (req as AuthenticatedRequest).requestId ?? null,
    });
    if (result instanceof AppError) return next(result);
    res.status(201).json({ run: toRunDto(result as unknown as Parameters<typeof toRunDto>[0]) });
  } catch (err) {
    next(err);
  }
}

export async function listRunsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cfg = getConfig();
    const limit = Math.min(Number(req.query.limit) || cfg.pipeline.historyDefaultLimit, 200);
    const runs = await PipelineRun.find({ projectId: req.params.projectId })
      .sort({ queueSequence: -1 })
      .limit(limit)
      .lean();
    res.json({ runs: runs.map((r) => toRunDto(r)) });
  } catch (err) {
    next(err);
  }
}

export async function getRunHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const run = await PipelineRun.findOne({
      _id: req.params.runId,
      projectId: req.params.projectId,
    }).lean();
    if (!run) return next(errors.runNotFound());
    res.json({ run: toRunDto(run, true) });
  } catch (err) {
    next(err);
  }
}

export async function cancelRunHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = (req as AuthenticatedRequest).auth!;
    const run = await PipelineRun.findOne({
      _id: req.params.runId,
      projectId: req.params.projectId,
    });
    if (!run) return next(errors.runNotFound());

    if (run.status === RunStatus.QUEUED) {
      run.status = RunStatus.CANCELLED;
      run.finishedAt = new Date();
      await run.save();
    } else if (run.status === RunStatus.RUNNING) {
      run.cancelRequested = true;
      await run.save();
      cancelRun(String(run._id));
    } else {
      return next(errors.runStateInvalid('Run is already in a terminal state and cannot be cancelled.'));
    }

    await writeAudit({
      actionType: AuditActionType.PIPELINE_CANCEL,
      resourceType: AuditResourceType.PIPELINE_RUN,
      resourceId: String(run._id),
      projectId: String(run.projectId),
      actorUserId: auth.userId,
      actorUsername: auth.username,
      requestId: (req as AuthenticatedRequest).requestId ?? null,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

export async function getDashboardHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = (req as AuthenticatedRequest).auth!;

    let projectQuery: Record<string, unknown> = {};
    if (auth.role !== 'ADMIN') {
      const uid = new mongoose.Types.ObjectId(auth.userId);
      projectQuery = { $or: [{ maintainerUserIds: uid }, { developerUserIds: uid }] };
    }

    const projects = await Project.find(projectQuery).lean();
    const projectIds = projects.map((p) => p._id);

    const latestRuns = await PipelineRun.aggregate([
      { $match: { projectId: { $in: projectIds } } },
      { $sort: { queueSequence: -1 } },
      { $group: { _id: '$projectId', run: { $first: '$$ROOT' } } },
    ]);

    const runByProject: Record<string, unknown> = {};
    for (const entry of latestRuns) {
      runByProject[String(entry._id)] = entry.run;
    }

    const queuedCount = await PipelineRun.countDocuments({ status: RunStatus.QUEUED, projectId: { $in: projectIds } });
    const runningCount = await PipelineRun.countDocuments({ status: RunStatus.RUNNING, projectId: { $in: projectIds } });

    const summary = projects.map((p) => {
      const latestRun = runByProject[String(p._id)];
      return {
        projectId: String(p._id),
        name: p.name,
        slug: p.slug,
        isActive: p.isActive,
        latestRun: latestRun ? toRunDto(latestRun as Parameters<typeof toRunDto>[0]) : null,
      };
    });

    res.json({ projects: summary, queue: { queued: queuedCount, running: runningCount } });
  } catch (err) {
    next(err);
  }
}
