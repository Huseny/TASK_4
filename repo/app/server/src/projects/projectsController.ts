import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { Project } from '../db/models/projectModel';
import { TrackedBranch } from '../db/models/trackedBranchModel';
import { User, UserRole } from '../db/models/userModel';
import { errors } from '../shared/errors';
import { toProjectDto, toTrackedBranchDto, toUserDto } from '../shared/dto';
import { resolveUnderAllowedRoot, isBareGitRepo } from './repoPathValidator';
import { scheduleProject, unscheduleProject } from '../pipeline/scheduler';
import { writeAudit } from '../audit/auditService';
import { AuditActionType, AuditResourceType } from '../db/models/auditEventModel';
import type { AuthenticatedRequest } from '../shared/types';

async function assertUsersExist(ids: string[]): Promise<string | null> {
  if (ids.length === 0) return null;
  const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
  const count = await User.countDocuments({ _id: { $in: objectIds } });
  if (count !== ids.length) return 'One or more referenced user IDs do not exist.';
  return null;
}

export async function listProjectsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = (req as AuthenticatedRequest).auth!;
    let query: Record<string, unknown> = {};
    if (auth.role !== UserRole.ADMIN) {
      query = {
        $or: [
          { maintainerUserIds: new mongoose.Types.ObjectId(auth.userId) },
          { developerUserIds: new mongoose.Types.ObjectId(auth.userId) },
        ],
      };
    }
    const projects = await Project.find(query).sort({ createdAt: -1 }).lean();
    res.json({ projects: projects.map(toProjectDto) });
  } catch (err) {
    next(err);
  }
}

export async function createProjectHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = (req as AuthenticatedRequest).auth!;
    const body = req.body as {
      name: string; slug: string; description: string; repoPath: string;
      targetBranch: string; testCommand: string; pollIntervalSeconds: number;
      autoRetryAttempts: number; maintainerUserIds: string[]; developerUserIds: string[];
    };

    const allowedRoot = resolveUnderAllowedRoot(body.repoPath);
    if (!allowedRoot) return next(errors.projectRepoPathForbidden());
    if (!isBareGitRepo(allowedRoot.resolved)) return next(errors.projectRepoPathForbidden());

    const allMemberIds = [...body.maintainerUserIds, ...body.developerUserIds];
    const memberErr = await assertUsersExist(allMemberIds);
    if (memberErr) return next(errors.validation(memberErr));

    const existing = await Project.findOne({ slug: body.slug });
    if (existing) return next(errors.conflict(`Slug '${body.slug}' is already in use.`));

    const project = await Project.create({
      ...body,
      repoPath: allowedRoot.resolved,
      allowedRepoRoot: allowedRoot.root,
      maintainerUserIds: body.maintainerUserIds.filter(Boolean),
      developerUserIds: body.developerUserIds.filter(Boolean),
      createdBy: new mongoose.Types.ObjectId(auth.userId),
      updatedBy: new mongoose.Types.ObjectId(auth.userId),
    });

    if (project.isActive) {
      scheduleProject(String(project._id), project.pollIntervalSeconds);
    }

    await writeAudit({
      actionType: AuditActionType.PROJECT_CREATE,
      resourceType: AuditResourceType.PROJECT,
      resourceId: String(project._id),
      projectId: String(project._id),
      actorUserId: auth.userId,
      actorUsername: auth.username,
      requestId: (req as AuthenticatedRequest).requestId ?? null,
    });
    res.status(201).json({ project: toProjectDto(project) });
  } catch (err) {
    next(err);
  }
}

export async function getProjectHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const project = await Project.findById(req.params.projectId).lean();
    if (!project) return next(errors.projectNotFound());
    res.json({ project: toProjectDto(project) });
  } catch (err) {
    next(err);
  }
}

export async function updateProjectHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = (req as AuthenticatedRequest).auth!;
    const project = await Project.findById(req.params.projectId);
    if (!project) return next(errors.projectNotFound());

    const updates = req.body as Partial<{
      name: string; description: string; repoPath: string; targetBranch: string;
      testCommand: string; pollIntervalSeconds: number; autoRetryAttempts: number;
      isActive: boolean; maintainerUserIds: string[]; developerUserIds: string[];
    }>;

    if (updates.repoPath !== undefined) {
      const allowedRoot = resolveUnderAllowedRoot(updates.repoPath);
      if (!allowedRoot) return next(errors.projectRepoPathForbidden());
      if (!isBareGitRepo(allowedRoot.resolved)) return next(errors.projectRepoPathForbidden());
      project.repoPath = allowedRoot.resolved;
      project.allowedRepoRoot = allowedRoot.root;
    }

    const changedIds = [
      ...(updates.maintainerUserIds ?? []),
      ...(updates.developerUserIds ?? []),
    ];
    const memberErr = await assertUsersExist(changedIds);
    if (memberErr) return next(errors.validation(memberErr));

    if (updates.name !== undefined) project.name = updates.name;
    if (updates.description !== undefined) project.description = updates.description;
    if (updates.targetBranch !== undefined) project.targetBranch = updates.targetBranch;
    if (updates.testCommand !== undefined) project.testCommand = updates.testCommand;
    if (updates.pollIntervalSeconds !== undefined) project.pollIntervalSeconds = updates.pollIntervalSeconds;
    if (updates.autoRetryAttempts !== undefined) project.autoRetryAttempts = updates.autoRetryAttempts;
    if (updates.isActive !== undefined) project.isActive = updates.isActive;
    if (updates.maintainerUserIds !== undefined) {
      project.maintainerUserIds = updates.maintainerUserIds
        .filter(Boolean)
        .map((id) => new mongoose.Types.ObjectId(id)) as unknown as typeof project.maintainerUserIds;
    }
    if (updates.developerUserIds !== undefined) {
      project.developerUserIds = updates.developerUserIds
        .filter(Boolean)
        .map((id) => new mongoose.Types.ObjectId(id)) as unknown as typeof project.developerUserIds;
    }
    project.updatedBy = new mongoose.Types.ObjectId(auth.userId) as unknown as typeof project.updatedBy;
    await project.save();

    const pid = String(project._id);
    if (project.isActive) {
      scheduleProject(pid, project.pollIntervalSeconds);
    } else {
      unscheduleProject(pid);
    }

    await writeAudit({
      actionType: AuditActionType.PROJECT_UPDATE,
      resourceType: AuditResourceType.PROJECT,
      resourceId: String(project._id),
      projectId: String(project._id),
      actorUserId: auth.userId,
      actorUsername: auth.username,
      requestId: (req as AuthenticatedRequest).requestId ?? null,
    });
    res.json({ project: toProjectDto(project) });
  } catch (err) {
    next(err);
  }
}

