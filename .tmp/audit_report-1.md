# MergeStream Static Audit

## 1. Verdict
- Overall conclusion: Partial Pass

## 2. Scope and Static Verification Boundary
- What was reviewed: repository structure, `README.md`, `.env.example`, package manifests, server/client entry points, auth/session/RBAC/CSRF middleware, project/pipeline/notification/audit modules, data models, representative CSS, and checked-in test suites under `app/server/tests` and `app/client/src/__tests__`.
- What was not reviewed: runtime behavior against a live MongoDB instance, live Git repositories, browser rendering, real process cancellation, Docker execution, or external network behavior.
- What was intentionally not executed: `npm start`, `npm test`, `run_tests.sh`, Docker, MongoDB, and any background scheduler/worker flows.
- Claims requiring manual verification: real Git polling against a bare repo, shell test execution on the local machine, 5-second browser polling cadence, four-run concurrency under load, 15-minute lockout timing, 8-hour session expiry, process-tree cancellation, and visual rendering/responsiveness.

## 3. Repository / Requirement Mapping Summary
- Prompt core goal: a local-only MergeStream CD engine with Git monitoring, automated merges, shell test execution, role-governed project management, notifications, audit logging, MongoDB persistence, JWT/session auth, CSRF, idempotent writes, queueing, and a React SPA.
- Main implementation areas mapped: Express app composition in `app/server/src/app.ts:19`, auth/session stack in `app/server/src/auth/*`, project and branch management in `app/server/src/projects/*`, pipeline queue/worker/scheduler in `app/server/src/pipeline/*`, admin/audit/notification features in `app/server/src/{users,audit,notifications}/*`, and SPA routes/pages in `app/client/src/routes/AppRouter.tsx:16` and `app/client/src/features/*`.
- Static evidence shows a real multi-module product rather than a demo, but several prompt-critical guarantees are weakened by manual tracked-branch registration, idempotency scoping errors, security/documentation drift, and thin authorization coverage.

## 4. Section-by-section Review

### 1. Hard Gates

#### 1.1 Documentation and static verifiability
- Conclusion: Partial Pass
- Rationale: The repo includes substantial startup, config, architecture, API, security, data-model, and testing documentation, plus a full `.env.example`, but several reviewer-facing claims are out of sync with the code and checked-in files.
- Evidence: `README.md:45`, `README.md:92`, `.env.example:1`, `docs/testing-strategy.md:14`, `docs/testing-strategy.md:59`, `docs/security-model.md:37`, `app/server/src/auth/authRoutes.ts:24`, `docs/api-contract.md:165`, `app/server/src/metrics/metricsService.ts:49`
- Manual verification note: Startup/test execution instructions were not run.

#### 1.2 Material deviation from the Prompt
- Conclusion: Partial Pass
- Rationale: The implementation is centered on the MergeStream business goal, but automated monitoring is limited to manually curated `trackedBranches` rather than all feature branches in the repository, and some security/permission behavior is weaker than the prompt’s stated guarantees.
- Evidence: `app/server/src/pipeline/scheduler.ts:64`, `app/server/src/pipeline/scheduler.ts:72`, `app/client/src/features/projects/ProjectDetailPage.tsx:175`, `app/server/src/auth/authRoutes.ts:24`, `app/server/src/pipeline/pipelineRoutes.ts:38`
- Manual verification note: Detecting whether untracked remote branches are ignored at runtime would require a live bare repo.

### 2. Delivery Completeness

#### 2.1 Core requirement coverage
- Conclusion: Partial Pass
- Rationale: Most core flows are implemented end-to-end, including auth, projects, pipeline runs, notifications, audit, and the SPA, but prompt-critical areas remain partial: automatic feature-branch monitoring requires manual registration, refresh bypasses CSRF, and invalid repo/git ref values are accepted too early.
- Evidence: `app/server/src/auth/authController.ts:27`, `app/server/src/projects/projectsController.ts:41`, `app/server/src/pipeline/pipelineController.ts:14`, `app/server/src/notifications/notificationsController.ts:8`, `app/server/src/audit/auditRoutes.ts:27`, `app/server/src/pipeline/scheduler.ts:64`, `app/server/src/projects/repoPathValidator.ts:8`, `app/server/src/projects/projectsSchemas.ts:9`
- Manual verification note: Merge/test execution success is runtime-sensitive and not claimed here.

