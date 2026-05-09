# Business Logic Questions — MergeStream

This document records non-obvious implementation decisions in the current codebase.
Each entry follows the format:

- Question: What was unclear or required a choice
- Assumption: The constraint or principle that drove the decision
- Solution: What was implemented and why

## Authentication and Sessions

### Q1: Should lockout be checked before or after password verification?

Question: If lockout is only checked after password verification, repeated attempts still perform bcrypt work and can reveal timing differences between unknown users and locked users.

Assumption: Lockout is a front-door guard and should run before any credential path to avoid unnecessary work and timing leaks.

Solution: Login calls `releaseLockIfExpired()` then `isCurrentlyLocked()` before `verifyPassword()`. If locked, it emits an `AUTH_LOGIN_FAILURE` audit event with reason `locked` and returns 429 with a `Retry-After` header. Password hashing is never reached for locked accounts.

### Q2: Should a successful login reset the failed-attempt counter immediately or wait for TTL?

Question: Keeping stale failed-attempt records after a successful login carries old risk state forward and can cause unexpected lockouts on the next failure cycle.

Assumption: A successful authentication should clear prior failure history for that username immediately.

Solution: `registerSuccessfulLogin()` sets `failedLoginAttempts` to 0, clears `lockedUntil`, and restores status to ACTIVE in a single update. This resets the counter immediately rather than waiting for any TTL cleanup.

### Q3: Should session validity rely only on JWT expiry, or also check server-side session storage?

Question: JWT-only validation cannot enforce server-side revocation — logout, password change, and account deactivation would not take effect until the token naturally expires.

Assumption: Sessions must be centrally revocable.

Solution: `authenticate` middleware verifies the JWT signature and expiry, then requires a matching, non-revoked, non-expired session row in MongoDB via `findActiveSession()`. A missing, revoked, or expired DB session returns 401 regardless of JWT validity.

### Q4: Should the refresh token be stored in plain text?

Question: Storing refresh tokens in plain text means a database read exposes live tokens that can be replayed.

Assumption: Refresh tokens must be stored in a form that cannot be directly replayed if the database is read.

Solution: Refresh tokens are hashed with SHA-256 before storage. On refresh, the incoming token is hashed and compared against the stored hash. The raw token is never persisted.

### Q5: Should the refresh cookie be scoped to all paths?

Question: A refresh cookie available on all paths is sent with every request, widening its exposure surface.

Assumption: The refresh token should only be readable by the endpoint that needs it.

Solution: The refresh token cookie is scoped to `path=/api/auth`, so it is only transmitted to the auth refresh endpoint. The access token cookie uses `path=/` since it is needed on all API calls.

### Q6: Should password change keep all active sessions alive?

Question: If existing sessions remain valid after a password change, a compromised account stays compromised until tokens expire.

Assumption: Password change is a trust-reset event that should invalidate all prior sessions.

Solution: `changePasswordHandler` calls `revokeAllSessionsForUser()` after updating the password hash, then issues a fresh session for the current request. All other devices are forced to re-authenticate.

### Q7: Should the CSRF token rotate on every refresh?

Question: A fixed CSRF token across the session lifetime is vulnerable to token fixation if an attacker can observe an old token.

Assumption: CSRF tokens should rotate on session refresh to prevent fixation.

Solution: `rotateSession()` generates a new `randomCsrfToken()` on every refresh and updates both the session document and the `ms_csrf` cookie. The SPA reads the new value from the cookie and uses it for subsequent requests.

## Authorization and Scope

### Q8: Should route-level RBAC alone be sufficient for project data access?

Question: A role check at the route level allows any user with the right role to access any project, regardless of membership.

Assumption: Endpoint-level role permission is necessary but not sufficient; object-level membership must also be enforced.

Solution: Project endpoints chain `requireRole` (role check) with `requireProjectAccess` (membership check). ADMIN bypasses membership. MAINTAINER gets write access if in `maintainerUserIds`. DEVELOPER gets read-only access if in either member list. Non-members receive 403 regardless of role.

### Q9: Should Developers be allowed to write project settings?

Question: Developers need to trigger builds and view results but should not be able to change pipeline configuration.

Assumption: Write operations on project settings are a Maintainer-only concern.

Solution: `requireProjectAccess('write')` rejects DEVELOPER role with 403. Only MAINTAINER and ADMIN can reach write handlers for project configuration, tracked branch management, and pipeline settings.

### Q10: Should the `mustChangePassword` flag block all endpoints or only some?

Question: A user forced to change their password should not be able to use the application normally, but must still be able to reach the change-password endpoint.

Assumption: The flag should act as a gate on all protected routes except the auth routes needed to complete the change.

