# API Specification — MergeStream

## Conventions

All endpoints are prefixed with `/api`. Requests and responses use `application/json`.

### Authentication
All protected endpoints require a valid `ms_access` cookie (httpOnly, set at login). The cookie carries a short-lived JWT. On expiry the client calls `POST /api/auth/refresh` using the `ms_refresh` cookie to rotate tokens silently.

### CSRF
State-changing requests (POST, PUT, PATCH, DELETE) must include an `X-CSRF-Token` header matching the per-session token mirrored in the readable `ms_csrf` cookie.

### Idempotency
All authenticated mutations require an `Idempotency-Key` header (8–200 chars, `[A-Za-z0-9_-:.]`). Replaying the same key + body replays the stored response. Replaying with a different body returns `409 IDEMPOTENCY_CONFLICT`.

### Error Envelope
All errors return:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message.",
    "details": null,
    "requestId": "abc123"
  }
}
```

### Error Codes
| Code | Status | Meaning |
|---|---|---|
| `AUTH_INVALID_CREDENTIALS` | 401 | Wrong username or password |
| `AUTH_ACCOUNT_LOCKED` | 423 | Locked after repeated failures; `details.retryAfterSeconds` |
| `AUTH_ACCOUNT_DEACTIVATED` | 403 | Account deactivated or deleted |
| `AUTH_SESSION_INVALID` | 401 | Missing, expired, or revoked session |
| `AUTH_MUST_CHANGE_PASSWORD` | 403 | Password change required before continuing |
| `AUTH_REFRESH_INVALID` | 401 | Refresh token invalid or already used |
| `CSRF_TOKEN_INVALID` | 403 | X-CSRF-Token missing or wrong |
| `RATE_LIMITED` | 429 | Too many requests; `Retry-After` header set |
| `VALIDATION_FAILED` | 400 | Request body/params failed Zod validation |
| `IDEMPOTENCY_KEY_MISSING` | 400 | Idempotency-Key header absent |
| `IDEMPOTENCY_CONFLICT` | 409 | Same key reused with different body |
| `RBAC_FORBIDDEN` | 403 | Insufficient role |
| `PROJECT_ACCESS_DENIED` | 403 | Not a member of this project |
| `PROJECT_REPO_PATH_FORBIDDEN` | 400 | repoPath not under allowed root |
| `PROJECT_NOT_FOUND` | 404 | |
| `PIPELINE_QUEUE_FULL` | 503 | Global queue at capacity |
| `PIPELINE_RUN_NOT_FOUND` | 404 | |
| `PIPELINE_RUN_STATE_INVALID` | 409 | Run already in terminal state |
| `NOTIFICATION_NOT_FOUND` | 404 | |
| `USER_NOT_FOUND` | 404 | |
| `USER_CONFLICT` | 409 | Username already taken |
| `BRANCH_NOT_FOUND` | 404 | |
| `CONFLICT` | 409 | Generic conflict (e.g. duplicate slug) |
| `NOT_FOUND` | 404 | Generic not found |
| `INTERNAL_ERROR` | 500 | Unexpected server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |

---

## Auth

### POST /api/auth/login
Authenticate with username and password. Sets `ms_access`, `ms_refresh`, and `ms_csrf` cookies.

Auth required: No  
CSRF required: No  
Idempotency required: No

Request body:
```json
{ "username": "string", "password": "string" }
```

Response `200`:
```json
{ "user": UserDto }
```

Errors: `AUTH_INVALID_CREDENTIALS` (401), `AUTH_ACCOUNT_LOCKED` (423), `AUTH_ACCOUNT_DEACTIVATED` (403), `RATE_LIMITED` (429), `VALIDATION_FAILED` (400)

---

### POST /api/auth/refresh
Rotate tokens using the `ms_refresh` cookie. Issues new `ms_access`, `ms_refresh`, and `ms_csrf` cookies. Detects token reuse and revokes the session if the stored hash does not match.

Auth required: No (uses ms_refresh cookie)  
CSRF required: No  
Idempotency required: No

Response `200`:
```json
{ "user": UserDto }
```

Errors: `AUTH_REFRESH_INVALID` (401), `AUTH_ACCOUNT_DEACTIVATED` (403), `RATE_LIMITED` (429)

---

### POST /api/auth/logout
Revoke the current session and clear all auth cookies.

Auth required: Yes  
CSRF required: Yes  
Idempotency required: No

Response `204`: No content

---

### GET /api/auth/me
Return the currently authenticated user.

Auth required: Yes  
CSRF required: No

Response `200`:
```json
{ "user": UserDto }
```

Errors: `AUTH_SESSION_INVALID` (401)

---

### POST /api/auth/change-password
Change the authenticated user's own password. Revokes all other sessions. Clears `mustChangePassword` flag.

Auth required: Yes (mustChangePassword users allowed)  
CSRF required: Yes  
Idempotency required: Yes

Request body:
```json
{ "currentPassword": "string", "newPassword": "string (min 10 chars, 1 letter, 1 digit)" }
```

Response `204`: No content

Errors: `AUTH_INVALID_CREDENTIALS` (401 — wrong current password), `VALIDATION_FAILED` (400)

---

## Users (Admin only)

All `/api/users` endpoints require ADMIN role.

### GET /api/users
List all non-deleted users, sorted by creation date descending.

Response `200`:
```json
{ "users": UserDto[] }
```

---

### POST /api/users
Create a new user.

CSRF required: Yes  
Idempotency required: Yes

Request body:
```json
{
  "username": "string (3–64 chars, lowercase)",
  "displayName": "string (max 128 chars)",
  "role": "ADMIN | MAINTAINER | DEVELOPER",
  "password": "string (min 10 chars, 1 letter, 1 digit)"
}
```

Response `201`:
```json
{ "user": UserDto }
```

Errors: `USER_CONFLICT` (409 — username taken), `VALIDATION_FAILED` (400)

---

### GET /api/users/:userId
Get a single user by ID.

Response `200`:
```json
{ "user": UserDto }
```

Errors: `USER_NOT_FOUND` (404)

---

### PATCH /api/users/:userId/role
Update a user's role. Cannot demote your own admin account.

CSRF required: Yes  
Idempotency required: Yes

Request body:
```json
{ "role": "ADMIN | MAINTAINER | DEVELOPER" }
```

Response `200`:
```json
{ "user": UserDto }
```

Errors: `USER_NOT_FOUND` (404), `CONFLICT` (409 — self-demotion), `VALIDATION_FAILED` (400)

---

### POST /api/users/:userId/reset-password
Admin resets a user's password. Sets `mustChangePassword: true` and revokes all sessions.

CSRF required: Yes  
Idempotency required: Yes

Request body:
```json
{ "newPassword": "string (min 10 chars, 1 letter, 1 digit)" }
```

Response `204`: No content

Errors: `USER_NOT_FOUND` (404), `VALIDATION_FAILED` (400)

---

### POST /api/users/:userId/deactivate
Deactivate a user account. Revokes all sessions. Cannot deactivate your own account.

CSRF required: Yes  
Idempotency required: Yes

Response `204`: No content

Errors: `USER_NOT_FOUND` (404), `CONFLICT` (409 — self-deactivation)

---

### DELETE /api/users/:userId
Soft-delete a user (sets status to DELETED, records `deletedAt`). Revokes all sessions. Cannot delete your own account.

CSRF required: Yes  
Idempotency required: Yes

Response `204`: No content

Errors: `USER_NOT_FOUND` (404), `CONFLICT` (409 — self-deletion)

---

## Projects

### GET /api/projects
List projects. ADMIN sees all; MAINTAINER/DEVELOPER see only projects they are members of.

Auth required: Yes

Response `200`:
```json
{ "projects": ProjectDto[] }
```

---

### POST /api/projects
Create a project. ADMIN only. `repoPath` must resolve under an allowed root and be a bare git repo. `slug` must be unique.

Auth required: Yes (ADMIN)  
CSRF required: Yes  
Idempotency required: Yes

Request body:
```json
{
  "name": "string (max 200)",
  "slug": "string (max 128, lowercase)",
  "description": "string (max 2000, optional)",
  "repoPath": "string",
  "targetBranch": "string",
  "testCommand": "string (max 2048)",
  "pollIntervalSeconds": "number (10–60)",
  "autoRetryAttempts": "number (0–3)",
  "maintainerUserIds": "string[]",
  "developerUserIds": "string[]"
}
```

Response `201`:
```json
{ "project": ProjectDto }
```

Errors: `PROJECT_REPO_PATH_FORBIDDEN` (400), `CONFLICT` (409 — slug taken), `VALIDATION_FAILED` (400)

---

### GET /api/projects/:projectId
Get a single project. Requires project membership.

Auth required: Yes (project member)

Response `200`:
```json
{ "project": ProjectDto }
```

Errors: `PROJECT_NOT_FOUND` (404), `PROJECT_ACCESS_DENIED` (403)

---

### PATCH /api/projects/:projectId
Update project settings. MAINTAINER or ADMIN only. All fields optional.

Auth required: Yes (MAINTAINER or ADMIN, project member with write access)  
CSRF required: Yes  
Idempotency required: Yes

Request body (all optional):
```json
{
  "name": "string",
  "description": "string",
  "repoPath": "string",
  "targetBranch": "string",
  "testCommand": "string",
  "pollIntervalSeconds": "number (10–60)",
  "autoRetryAttempts": "number (0–3)",
  "isActive": "boolean",
  "maintainerUserIds": "string[]",
  "developerUserIds": "string[]"
}
```

Response `200`:
```json
{ "project": ProjectDto }
```

Errors: `PROJECT_NOT_FOUND` (404), `PROJECT_REPO_PATH_FORBIDDEN` (400), `VALIDATION_FAILED` (400)

---

### GET /api/projects/:projectId/members
List all members (maintainers + developers) of a project.

Auth required: Yes (project member)

Response `200`:
```json
{ "users": UserDto[] }
```

---

### GET /api/projects/:projectId/branches
List tracked branches for a project.

Auth required: Yes (project member)

Response `200`:
```json
{ "branches": TrackedBranchDto[] }
```

---

### POST /api/projects/:projectId/branches
Register a new tracked branch. `ownerUserId` must be a project member.

Auth required: Yes (MAINTAINER or ADMIN, project write access)  
CSRF required: Yes  
Idempotency required: Yes

Request body:
```json
{ "branchName": "string (max 256)", "ownerUserId": "string (ObjectId)" }
```

Response `201`:
```json
{ "branch": TrackedBranchDto }
```

Errors: `PROJECT_NOT_FOUND` (404), `CONFLICT` (409 — branch already tracked), `VALIDATION_FAILED` (400)

---

### PATCH /api/projects/:projectId/branches/:branchId
Update a tracked branch's `isActive` flag or `ownerUserId`.

Auth required: Yes (MAINTAINER or ADMIN, project write access)  
CSRF required: Yes  
Idempotency required: Yes

Request body (all optional):
```json
{ "isActive": "boolean", "ownerUserId": "string (ObjectId)" }
```

Response `200`:
```json
{ "branch": TrackedBranchDto }
```

Errors: `BRANCH_NOT_FOUND` (404), `VALIDATION_FAILED` (400)

---

### DELETE /api/projects/:projectId/branches/:branchId
Remove a tracked branch.

Auth required: Yes (MAINTAINER or ADMIN, project write access)  
CSRF required: Yes  
Idempotency required: Yes

Response `204`: No content

Errors: `BRANCH_NOT_FOUND` (404)

---

## Pipeline

### GET /api/pipeline/dashboard
Return all accessible projects with their latest run and global queue counters. ADMIN sees all projects; others see only their member projects.

Auth required: Yes

Response `200`:
```json
{
  "projects": [
    {
      "projectId": "string",
      "name": "string",
      "slug": "string",
      "isActive": "boolean",
      "latestRun": "RunDto | null"
    }
  ],
  "queue": { "queued": "number", "running": "number" }
}
```

---

### POST /api/pipeline/projects/:projectId/runs
Manually trigger a pipeline run for a branch.

Auth required: Yes (project member)  
CSRF required: Yes  
Idempotency required: Yes

Request body:
```json
{ "sourceBranch": "string (valid git ref, max 256)" }
```

Response `201`:
```json
{ "run": RunDto }
```

Errors: `PROJECT_NOT_FOUND` (404), `PIPELINE_QUEUE_FULL` (503), `VALIDATION_FAILED` (400)

Note: If a run for the same `(projectId, sourceBranch, sourceCommitSha)` is already QUEUED or RUNNING, the existing run is returned (deduplication).

---

### GET /api/pipeline/projects/:projectId/runs
List pipeline runs for a project, sorted by `queueSequence` descending.

Auth required: Yes (project member)

Query params:
- `limit` — number, max 200, default from config (50)

Response `200`:
```json
{ "runs": RunDto[] }
```

Note: `attempts` array is empty in list responses. Use the single-run endpoint for full attempt detail.

---

### GET /api/pipeline/projects/:projectId/runs/:runId
Get a single pipeline run with full attempt detail (stdout, stderr, etc.).

Auth required: Yes (project member)

Response `200`:
```json
{ "run": RunDto }
```

Errors: `PIPELINE_RUN_NOT_FOUND` (404)

---

### POST /api/pipeline/projects/:projectId/runs/:runId/cancel
Cancel a pipeline run. QUEUED runs are cancelled immediately. RUNNING runs set `cancelRequested` and are cancelled cooperatively.

Auth required: Yes (MAINTAINER or ADMIN, project write access)  
CSRF required: Yes  
Idempotency required: Yes

Response `204`: No content

Errors: `PIPELINE_RUN_NOT_FOUND` (404), `PIPELINE_RUN_STATE_INVALID` (409 — already in terminal state)

---

## Notifications

All notification endpoints are scoped to the authenticated user's own notifications.

### GET /api/notifications
List the authenticated user's notifications, sorted by creation date descending. Max 200 returned.

Auth required: Yes

Query params:
- `unread=true` — filter to unread only

Response `200`:
```json
{ "notifications": NotificationDto[] }
```

---

### GET /api/notifications/unread-count
Return the count of unread notifications for the authenticated user.

Auth required: Yes

Response `200`:
```json
{ "count": "number" }
```

---

### POST /api/notifications/:notificationId/mark-read
Mark a single notification as read.

Auth required: Yes  
CSRF required: Yes  
Idempotency required: Yes

Response `200`:
```json
{ "notification": NotificationDto }
```

Errors: `NOTIFICATION_NOT_FOUND` (404 — not found or belongs to another user)

---

### POST /api/notifications/mark-all-read
Mark all of the authenticated user's unread notifications as read.

Auth required: Yes  
CSRF required: Yes  
Idempotency required: Yes

Response `204`: No content

---

## Audit (Admin only)

### GET /api/audit
Search audit events. ADMIN only. Results sorted by timestamp descending, max 1000.

Auth required: Yes (ADMIN)

Query params (all optional):
- `actionType` — exact match
- `actorUserId` — exact match
- `resourceType` — exact match
- `outcome` — `SUCCESS` or `FAILURE`
- `projectId` — exact match
- `from` — ISO 8601 datetime, inclusive lower bound
- `to` — ISO 8601 datetime, inclusive upper bound
- `limit` — number 1–1000, default 1000

Response `200`:
```json
{ "events": AuditEventDto[] }
```

---

## Metrics (Admin only)

### GET /api/metrics
Return a system metrics snapshot. ADMIN only.

Auth required: Yes (ADMIN)

Response `200`: metrics snapshot object (shape varies by implementation)

---

## DTO Shapes

### UserDto
```json
{
  "id": "string",
  "username": "string",
  "displayName": "string",
  "role": "ADMIN | MAINTAINER | DEVELOPER",
  "status": "ACTIVE | LOCKED | DEACTIVATED | DELETED",
  "mustChangePassword": "boolean",
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

### ProjectDto
```json
{
  "id": "string",
  "name": "string",
  "slug": "string",
  "description": "string",
  "repoPath": "string",
  "targetBranch": "string",
  "testCommand": "string",
  "pollIntervalSeconds": "number",
  "autoRetryAttempts": "number",
  "isActive": "boolean",
  "maintainerUserIds": "string[]",
  "developerUserIds": "string[]",
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

### TrackedBranchDto
```json
{
  "id": "string",
  "projectId": "string",
  "branchName": "string",
  "ownerUserId": "string",
  "lastSeenCommitSha": "string | null",
  "isActive": "boolean"
}
```

### RunDto
```json
{
  "id": "string",
  "projectId": "string",
  "sourceBranch": "string",
  "sourceCommitSha": "string | null",
  "targetBranch": "string",
  "triggerType": "MANUAL | MONITOR",
  "triggeredByUserId": "string | null",
  "status": "QUEUED | RUNNING | PASSED | FAILED | CONFLICT | CANCELLED",
  "queuedAt": "ISO 8601",
  "startedAt": "ISO 8601 | null",
  "finishedAt": "ISO 8601 | null",
  "queueSequence": "number",
  "attemptCount": "number",
  "mergeCommitSha": "string | null",
  "logsTruncated": "boolean",
  "cancelRequested": "boolean",
  "errorMessage": "string | null",
  "conflicts": [
    {
      "filePath": "string",
      "lineNumbers": [{ "start": "number", "end": "number" }],
      "rawDiff": "string"
    }
  ],
  "attempts": [
    {
      "attemptIndex": "number",
      "exitCode": "number",
      "stdout": "string",
      "stderr": "string",
      "logsTruncated": "boolean",
      "timedOut": "boolean",
      "startedAt": "ISO 8601",
      "finishedAt": "ISO 8601"
    }
  ],
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

Note: `attempts` is populated only on the single-run `GET /api/pipeline/projects/:projectId/runs/:runId` endpoint. List responses return an empty array.

### NotificationDto
```json
{
  "id": "string",
  "userId": "string",
  "projectId": "string",
  "pipelineRunId": "string",
  "type": "MERGE_CONFLICT | TEST_FAILURE",
  "title": "string",
  "message": "string",
  "isRead": "boolean",
  "createdAt": "ISO 8601",
  "readAt": "ISO 8601 | null"
}
```

### AuditEventDto
```json
{
  "id": "string",
  "timestamp": "ISO 8601",
  "actorUserId": "string | null",
  "actorUsername": "string",
  "actionType": "string",
  "resourceType": "string",
  "resourceId": "string | null",
  "projectId": "string | null",
  "outcome": "SUCCESS | FAILURE",
  "metadata": "object",
  "requestId": "string | null"
}
```
