# Design — MergeStream

## System Overview

MergeStream is a single-node, local-only continuous delivery pipeline engine for small development teams. It runs as a single Docker-deployable process with no external service dependencies. The Express backend serves both the REST API and the React SPA from the same origin, eliminating CORS complexity and keeping the deployment footprint minimal.

## Component Boundaries

```
┌─────────────────────────────────────────────────────────┐
│  React SPA (Vite + React Router + TanStack Query)        │
│  /login  /  /projects  /admin/*  /notifications          │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP (same origin, cookie auth)
┌────────────────────▼────────────────────────────────────┐
│  Express App (src/app.ts)                                │
│  requestId → metrics → json → cookieParser → routers    │
│                                                          │
│  /api/auth        authRouter                             │
│  /api/users       usersRouter       (ADMIN only)         │
│  /api/projects    projectsRouter    (scoped by member)   │
│  /api/pipeline    pipelineRouter    (scoped by member)   │
│  /api/notifications notificationsRouter (self only)      │
│  /api/audit       auditRouter       (ADMIN only)         │
│  /api/metrics     metricsRouter     (ADMIN only)         │
│  /*               static SPA files                       │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│  Background Engine                                       │
│  Scheduler (per-project setInterval, polls git refs)     │
│  Worker    (2s tick, claims + executes QUEUED runs)      │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│  MongoDB (Mongoose)                                      │
│  users  sessions  projects  trackedBranches              │
│  pipelineRuns  notifications  auditEvents                │
│  idempotencyKeys  pipelineSequences                      │
└─────────────────────────────────────────────────────────┘
```

## Middleware Stack

Every request passes through this chain in order:

1. `requestIdMiddleware` — attaches a `nanoid(16)` to `req.requestId` for tracing
2. `startMetricsMiddleware` — records request start time for latency tracking
3. `express.json({ limit: '1mb' })` — parses JSON bodies
4. `cookieParser` — parses `ms_access`, `ms_refresh`, `ms_csrf` cookies
5. Router-level middleware (per router):
   - `authenticate` — verifies JWT, checks DB session, loads user status
   - `requirePasswordChanged` — blocks if `mustChangePassword` is set
   - `rateLimit` — sliding window, 60 req/min per session or IP
   - `requireRole` / `requireAdmin` / `requireMaintainerOrAdmin` — role gate
   - `requireProjectAccess` — object-level membership check
   - `csrfVerify` — validates `X-CSRF-Token` header for mutations
   - `idempotency` — deduplicates writes via `Idempotency-Key` header
   - `validate` — Zod schema validation for body/params/query
6. Route handler
7. `notFoundMiddleware` — 404 for unmatched routes
8. `errorMiddleware` — converts `AppError` to canonical JSON envelope

## Data Models

### users
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `username` | String | unique, lowercase, 3–64 chars |
| `displayName` | String | max 128 chars |
| `role` | Enum | ADMIN \| MAINTAINER \| DEVELOPER |
| `passwordHash` | String | bcrypt, rounds configurable |
| `status` | Enum | ACTIVE \| LOCKED \| DEACTIVATED \| DELETED |
| `failedLoginAttempts` | Number | resets on success |
| `lockedUntil` | Date | null if not locked |
| `mustChangePassword` | Boolean | set by admin password reset |
| `deletedAt` | Date | soft delete timestamp |
| `createdAt`, `updatedAt` | Date | auto |

Indexes: `role`, `status`

### projects
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `name` | String | max 200 chars |
| `slug` | String | unique, lowercase, max 128 chars |
| `description` | String | max 2000 chars |
| `repoPath` | String | resolved absolute path, validated bare git repo |
| `allowedRepoRoot` | String | the allow-listed root it resolved under |
| `targetBranch` | String | default `main` |
| `testCommand` | String | max 2048 chars |
| `pollIntervalSeconds` | Number | 10–60, default 30 |
| `autoRetryAttempts` | Number | 0–3, default 0 |
| `isActive` | Boolean | controls scheduler registration |
| `maintainerUserIds` | [ObjectId] | write access members |
| `developerUserIds` | [ObjectId] | read-only members |
| `createdBy`, `updatedBy` | ObjectId | actor tracking |
| `createdAt`, `updatedAt` | Date | auto |

