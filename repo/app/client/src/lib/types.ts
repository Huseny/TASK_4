export interface UserDto {
  id: string;
  username: string;
  displayName: string;
  role: 'ADMIN' | 'MAINTAINER' | 'DEVELOPER';
  status: string;
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
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

export interface TrackedBranchDto {
  id: string;
  projectId: string;
  branchName: string;
  ownerUserId: string;
  lastSeenCommitSha: string | null;
  isActive: boolean;
}

export interface AttemptDto {
  attemptIndex: number;
  exitCode: number;
  stdout: string;
  stderr: string;
  logsTruncated: boolean;
  timedOut: boolean;
  startedAt: string;
  finishedAt: string;
}

export interface ConflictFile {
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
  status: 'QUEUED' | 'RUNNING' | 'PASSED' | 'FAILED' | 'CONFLICT' | 'CANCELLED';
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  queueSequence: number;
  attemptCount: number;
  mergeCommitSha: string | null;
  logsTruncated: boolean;
  cancelRequested: boolean;
  errorMessage: string | null;
  conflicts: ConflictFile[];
  attempts: AttemptDto[];
  createdAt: string;
  updatedAt: string;
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

export interface DashboardProject {
  projectId: string;
  name: string;
  slug: string;
  isActive: boolean;
  latestRun: RunDto | null;
}

export interface ApiError {
  code: string;
  message: string;
  details: unknown;
  requestId: string | null;
}