#### 2.2 Basic end-to-end deliverable
- Conclusion: Pass
- Rationale: This is a complete multi-workspace app with docs, server, client, scripts, models, routes, and tests rather than a fragment or hardcoded mock.
- Evidence: `package.json:10`, `app/server/package.json:7`, `app/client/package.json:7`, `app/server/src/app.ts:39`, `app/client/src/routes/AppRouter.tsx:18`, `docs/requirements-matrix.md:19`
- Manual verification note: End-to-end runtime operation still requires manual execution.

### 3. Engineering and Architecture Quality

#### 3.1 Structure and module decomposition
- Conclusion: Pass
- Rationale: Responsibilities are cleanly split by domain, with dedicated middleware, models, controllers, services, and feature pages appropriate to the project scale.
- Evidence: `docs/architecture.md:42`, `app/server/src/app.ts:39`, `app/server/src/auth/sessionService.ts:21`, `app/server/src/projects/projectsController.ts:22`, `app/server/src/pipeline/worker.ts:59`, `app/client/src/routes/AppRouter.tsx:30`
- Manual verification note: None.

#### 3.2 Maintainability and extensibility
- Conclusion: Partial Pass
- Rationale: The codebase is modular and extensible, but maintainability is weakened by documentation drift, an inconsistent unused startup script, and some client/backend contract mismatches.
- Evidence: `scripts/start-local.ts:17`, `app/server/src/config/env.ts:17`, `docs/architecture.md:84`, `app/client/src/lib/api.ts:16`, `docs/api-contract.md:239`
- Manual verification note: None.

### 4. Engineering Details and Professionalism

#### 4.1 Error handling, logging, validation, and API design
- Conclusion: Partial Pass
- Rationale: The project has canonical error envelopes, structured logging, zod validation, DTO sanitization, and route composition, but idempotency scoping is flawed, some input validation promises are not met, CSRF is inconsistent, and request logging can retain sensitive CSRF headers.
- Evidence: `app/server/src/middleware/error.ts:10`, `app/server/src/middleware/validate.ts:16`, `app/server/src/middleware/idempotency.ts:32`, `app/server/src/projects/projectsSchemas.ts:9`, `app/server/src/shared/logger.ts:8`, `app/server/src/auth/authRoutes.ts:24`
- Manual verification note: Log output itself was not generated during this audit.

#### 4.2 Product/service shape vs demo shape
- Conclusion: Pass
- Rationale: The repository looks like a real application with persistence, UI flows, auth/session lifecycle, admin tooling, and a documented test strategy.
- Evidence: `README.md:14`, `docs/data-model.md:6`, `app/server/src/db/models/projectModel.ts:3`, `app/client/src/features/admin-users/UsersPage.tsx:119`, `app/client/src/features/admin-audit/AuditPage.tsx:7`
- Manual verification note: None.

### 5. Prompt Understanding and Requirement Fit

#### 5.1 Business goal, usage scenario, and constraint fit
- Conclusion: Partial Pass
- Rationale: The delivery clearly understands the local-only MergeStream domain and implements the major roles and flows, but the need to manually maintain tracked branches, the permissive cancel path, and the security-control drift do not fully match the prompt’s automation and action-level-permission framing.
- Evidence: `README.md:3`, `app/server/src/pipeline/scheduler.ts:64`, `app/server/src/pipeline/pipelineRoutes.ts:38`, `app/client/src/features/history/HistoryPage.tsx:25`, `app/server/src/middleware/csrf.ts:15`
- Manual verification note: Whether the current behavior is acceptable product policy would need stakeholder confirmation.

### 6. Aesthetics

#### 6.1 Visual and interaction design fit
- Conclusion: Partial Pass
- Rationale: Static evidence shows differentiated navigation, status colors, hover states, responsive card/table layouts, and log scrolling, but actual rendering quality and interaction smoothness were not executed in a browser.
- Evidence: `app/client/src/components/StatusBadge.module.css:12`, `app/client/src/components/NavShell.module.css:2`, `app/client/src/features/dashboard/DashboardPage.module.css:3`, `app/client/src/features/history/HistoryPage.module.css:14`, `app/client/src/features/admin-audit/AuditPage.module.css:1`
- Manual verification note: Browser-based UI verification is required.

## 5. Issues / Suggestions (Severity-Rated)

