# MergeStream Previous-Issue Recheck (Static)

Date: 2026-04-29
Source issue list: `.tmp/mergestream_static_audit.md` (Section 5)
Scope: static code verification only (no runtime execution)

## Summary
- Fixed: 4
- Partially fixed: 0
- Not fixed: 0

## Issue-by-Issue Status

1. **High** - Non-atomic worker claim path could exceed max-4 concurrency  
Status: **Fixed**
- Evidence of fix: worker claim path is now serialized via `claimChain` and `claimRunsForCapacity()` to prevent interleaving claim races.  
  `TASK-req_d1ba701051c0/repo/app/server/src/pipeline/worker.ts:30-34`, `:55-77`, `:80-83`
- Verification tests present:
  - parallel claim invariant test (`Promise.all` on many overlapping claims)  
    `TASK-req_d1ba701051c0/repo/app/server/tests/integration/workerConcurrency.test.ts:25-39`
  - existing running-cap behavior  
    `TASK-req_d1ba701051c0/repo/app/server/tests/integration/workerConcurrency.test.ts:52-69`

2. **High** - Idempotent write operations only partially implemented  
Status: **Fixed**
- Evidence of fix: idempotency middleware now supports `POST/PUT/PATCH/DELETE` and is wired across project, branch, pipeline, users, notifications, and auth change-password writes.  
  `TASK-req_d1ba701051c0/repo/app/server/src/middleware/idempotency.ts:7`, `:23-40`  
  `TASK-req_d1ba701051c0/repo/app/server/src/projects/projectsRoutes.ts:51`, `:63`, `:72`, `:81`  
  `TASK-req_d1ba701051c0/repo/app/server/src/pipeline/pipelineRoutes.ts:34`, `:45`  
  `TASK-req_d1ba701051c0/repo/app/server/src/users/usersRoutes.ts:28`, `:33`, `:40`, `:47`, `:54`  
  `TASK-req_d1ba701051c0/repo/app/server/src/notifications/notificationsRoutes.ts:27`, `:33`  
  `TASK-req_d1ba701051c0/repo/app/server/src/auth/authRoutes.ts:33`
- Route-param scoping issue is fixed via param-aware fingerprinting:  
  `TASK-req_d1ba701051c0/repo/app/server/src/middleware/idempotency.ts:32-33`

3. **Medium** - Test coverage gap for real worker concurrency guard  
Status: **Fixed**
- Evidence of fix: dedicated concurrency test file now exercises overlapping worker claims and asserts max-concurrency invariants and FIFO behavior.  
  `TASK-req_d1ba701051c0/repo/app/server/tests/integration/workerConcurrency.test.ts:24-50`

4. **Medium** - Requirements docs contradicted scheduler branch-discovery behavior  
Status: **Fixed**
- Evidence: scheduler explicitly states no auto-registration and only polls tracked branches; requirements matrix row 1a states the same behavior.  
  `TASK-req_d1ba701051c0/repo/app/server/src/pipeline/scheduler.ts:8-11`, `:69-89`  
  `TASK-req_d1ba701051c0/repo/docs/requirements-matrix.md:22`

## Final Judgment
All four issues from `.tmp/mergestream_static_audit.md` are statically verified as fixed in the current codebase.