export async function getProjectMembersHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const project = await Project.findById(req.params.projectId).lean();
    if (!project) return next(errors.projectNotFound());
    const memberIds = [...project.maintainerUserIds, ...project.developerUserIds];
    const users = memberIds.length > 0 ? await User.find({ _id: { $in: memberIds } }).lean() : [];
    res.json({ users: users.map(toUserDto) });
  } catch (err) {
    next(err);
  }
}

// ---- Tracked Branch handlers ----

export async function listTrackedBranchesHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const branches = await TrackedBranch.find({ projectId: req.params.projectId }).sort({ createdAt: -1 }).lean();
    res.json({ branches: branches.map(toTrackedBranchDto) });
  } catch (err) {
    next(err);
  }
}

export async function createTrackedBranchHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = (req as AuthenticatedRequest).auth!;
    const { branchName, ownerUserId } = req.body as { branchName: string; ownerUserId: string };
    const projectId = req.params.projectId;

    const project = await Project.findById(projectId).lean();
    if (!project) return next(errors.projectNotFound());

    const ownerOid = new mongoose.Types.ObjectId(ownerUserId);
    const isMember =
      project.maintainerUserIds.some((id) => id.equals(ownerOid)) ||
      project.developerUserIds.some((id) => id.equals(ownerOid));
    if (!isMember) return next(errors.validation('ownerUserId must be a member (maintainer or developer) of the project.'));

    const existing = await TrackedBranch.findOne({ projectId, branchName });
    if (existing) return next(errors.conflict(`Branch '${branchName}' is already tracked.`));

    const branch = await TrackedBranch.create({
      projectId: new mongoose.Types.ObjectId(projectId),
      branchName,
      ownerUserId: new mongoose.Types.ObjectId(ownerUserId),
    });

    await writeAudit({
      actionType: AuditActionType.TRACKED_BRANCH_CREATE,
      resourceType: AuditResourceType.TRACKED_BRANCH,
      resourceId: String(branch._id),
      projectId,
      actorUserId: auth.userId,
      actorUsername: auth.username,
      requestId: (req as AuthenticatedRequest).requestId ?? null,
    });
    res.status(201).json({ branch: toTrackedBranchDto(branch) });
  } catch (err) {
    next(err);
  }
}

export async function updateTrackedBranchHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = (req as AuthenticatedRequest).auth!;
    const { branchId, projectId } = req.params;
    const branch = await TrackedBranch.findOne({ _id: branchId, projectId });
    if (!branch) return next(errors.branchNotFound());

    const updates = req.body as { isActive?: boolean; ownerUserId?: string };
    if (updates.isActive !== undefined) branch.isActive = updates.isActive;
    if (updates.ownerUserId !== undefined) {
      const project = await Project.findById(projectId).lean();
      if (!project) return next(errors.projectNotFound());
      const newOwnerOid = new mongoose.Types.ObjectId(updates.ownerUserId);
      const isMember =
        project.maintainerUserIds.some((id) => id.equals(newOwnerOid)) ||
        project.developerUserIds.some((id) => id.equals(newOwnerOid));
      if (!isMember) return next(errors.validation('ownerUserId must be a member (maintainer or developer) of the project.'));
      branch.ownerUserId = newOwnerOid as unknown as typeof branch.ownerUserId;
    }
    await branch.save();

    await writeAudit({
      actionType: AuditActionType.TRACKED_BRANCH_UPDATE,
      resourceType: AuditResourceType.TRACKED_BRANCH,
      resourceId: String(branch._id),
      projectId,
      actorUserId: auth.userId,
      actorUsername: auth.username,
      requestId: (req as AuthenticatedRequest).requestId ?? null,
    });
    res.json({ branch: toTrackedBranchDto(branch) });
  } catch (err) {
    next(err);
  }
}

export async function deleteTrackedBranchHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const auth = (req as AuthenticatedRequest).auth!;
    const { branchId, projectId } = req.params;
    const branch = await TrackedBranch.findOneAndDelete({ _id: branchId, projectId });
    if (!branch) return next(errors.branchNotFound());

    await writeAudit({
      actionType: AuditActionType.TRACKED_BRANCH_DELETE,
      resourceType: AuditResourceType.TRACKED_BRANCH,
      resourceId: branchId,
      projectId,
      actorUserId: auth.userId,
      actorUsername: auth.username,
      requestId: (req as AuthenticatedRequest).requestId ?? null,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}