Indexes: `isActive`, `maintainerUserIds`, `developerUserIds`

### trackedBranches
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `projectId` | ObjectId | ref projects |
| `branchName` | String | max 256 chars |
| `ownerUserId` | ObjectId | must be a project member |
| `lastSeenCommitSha` | String | updated after successful enqueue |
| `isActive` | Boolean | default true |
| `createdAt`, `updatedAt` | Date | auto |

Indexes: `(projectId, branchName)` unique, `ownerUserId`

### pipelineRuns
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `projectId` | ObjectId | ref projects |
| `sourceBranch` | String | |
| `sourceCommitSha` | String | null for manual triggers without SHA |
| `targetBranch` | String | snapshot at enqueue time |
| `triggerType` | Enum | MANUAL \| MONITOR |
| `triggeredByUserId` | ObjectId | null for scheduler |
| `status` | Enum | QUEUED \| RUNNING \| PASSED \| FAILED \| CONFLICT \| CANCELLED |
| `queuedAt` | Date | |
| `startedAt` | Date | null until claimed |
| `finishedAt` | Date | null until terminal |
| `queueSequence` | Number | unique monotonic, FIFO ordering |
| `attemptCount` | Number | incremented per test attempt |
| `attempts` | Array | `{attemptIndex, startedAt, finishedAt, exitCode, stdout, stderr, logsTruncated, timedOut}` |
| `mergeCommitSha` | String | null until PASSED |
| `conflicts` | Array | `{filePath, lineNumbers: [{start, end}], rawDiff}` |
| `logsTruncated` | Boolean | true if stdout/stderr was cut |
| `cancelRequested` | Boolean | cooperative cancellation flag |
| `workspacePath` | String | temp dir, not exposed in API |
| `errorMessage` | String | null if no error |
| `createdAt`, `updatedAt` | Date | auto |

Indexes: `(projectId, queuedAt)`, `(projectId, createdAt)`, `(status, queueSequence)`, `sourceBranch`, `(projectId, sourceBranch, sourceCommitSha, status)`

### sessions
| Field | Type | Notes |
|---|---|---|
| `_id` | String | nanoid(24), used as session ID |
| `userId` | ObjectId | ref users |
| `refreshTokenHash` | String | SHA-256 of refresh token |
| `csrfToken` | String | 32-byte hex, per-session |
| `issuedAt` | Date | |
| `lastSeenAt` | Date | touched on every authenticated request |
| `expiresAt` | Date | configurable TTL |
| `revokedAt` | Date | null if active; soft revocation |
| `ipAddress` | String | null if unknown |
| `userAgent` | String | null if unknown |

Indexes: `userId`, `expiresAt`, `revokedAt`

### notifications
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `userId` | ObjectId | ref users |
| `projectId` | ObjectId | ref projects |
| `pipelineRunId` | ObjectId | ref pipelineRuns |
| `type` | Enum | MERGE_CONFLICT \| TEST_FAILURE |
| `title` | String | max 256 chars |
| `message` | String | max 2048 chars |
| `isRead` | Boolean | default false |
| `readAt` | Date | null if unread |
| `createdAt`, `updatedAt` | Date | auto |

Indexes: `(userId, createdAt)`, `(userId, isRead, createdAt)`

### auditEvents
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `timestamp` | Date | |
| `actorUserId` | ObjectId | null for system/background |
| `actorUsername` | String | default `system` |
| `actionType` | Enum | see Action Types below |
| `resourceType` | Enum | USER \| SESSION \| PROJECT \| TRACKED_BRANCH \| PIPELINE_RUN \| NOTIFICATION \| SYSTEM |
| `resourceId` | String | null for system events |
| `projectId` | ObjectId | null if not project-scoped |
| `outcome` | Enum | SUCCESS \| FAILURE |
| `metadata` | Mixed | sanitized action-specific details |
| `requestId` | String | null for background tasks |