Solution: `requirePasswordChanged` middleware runs after `authenticate` on all protected routes. If `mustChangePassword` is set, it returns 403 with a `MUST_CHANGE_PASSWORD` code. The `/api/auth/change-password` and `/api/auth/logout` routes are exempt.

## Pipeline Engine

### Q11: Should concurrent pipeline claims use a database-level lock or an in-process serialization?

Question: If multiple `tick()` invocations run concurrently (overlapping intervals), the count-RUNNING then claim-QUEUED sequence can interleave and over-subscribe past `maxConcurrent`.

Assumption: The system runs as a single Node process, so an in-process Promise chain is sufficient and avoids the overhead of distributed locking.

Solution: `claimChain` is a module-level Promise that serializes all claim phases. Each `tick()` appends to the chain via `.then()`, ensuring the count-and-claim sequence is never interleaved. `findOneAndUpdate` with FIFO sort by `queueSequence` provides atomic single-run claims.

### Q12: Should duplicate runs for the same commit be rejected or silently deduplicated?

Question: The scheduler polls on an interval and may detect the same new commit on multiple ticks before the run finishes.

Assumption: Duplicate runs for the same project + branch + SHA waste resources and produce confusing history.

Solution: `enqueueRun` checks for an existing run with the same `(projectId, sourceBranch, sourceCommitSha)` in QUEUED or RUNNING status before creating a new one. If found, it returns the existing run as a no-op. Deduplication runs before the queue cap check.

### Q13: Should the queue cap be per-project or global?

Question: A per-project cap could allow one project to starve others; a global cap limits total system load.

Assumption: The queue cap is a system-wide resource protection, not a per-project fairness mechanism.

Solution: `enqueueRun` counts all QUEUED runs across all projects. If the total reaches `maxQueued` (default 50), the enqueue is rejected with a `PIPELINE_QUEUE_FULL` error and an audit event is written.

### Q14: Should cancellation be immediate or cooperative?

Question: Immediately killing a running process can leave the workspace in a corrupt state. Cooperative cancellation allows cleanup.

Assumption: Cancellation should be cooperative — the run checks for the flag at safe points and exits cleanly.

Solution: Cancellation sets `cancelRequested` on the run document. The worker checks this flag before starting tests and between retry attempts. An `AbortController` is also passed to the test runner for process-level abort. The workspace is always cleaned up in the `finally` block regardless of cancellation.

### Q15: Should test retries re-run from a fresh clone or reuse the existing workspace?

Question: Re-cloning on each retry is slow; reusing the workspace risks stale state from a previous attempt.

Assumption: Retries should reuse the already-merged workspace since the merge result is deterministic and the workspace is isolated per run.

Solution: Retries loop within the same workspace. Each attempt is recorded with its own `attemptIndex`, exit code, stdout, stderr, and truncation flag. The workspace is only cleaned up after all attempts complete.

### Q16: Should conflict line numbers be extracted from the merge output or from a separate diff?

Question: Git's merge conflict markers in the working tree show conflict regions but not precise line numbers in a structured form.

Assumption: Structured line ranges are needed for the conflict viewer UI to highlight specific lines.

Solution: After a failed merge, `git diff --unified=0` is run per conflicted file. The conflict parser reads hunk headers (`@@ -a,b +c,d @@`) to extract 1-based inclusive line ranges. Raw diff content is also stored so the UI can render it directly.

### Q17: Should new branches be auto-discovered by the scheduler or require explicit registration?

Question: Auto-discovery is convenient but assigns no owner to a branch, breaking the ownership model needed for notifications and access control.

Assumption: Branch ownership must be explicit to maintain project membership integrity.

Solution: The scheduler only polls branches in the `TrackedBranch` collection. New branches must be added via the API, which requires specifying an owner who is already a project member. The scheduler never auto-registers branches it discovers in remote refs.

### Q18: Should run history pruning block the enqueue response?

Question: Pruning old runs on every enqueue adds latency to the enqueue path.

Assumption: Pruning is a housekeeping concern and should not delay the caller.

Solution: `pruneRunsForProject()` is called fire-and-forget (not awaited) after a successful enqueue. Pruning failures are logged but do not affect the enqueue result.

## Notifications

### Q19: Should notification pruning be synchronous or fire-and-forget?

Question: If pruning is fire-and-forget, a user's notification count can temporarily exceed the retention limit between creation and cleanup.

Assumption: The retention limit should be enforced immediately so the user's inbox is always bounded.

Solution: `createNotification` awaits `pruneNotificationsForUser()` after inserting the new notification. Pruning sorts by `createdAt` descending, skips the first N (retention limit), and deletes the rest in a single `deleteMany`.

### Q20: Should notifications be sent to both the branch owner and the triggering user on test failure?

Question: The branch owner and the person who manually triggered the run may be different users. Only notifying one leaves the other uninformed.