1. Severity: High. Title: Pipeline-trigger idempotency is scoped too broadly and can replay the wrong project response.
Conclusion: Fail
Evidence: `app/server/src/middleware/idempotency.ts:32`, `app/server/src/middleware/idempotency.ts:33`, `app/server/src/pipeline/pipelineRoutes.ts:28`, `app/server/src/db/models/idempotencyKeyModel.ts:18`
Impact: `POST /api/pipeline/projects/:projectId/runs` stores idempotency only by user, method, static route name, and request body. Reusing the same key and body for a different project can replay the prior project’s response instead of enqueueing a new run, breaking the prompt’s idempotent-write guarantee on a core pipeline operation.
Minimum actionable fix: Include route params, especially `projectId`, in the idempotency fingerprint and add an integration test that reuses a key across two projects.

2. Severity: High. Title: Automatic monitoring only covers manually tracked branches, not all feature branches in the repository.
Conclusion: Fail against prompt fit
Evidence: `app/server/src/pipeline/scheduler.ts:64`, `app/server/src/pipeline/scheduler.ts:72`, `app/client/src/features/projects/ProjectDetailPage.tsx:175`, `docs/manual-verification.md:54`
Impact: Newly pushed feature branches are invisible until an Administrator or Maintainer manually creates a `trackedBranch` entry. The prompt describes repository polling that detects new commits on feature branches, so this is a material weakening of the core automation story.
Minimum actionable fix: Either auto-discover eligible feature branches from the bare repo or explicitly change the product requirement and UX to make tracked-branch registration a first-class prompt requirement.

3. Severity: Medium. Title: Git branch/ref inputs are not validated before being passed to git commands.
Conclusion: Partial Fail
Evidence: `app/server/src/projects/projectsSchemas.ts:9`, `app/server/src/projects/projectsSchemas.ts:35`, `app/server/src/pipeline/pipelineRoutes.ts:22`, `app/server/src/pipeline/git/gitService.ts:42`, `app/server/src/pipeline/git/gitService.ts:57`, `docs/security-model.md:146`
Impact: `targetBranch`, tracked `branchName`, and manual `sourceBranch` are accepted as generic strings, while the git layer consumes branch refs directly. This falls short of the prompt’s injection-validation requirement and the repo’s own documentation claim that branch names are regex-validated.
Minimum actionable fix: Validate refs with `git check-ref-format --branch` or a strict allow-list, reject names beginning with `-`, and pass `--` separators where applicable.

4. Severity: Medium. Title: Invalid or non-bare repository paths are accepted at configuration time.
Conclusion: Partial Fail
Evidence: `app/server/src/projects/repoPathValidator.ts:8`, `app/server/src/projects/projectsController.ts:50`, `app/server/src/projects/projectsController.ts:111`
Impact: Project create/update only checks whether `repoPath` is under an allow-listed root; it does not verify that the path exists or that it is actually a bare Git repository. Misconfigured projects can therefore be saved and scheduled even though the prompt centers on local bare-repo monitoring.
Minimum actionable fix: Validate `repoPath` existence and repository type during create/update, for example with `fs.stat` plus `git rev-parse --is-bare-repository`.

5. Severity: Medium. Title: Session refresh rotates server-side auth state without CSRF protection.
Conclusion: Partial Fail
Evidence: `app/server/src/auth/authRoutes.ts:17`, `app/server/src/auth/authRoutes.ts:24`, `app/server/src/auth/sessionService.ts:52`, `app/client/src/lib/api.ts:27`, `docs/api-contract.md:3`, `docs/security-model.md:37`
Impact: `POST /api/auth/refresh` mutates session state and issues new cookies/CSRF tokens, but it is explicitly exempted from `csrfVerify`, while the docs claim every state-changing request/write requires CSRF. This is a security-control inconsistency in a core auth path.
Minimum actionable fix: Require CSRF on refresh as well, or formally document and justify the exception and align both server/client contracts to that design.

6. Severity: Medium. Title: Any project member can cancel any queued or running pipeline run.
Conclusion: Partial Fail
Evidence: `app/server/src/pipeline/pipelineRoutes.ts:38`, `app/server/src/projects/projectScope.ts:37`, `app/server/src/pipeline/pipelineController.ts:63`, `app/client/src/features/history/HistoryPage.tsx:25`
Impact: The cancel route only requires project read access, and the UI exposes Cancel for any user who can view the run. That grants Developers an action beyond the prompt’s explicit “trigger builds and browse results” scope and allows them to stop other users’ work within the project.
Minimum actionable fix: Restrict cancellation to Administrators, scoped Maintainers, or a clearly defined owner policy, and add authorization tests for it.