Indexes: `timestamp`, `(actionType, timestamp)`, `(actorUserId, timestamp)`, `(projectId, timestamp)`

Audit action types: `AUTH_LOGIN_SUCCESS`, `AUTH_LOGIN_FAILURE`, `AUTH_LOGOUT`, `AUTH_REFRESH`, `AUTH_PASSWORD_CHANGED`, `USER_CREATE`, `USER_ROLE_ASSIGN`, `USER_PASSWORD_RESET`, `USER_DEACTIVATE`, `USER_DELETE`, `PROJECT_CREATE`, `PROJECT_UPDATE`, `TRACKED_BRANCH_CREATE`, `TRACKED_BRANCH_UPDATE`, `TRACKED_BRANCH_DELETE`, `PIPELINE_TRIGGER`, `PIPELINE_CANCEL`, `PIPELINE_SCHEDULER_ENQUEUE`, `PIPELINE_CONFLICT`, `PIPELINE_TEST_FAILURE`, `PIPELINE_QUEUE_FULL`, `PIPELINE_WORKSPACE_CLEANUP_FAILED`

### idempotencyKeys
| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | |
| `userId` | ObjectId | ref users |
| `key` | String | caller-provided, max 200 chars |
| `method` | String | HTTP method |
| `routeFingerprint` | String | `METHOD:routeName[params]` |
| `requestFingerprint` | String | SHA-256 of request body |
| `statusCode` | Number | stored response status |
| `responseBody` | Mixed | null for 204 |
| `expiresAt` | Date | 24-hour TTL |

Indexes: `(userId, key, method, routeFingerprint)` unique, `expiresAt` (TTL)

## Pipeline State Machine

```
                    ┌─────────┐
                    │ QUEUED  │◄── enqueueRun()
                    └────┬────┘
                         │ worker claims (FIFO by queueSequence)
                    ┌────▼────┐
                    │ RUNNING │
                    └────┬────┘
          ┌──────────────┼──────────────┐
          │              │              │
     ┌────▼────┐   ┌─────▼────┐  ┌─────▼──────┐
     │ PASSED  │   │  FAILED  │  │  CONFLICT  │
     └─────────┘   └──────────┘  └────────────┘
          │              │
          └──────┬───────┘
                 │ cancelRequested flag
          ┌──────▼──────┐
          │  CANCELLED  │
          └─────────────┘
```

QUEUED runs can also be cancelled directly (immediate status update). RUNNING runs set `cancelRequested` and are checked cooperatively before and between test attempts.

## Scheduler Design

The scheduler maintains a `Map<projectId, NodeJS.Timer>` of per-project `setInterval` timers. On startup, `bootstrapScheduler()` loads all active projects and registers each one. When a project is created or updated, `scheduleProject()` replaces the existing timer. When a project is deactivated, `unscheduleProject()` clears it.

Each poll tick:
1. Loads the project from DB (self-unschedules if inactive or deleted)
2. Calls `git ls-remote` on the bare repo to get current remote refs
3. For each active `TrackedBranch`, compares remote SHA against `lastSeenCommitSha`
4. If different, calls `enqueueRun()` with `triggerType: MONITOR`
5. On successful enqueue, updates `lastSeenCommitSha`

New branches are never auto-discovered. They must be explicitly registered via the API with an assigned owner.

## Worker Concurrency Model

The worker runs a `setInterval` tick every 2 seconds. Each tick calls `claimRunsForCapacity()`, which is serialized via a module-level `claimChain` Promise to prevent overlapping ticks from over-subscribing past `maxConcurrent`.

The claim phase:
1. Counts currently RUNNING runs
2. Calculates available slots (`maxConcurrent - running`)
3. For each slot, atomically claims one QUEUED run via `findOneAndUpdate` sorted by `queueSequence` (FIFO)

Each claimed run is processed in a separate async function with its own `AbortController`. The controller is stored in a `Map<runId, AbortController>` so cancellation can be signaled from the cancel endpoint.

## Security Architecture