Assumption: Both parties have a stake in the test result and should be notified.

Solution: On test failure, the worker looks up the `TrackedBranch` to find the owner and also checks `run.triggeredByUserId`. Notifications are sent to both, with deduplication so a user who is both owner and triggerer receives only one notification.

## Audit Logging

### Q21: Should audit write failures block the request?

Question: If an audit write fails and the request is also failed, the caller gets an error for the wrong reason. If audit failures are swallowed, the system continues but loses the audit record.

Assumption: Availability takes priority over audit completeness. A failed audit should not degrade the user experience.

Solution: `writeAudit` wraps the insert in a try/catch. Failures are logged as errors but do not propagate. The calling request succeeds or fails based on its own logic, not the audit write.

### Q22: Should audit metadata be stored raw or sanitized?

Question: Metadata passed to audit events may contain sensitive fields (passwords, tokens) that should not appear in the audit log.

Assumption: Audit records must be safe to read by administrators without exposing credentials.

Solution: All metadata is passed through `sanitize()` before insertion. The sanitizer strips known sensitive keys (e.g., `password`, `passwordHash`, `token`) from nested objects.

### Q23: Should audit events use direct collection inserts or a central writer?

Question: Direct inserts scattered across the codebase make it hard to enforce consistent shape, sanitization, and indexing.

Assumption: Audit shape and sanitization must be uniform across all callers.

Solution: All audit writes go through `writeAudit()`. The function enforces the full document shape, applies sanitization, and sets defaults (e.g., `actorUsername: 'system'` when no actor is provided). Direct collection inserts are not used anywhere in the codebase.

## Security Patterns

### Q24: Should CSRF verification apply to the login endpoint?

Question: The login endpoint is a POST but there is no session yet, so there is no CSRF token to verify.

Assumption: CSRF protection requires an established session to have a token to compare against.

Solution: `csrfVerify` middleware checks `auth` context first. If no auth context exists, it passes through without error — the authentication middleware has already rejected or will reject the request. Login and refresh endpoints are effectively exempt because they run before session context is established.

### Q25: Should the JWT secrets have a minimum length enforced at startup?

Question: Short secrets weaken HMAC-based JWT signatures and can be brute-forced.

Assumption: Secrets must meet a minimum entropy threshold and startup should fail fast if they do not.

Solution: `EnvSchema` enforces `.min(16)` on both `MS_JWT_ACCESS_SECRET` and `MS_JWT_REFRESH_SECRET`. `loadEnv()` throws on parse failure, which crashes the process before any listener is bound. In test environments, fixed test secrets are injected automatically.

### Q26: Should request IDs be generated per-request or reused from an upstream header?

Question: Reusing an upstream header allows distributed tracing but also allows callers to inject arbitrary IDs.

Assumption: The system runs as a standalone local server with no upstream proxy, so self-generated IDs are sufficient and safer.

Solution: A `requestId` middleware generates a `nanoid(16)` for every incoming request and attaches it to `req`. The ID is included in audit events, error responses, and structured log entries for correlation.

### Q27: Should deactivated users be blocked at the session level or only at login?

Question: If deactivated users are only blocked at login, existing sessions remain valid until they expire.

Assumption: Account deactivation must take effect immediately for all active sessions.

Solution: `authenticate` middleware checks `user.status` on every request after loading the user from the database. DEACTIVATED and DELETED users receive 401 immediately, regardless of session or token validity. `revokeAllSessionsForUser()` is also called at deactivation time to clean up stored sessions.

## Configuration and Startup

### Q28: Should configurable limits be hardcoded or environment-driven?

Question: Hardcoded limits cannot be tuned for different deployment sizes without a code change.

Assumption: Operational limits should be tunable via environment variables with safe defaults.

Solution: All limits are defined in `EnvSchema` with defaults: `MS_MAX_CONCURRENT_RUNS` (4), `MS_MAX_QUEUED_RUNS` (50), `MS_RUNS_RETENTION_PER_PROJECT` (500), `MS_NOTIFICATIONS_RETENTION_PER_USER` (200), `MS_AUDIT_SEARCH_LIMIT` (1000), `MS_HISTORY_DEFAULT_LIMIT` (50). Zod coerces and validates all values at startup.

### Q29: Should the scheduler bootstrap synchronously or asynchronously at startup?

Question: Synchronous bootstrap blocks the HTTP server from starting until all projects are scheduled.

Assumption: Scheduling is a background concern and should not delay the server becoming available.

Solution: `startScheduler()` calls `bootstrapScheduler()` with `void` (fire-and-forget). The HTTP server starts immediately. Bootstrap failures are logged but do not crash the process. Projects that fail to schedule on bootstrap will be picked up on the next config reload or restart.