7. Severity: Medium. Title: HTTP request logs can retain `X-CSRF-Token` values.
Conclusion: Partial Fail
Evidence: `app/server/src/app.ts:25`, `app/server/src/shared/logger.ts:8`, `node_modules/pino-http/logger.js:144`, `node_modules/pino-std-serializers/lib/req.js:35`, `node_modules/pino-std-serializers/lib/req.js:88`
Impact: `pino-http` logs serialized request headers by default, but the redaction list removes cookies and authorization headers only, not `req.headers.x-csrf-token`. That undermines the repo’s masking claims for sensitive auth material in logs.
Minimum actionable fix: Redact `req.headers.x-csrf-token` (and equivalent nested header paths) and add a logger test covering a state-changing request.

8. Severity: Medium. Title: Security-critical authorization and CSRF paths are under-tested.
Conclusion: Partial Fail
Evidence: `app/server/tests/integration/rbac.test.ts:37`, `app/server/tests/integration/notifications.test.ts:42`, `docs/testing-strategy.md:29`, `docs/testing-strategy.md:36`
Impact: The checked-in tests cover auth basics, notifications self-scope, and some admin-only routes, but they do not meaningfully cover `PROJECT_ACCESS_DENIED`, cross-project run access, cancel permissions, refresh CSRF, or the four-concurrent-run limit. Severe authorization defects could therefore survive the current suite.
Minimum actionable fix: Add integration tests for cross-project reads/writes, pipeline cancel authorization, CSRF rejection on non-auth writes and refresh, and worker concurrency at the configured cap.

9. Severity: Low. Title: Reviewer-facing docs and client-side constraints drift from the implemented contract.
Conclusion: Partial Fail
Evidence: `README.md:92`, `docs/testing-strategy.md:19`, `app/client/src/features/projects/ProjectsPage.tsx:68`, `app/client/src/features/projects/ProjectDetailPage.tsx:98`, `app/server/src/projects/projectsSchemas.ts:11`, `app/server/src/projects/projectsSchemas.ts:25`
Impact: The README/testing docs point auditors to `bash repo/run_tests.sh` from inside `repo/`, and the client permits poll/retry values above the backend and prompt limits (`3600`/`5` vs `60`/`3`). This hurts static verifiability and produces avoidable rejected writes.
Minimum actionable fix: Align docs to the actual file paths and align client input constraints/messages to the backend schema and prompt limits.

## 6. Security Review Summary
- Authentication entry points: Partial Pass. Login, logout, me, change-password, refresh, lockout, bcrypt, and server-side session checks are implemented (`app/server/src/auth/authRoutes.ts:23`, `app/server/src/auth/authController.ts:27`, `app/server/src/auth/sessionService.ts:21`), but refresh is a state-changing POST without CSRF (`app/server/src/auth/authRoutes.ts:24`).
- Route-level authorization: Partial Pass. Admin-only surfaces are clearly protected (`app/server/src/users/usersRoutes.ts:24`, `app/server/src/audit/auditRoutes.ts:25`, `app/server/src/metrics/metricsRoutes.ts:10`), but pipeline cancellation is gated only by project read access (`app/server/src/pipeline/pipelineRoutes.ts:38`).
- Object-level authorization: Partial Pass. `requireProjectAccess()` scopes project reads/writes by membership (`app/server/src/projects/projectScope.ts:19`), but the suite does not verify cross-project denials and cancel uses only read scope (`app/server/src/projects/projectScope.ts:37`).
- Function-level authorization: Partial Pass. Controllers mostly rely on router middleware, but `cancelRunHandler()` performs no additional ownership or role checks beyond route middleware (`app/server/src/pipeline/pipelineController.ts:63`).
- Tenant / user isolation: Partial Pass. Notifications are self-scoped in queries and tests (`app/server/src/notifications/notificationsController.ts:13`, `app/server/tests/integration/notifications.test.ts:42`); project/run isolation exists in middleware but lacks direct tests.
- Admin / internal / debug protection: Pass. `/api/users`, `/api/audit`, and `/api/metrics` are all authenticated, admin-only route groups (`app/server/src/users/usersRoutes.ts:24`, `app/server/src/audit/auditRoutes.ts:25`, `app/server/src/metrics/metricsRoutes.ts:10`), with basic coverage for users/audit (`app/server/tests/integration/rbac.test.ts:37`).