### Authentication Flow
```
Login → lockout check → password verify → createSession()
      → set ms_access (httpOnly) + ms_refresh (httpOnly, path=/api/auth) + ms_csrf (readable)

Request → authenticate middleware:
  1. Read ms_access cookie
  2. Verify JWT signature + expiry
  3. findActiveSession(sid) — checks not revoked, not expired
  4. Load user — check not DEACTIVATED/DELETED/LOCKED
  5. Attach AuthContext to req

Refresh → verify ms_refresh JWT → hash compare against DB → rotateSession()
        → new tokens + new CSRF token
```

### Authorization Layers
- Layer 1 — Route RBAC: `requireAdmin`, `requireMaintainerOrAdmin`, `requireAnyRole`
- Layer 2 — Object scope: `requireProjectAccess('read' | 'write')` checks project membership
- Layer 3 — Self-scope: notifications and session operations are owner-only at the handler level

### CSRF Protection
State-changing requests (POST/PUT/PATCH/DELETE) must include `X-CSRF-Token` matching the per-session token stored in MongoDB. The SPA reads the token from the `ms_csrf` cookie (not httpOnly) and echoes it in the header. The token rotates on every session refresh.

### Idempotency
All authenticated mutations require an `Idempotency-Key` header (8–200 chars, `[A-Za-z0-9_-:.]`). The key is stored per `(userId, key, method, routeFingerprint)` with a 24-hour TTL. Replaying the same key with the same body replays the stored response. Replaying with a different body returns `IDEMPOTENCY_CONFLICT`. The SPA auto-generates a UUID-style key for every mutation.

## Client-Side Architecture

### Routing
React Router v6 with three guard components:
- `RequireAuth` — redirects to `/login` if unauthenticated; redirects to `/change-password` if `mustChangePassword`
- `RequireAuthNoForce` — redirects to `/login` only; used for the change-password page itself
- `RequireRole` — wraps `RequireAuth` and additionally checks role membership

### Auth Context
`AuthProvider` wraps the app and exposes `user`, `loading`, `login()`, `logout()`, `refreshUser()`. On mount it calls `/api/auth/me`; on 401 it attempts a refresh then retries. All route guards read from this context.

### API Client
`lib/api.ts` provides a single `apiFetch` wrapper that:
- Reads `ms_csrf` from cookies and attaches `X-CSRF-Token` for mutations
- Auto-generates and attaches `Idempotency-Key` for mutations (except login/refresh)
- On 401, attempts a silent refresh and retries the original request once
- Throws with an `apiError` property containing the canonical error envelope

Namespaced API objects: `authApi`, `projectsApi`, `pipelineApi`, `notificationsApi`, `auditApi`, `usersApi`, `metricsApi`.

### Data Fetching
TanStack Query (React Query) manages server state. The dashboard uses a custom `useDashboardSummary` hook with a 5-second refetch interval for near-real-time pipeline status. Other pages use standard query hooks with appropriate stale times.

## Retention and Pruning

- **Pipeline runs**: After each enqueue, `pruneRunsForProject()` is called fire-and-forget. It keeps the most recent N runs per project (by `queueSequence` descending), deleting the rest. Default: 500 per project.
- **Notifications**: After each `createNotification()`, `pruneNotificationsForUser()` is called synchronously. It keeps the most recent N notifications per user (by `createdAt` descending). Default: 200 per user.
- **Idempotency keys**: MongoDB TTL index on `expiresAt` (24 hours) handles automatic cleanup.
- **Sessions**: No automatic cleanup; expired/revoked sessions remain in the collection for audit purposes. Active session check filters by `revokedAt: null` and `expiresAt > now`.

## Startup Sequence

1. Check `git` is available on PATH
2. Connect to MongoDB
3. Create Express app and bind HTTP listener
4. `startScheduler()` — fire-and-forget bootstrap of per-project timers
5. `startWorker()` — start 2-second tick interval
6. Register SIGTERM/SIGINT handlers for graceful shutdown

Shutdown: stop scheduler timers, stop worker interval, close HTTP server (10-second hard exit timeout).
