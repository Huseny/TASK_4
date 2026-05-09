import { sanitize } from './sanitizer';
import type { UserDoc } from '../db/models/userModel';
import type { ProjectDoc } from '../db/models/projectModel';
import type { PipelineRunDoc } from '../db/models/pipelineRunModel';
import type { NotificationDoc } from '../db/models/notificationModel';
import type { AuditEventDoc } from '../db/models/auditEventModel';
import type { TrackedBranchDoc } from '../db/models/trackedBranchModel';

export interface UserDto {
  id: string;
  username: string;
  displayName: string;
  role: string;
  status: string;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
}

export function toUserDto(u: UserDoc): UserDto {
  const raw = {
    id: String(u._id),
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    status: u.status,
    mustChangePassword: !!u.mustChangePassword,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createdAt: ((u as any).createdAt as Date).toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updatedAt: ((u as any).updatedAt as Date).toISOString(),
  };
  return sanitize(raw);
}

export interface ProjectDto {
  id: string;
  name: string;
  slug: string;
  description: string;
  repoPath: string;
  targetBranch: string;
  testCommand: string;
  pollIntervalSeconds: number;
  autoRetryAttempts: number;
  isActive: boolean;
  maintainerUserIds: string[];
  developerUserIds: string[];
  createdAt: string;
  updatedAt: string;
}

export function toProjectDto(p: ProjectDoc): ProjectDto {
  const raw = {
    id: String(p._id),
    name: p.name,
    slug: p.slug,
    description: p.description ?? '',
    repoPath: p.repoPath,
    targetBranch: p.targetBranch,
    testCommand: p.testCommand,
    pollIntervalSeconds: p.pollIntervalSeconds,
    autoRetryAttempts: p.autoRetryAttempts,
    isActive: p.isActive,
    maintainerUserIds: (p.maintainerUserIds ?? []).map(String),
    developerUserIds: (p.developerUserIds ?? []).map(String),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createdAt: ((p as any).createdAt as Date).toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updatedAt: ((p as any).updatedAt as Date).toISOString(),
  };
  return sanitize(raw);
}

export interface TrackedBranchDto {
  id: string;
  projectId: string;
  branchName: string;
  ownerUserId: string;
  lastSeenCommitSha: string | null;
  isActive: boolean;
}

export function toTrackedBranchDto(b: TrackedBranchDoc): TrackedBranchDto {
  return sanitize({
    id: String(b._id),
    projectId: String(b.projectId),
    branchName: b.branchName,
    ownerUserId: String(b.ownerUserId),
    lastSeenCommitSha: b.lastSeenCommitSha ?? null,
    isActive: b.isActive,
  });
}

export interface AttemptRecord {
  attemptIndex: number;
  startedAt: string;
  finishedAt: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  logsTruncated: boolean;
  timedOut: boolean;
}

export interface ConflictRecord {
  filePath: string;
  lineNumbers: Array<{ start: number; end: number }>;
  rawDiff: string;
}

export interface RunDto {
  id: string;
  projectId: string;
  sourceBranch: string;
  sourceCommitSha: string | null;
  targetBranch: string;
  triggerType: string;
  triggeredByUserId: string | null;
  status: string;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  queueSequence: number;
  attemptCount: number;
  mergeCommitSha: string | null;
  logsTruncated: boolean;
  cancelRequested: boolean;
  errorMessage: string | null;
  conflicts: ConflictRecord[];
  attempts: AttemptRecord[];
  createdAt: string;
  updatedAt: string;
}

export function toRunDto(r: PipelineRunDoc, detail = false): RunDto {
  const raw = {
    id: String(r._id),
    projectId: String(r.projectId),
    sourceBranch: r.sourceBranch,
    sourceCommitSha: r.sourceCommitSha ?? null,
    targetBranch: r.targetBranch,
    triggerType: r.triggerType,
    triggeredByUserId: r.triggeredByUserId ? String(r.triggeredByUserId) : null,
    status: r.status,
    queuedAt: (r.queuedAt as Date).toISOString(),
    startedAt: r.startedAt ? (r.startedAt as Date).toISOString() : null,
    finishedAt: r.finishedAt ? (r.finishedAt as Date).toISOString() : null,
    queueSequence: r.queueSequence,
    attemptCount: r.attemptCount,
    mergeCommitSha: r.mergeCommitSha ?? null,
    logsTruncated: !!r.logsTruncated,
    cancelRequested: !!r.cancelRequested,
    errorMessage: r.errorMessage ?? null,
    conflicts: (r.conflicts ?? []).map((c) => ({
      filePath: c.filePath,
      lineNumbers: (c.lineNumbers ?? []).map((l) => ({ start: l.start, end: l.end })),
      rawDiff: c.rawDiff ?? '',
    })),
    attempts: detail
      ? (r.attempts ?? []).map((a) => ({
          attemptIndex: a.attemptIndex,
          startedAt: (a.startedAt as unknown as Date).toISOString(),
          finishedAt: (a.finishedAt as unknown as Date).toISOString(),
          exitCode: a.exitCode,
          stdout: a.stdout ?? '',
          stderr: a.stderr ?? '',
          logsTruncated: !!a.logsTruncated,
          timedOut: !!a.timedOut,
        }))
      : [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createdAt: ((r as any).createdAt as Date).toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updatedAt: ((r as any).updatedAt as Date).toISOString(),
  };
  // workspacePath and raw attempts (when detail=false) deliberately omitted
  return sanitize(raw);
}

export interface NotificationDto {
  id: string;
  userId: string;
  projectId: string;
  pipelineRunId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
}

export function toNotificationDto(n: NotificationDoc): NotificationDto {
  const raw = {
    id: String(n._id),
    userId: String(n.userId),
    projectId: String(n.projectId),
    pipelineRunId: String(n.pipelineRunId),
    type: n.type,
    title: n.title,
    message: n.message,
    isRead: !!n.isRead,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createdAt: ((n as any).createdAt as Date).toISOString(),
    readAt: n.readAt ? (n.readAt as Date).toISOString() : null,
  };
  return sanitize(raw);
}

export interface AuditEventDto {
  id: string;
  timestamp: string;
  actorUserId: string | null;
  actorUsername: string;
  actionType: string;
  resourceType: string;
  resourceId: string | null;
  projectId: string | null;
  outcome: string;
  metadata: unknown;
  requestId: string | null;
}

export function toAuditDto(e: AuditEventDoc): AuditEventDto {
  const raw = {
    id: String(e._id),
    timestamp: (e.timestamp as Date).toISOString(),
    actorUserId: e.actorUserId ? String(e.actorUserId) : null,
    actorUsername: e.actorUsername,
    actionType: e.actionType,
    resourceType: e.resourceType,
    resourceId: e.resourceId ?? null,
    projectId: e.projectId ? String(e.projectId) : null,
    outcome: e.outcome,
    metadata: e.metadata ?? {},
    requestId: e.requestId ?? null,
  };
  return sanitize(raw);
}