## 7. Tests and Logging Review
- Unit tests: Partial Pass. Pure-function coverage exists for sanitizer, password policy, repo-path allow-listing, and conflict parsing (`app/server/tests/unit/sanitizer.test.ts:3`, `app/server/tests/unit/passwordPolicy.test.ts:3`, `app/server/tests/unit/repoPathValidator.test.ts:12`, `app/server/tests/unit/conflictParser.test.ts:3`), but there are no unit tests for git ref validation, repo existence checks, or logging redaction.
- API / integration tests: Partial Pass. Auth, notifications, queue rules, some project validation, and basic admin-only routing are covered (`app/server/tests/integration/auth.test.ts:42`, `app/server/tests/integration/notifications.test.ts:41`, `app/server/tests/integration/queue.test.ts:8`, `app/server/tests/integration/projectManagement.test.ts:33`, `app/server/tests/integration/rbac.test.ts:37`), but core authorization and CSRF boundaries remain thin.
- Logging categories / observability: Partial Pass. Structured request logging, audit-event persistence, and metrics middleware exist (`app/server/src/app.ts:25`, `app/server/src/audit/auditService.ts:28`, `app/server/src/metrics/metricsService.ts:88`), but the published metrics contract is not aligned with the implementation and CSRF header redaction is incomplete.
- Sensitive-data leakage risk in logs / responses: Partial Pass. DTOs and audit metadata are centrally sanitized (`app/server/src/shared/dto.ts:20`, `app/server/src/shared/sanitizer.ts:30`, `app/server/src/audit/auditService.ts:39`), but request logging can still capture `X-CSRF-Token` (`app/server/src/shared/logger.ts:8`, `node_modules/pino-std-serializers/lib/req.js:88`).

## 8. Test Coverage Assessment (Static Audit)

### 8.1 Test Overview
- Unit tests exist under `app/server/tests/unit/**` and use Jest (`app/server/jest.config.ts:22`, `app/server/package.json:12`).
- API / integration / contract tests exist under `app/server/tests/integration/**` and `app/server/tests/contract/**`, also using Jest + Supertest + `mongodb-memory-server` (`app/server/jest.config.ts:24`, `app/server/tests/setup/globalSetup.ts:3`, `app/server/package.json:12`).
- Client tests exist under `app/client/src/__tests__/**` and use Vitest + happy-dom (`app/client/package.json:12`, `docs/testing-strategy.md:12`).
- Test entry points are documented as `npm test`, `npm run test:unit`, `:integration`, `:contract`, `:client`, and `run_tests.sh` (`README.md:75`, `package.json:23`, `docs/testing-strategy.md:16`, `run_tests.sh:21`).
- Documentation provides test commands, but reviewer guidance is partly inconsistent (`README.md:92`, `docs/testing-strategy.md:19`).

### 8.2 Coverage Mapping Table

| Requirement / Risk Point | Mapped Test Case(s) | Key Assertion / Fixture / Mock | Coverage Assessment | Gap | Minimum Test Addition |
|---|---|---|---|---|---|
| Login, session cookies, logout flow | `app/server/tests/integration/auth.test.ts:43`, `app/server/tests/contract/authContract.test.ts:36` | Valid login returns user DTO (`auth.test.ts:46`); logout invalidates later `me` (`authContract.test.ts:55`) | sufficient | Refresh CSRF and token-reuse abuse paths are not covered | Add contract tests for refresh CSRF policy and refresh-token reuse revocation |
| Lockout after five failures | `app/server/tests/integration/auth.test.ts:63` | 6th request returns `AUTH_ACCOUNT_LOCKED` (`auth.test.ts:69`) | sufficient | No static coverage for 15-minute expiry release timing | Add a time-mocked lockout-expiry test |
| Password change revokes other sessions | `app/server/tests/contract/authContract.test.ts:59` | Session 2 receives `401` after session 1 changes password (`authContract.test.ts:76`) | sufficient | No test for admin reset/deactivate/delete revoking sessions | Add integration tests for admin reset/deactivate/delete session invalidation |
| Project create/update membership validation | `app/server/tests/integration/projectManagement.test.ts:34`, `app/server/tests/integration/projectManagement.test.ts:62`, `app/server/tests/integration/projectManagement.test.ts:85` | Existing IDs accepted (`projectManagement.test.ts:57`); fake IDs rejected (`projectManagement.test.ts:82`) | basically covered | No repo existence/bare-repo validation test | Add create/update tests for nonexistent and non-bare repo paths |
| Admin-only routing | `app/server/tests/integration/rbac.test.ts:37` | Developer gets `RBAC_FORBIDDEN` on `/api/users` (`rbac.test.ts:45`) | basically covered | No test for `/api/metrics`, destructive user actions, or mixed-role edge cases | Add admin-vs-non-admin tests for metrics, deactivate, delete, and role changes |
| Project object-level auth and developer write denial | none | No test asserts `PROJECT_ACCESS_DENIED`; no cross-project fixture | missing | Core membership boundaries could regress unnoticed | Add integration tests for cross-project read denial and developer PATCH denial |
| Notification self-isolation and pruning | `app/server/tests/integration/notifications.test.ts:42`, `app/server/tests/integration/notifications.test.ts:115` | Auth user only sees own notification (`notifications.test.ts:67`); retention capped at 200 (`notifications.test.ts:135`) | sufficient | No mark-all-read authorization/rejection test | Add mark-all-read success and unauthorized-access tests |
| Queue overflow, FIFO order, retention | `app/server/tests/integration/queue.test.ts:47`, `app/server/tests/integration/queue.test.ts:70`, `app/server/tests/integration/queue.test.ts:78` | 51st queued run returns `PIPELINE_QUEUE_FULL` (`queue.test.ts:59`); sequences increase (`queue.test.ts:73`) | basically covered | Four-concurrent-worker cap is explicitly untested | Add worker-level concurrency test that proves only four runs enter `RUNNING` |
| Idempotent write behavior on core routes | `app/server/tests/integration/projectManagement.test.ts:314` | Project create replay and conflict covered (`projectManagement.test.ts:344`, `projectManagement.test.ts:384`) | insufficient | No coverage for pipeline-trigger idempotency, especially cross-project key reuse | Add pipeline-trigger idempotency tests across same and different project IDs |
| Conflict capture and merge-conflict viewer data | `app/server/tests/unit/conflictParser.test.ts:4` | Multi-hunk conflict ranges parsed (`conflictParser.test.ts:29`) | insufficient | Parser is covered, but worker persistence and conflict-viewer UI are not | Add integration/UI tests that persist a conflicting run and render it in the viewer |
| CSRF enforcement on state-changing routes | `app/server/tests/integration/auth.test.ts:160`, `app/server/tests/integration/notifications.test.ts:107` | Logout without token returns `CSRF_TOKEN_INVALID` (`auth.test.ts:165`) | insufficient | Non-auth writes mostly test only happy paths; refresh has no CSRF test at all | Add rejection tests for projects, branches, notifications, and refresh policy |

### 8.3 Security Coverage Audit
- Authentication: Basically covered. Login, logout, me, refresh, lockout, and password-change revocation are exercised (`app/server/tests/integration/auth.test.ts:42`, `app/server/tests/contract/authContract.test.ts:35`), but refresh CSRF/reuse policy remains under-tested.
- Route authorization: Partial Pass. Tests cover admin-only users/audit routes (`app/server/tests/integration/rbac.test.ts:37`), but not metrics or run-cancel permissions.
- Object-level authorization: Fail. No checked-in test demonstrates `PROJECT_ACCESS_DENIED` or cross-project run/history/conflict isolation.
- Tenant / data isolation: Partial Pass. Notifications self-scope is meaningfully tested (`app/server/tests/integration/notifications.test.ts:42`), but project/run data isolation is not.
- Admin / internal protection: Partial Pass. Some admin-only surfaces are tested (`app/server/tests/integration/rbac.test.ts:37`), but destructive admin flows and metrics are not.

### 8.4 Final Coverage Judgment
- Partial Pass
- Major risks covered: auth happy path, lockout threshold, password-change revocation, notifications self-scope, queue overflow/FIFO basics, project member ID validation, and response sanitization.
- Major risks not covered well enough: project object-level authorization, pipeline cancel authorization, refresh CSRF policy, git-ref validation, repo-path validity beyond allow-listing, worker concurrency cap, untracked-branch monitoring, and pipeline-trigger idempotency scoping.
- Because of those gaps, the current tests could still pass while severe access-control or pipeline-correctness defects remain undetected.

## 9. Final Notes
- The repository is substantial and mostly aligned with the MergeStream problem space; this is not a toy delivery.
- The strongest concerns are prompt-fit and security/correctness issues in the pipeline control plane rather than missing scaffolding.
- Runtime-sensitive claims were intentionally not upgraded beyond what the static evidence supports.
