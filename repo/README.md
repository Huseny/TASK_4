# MergeStream

**Project Type:** fullstack

MergeStream is a Continuous Delivery Pipeline Engine for small engineering
teams (3-15 people) who operate entirely on local infrastructure. It monitors
bare Git repositories on the local filesystem, automatically attempts merges of
feature branches into a configured target branch, runs the project's test
command in a shell, and surfaces every result - green, red, or amber - through
a React single-page application.

The entire system runs in Docker. No host-level Node, MongoDB, or Git install
is required.

---

## 1. Feature summary

| Area | Behaviour |
| ---- | --------- |
| Dashboard | Color-coded pipeline health (green = passed, red = failed, amber = merge conflict) with 5-second short polling. |
| Roles | Administrators, Maintainers, Developers - each with distinct menu visibility, data scope, and action-level permissions. |
| Pipeline engine | Polls bare Git repos, attempts merges, runs shell tests, captures stdout/stderr up to 2 MB per run, retries up to 3 times on failure. |
| Queue | FIFO. Max 4 concurrent runs. Up to 50 queued jobs. |
| History | Last 50 runs per project surfaced in the UI; up to 500 retained per project before pruning. |
| Conflicts | Dedicated viewer shows conflicting file paths, line ranges, and raw diff content. |
| Notifications | In-app center with unread badge; pruned to the most recent 200 per user. |
| Admin panel | Create users, reset passwords, assign roles, deactivate/delete accounts, searchable audit trail (last 1000 events, `MM/DD/YYYY hh:mm A`), metrics. |
| Security | bcrypt (12 rounds), 15-minute lockout after 5 failed logins, JWT access + rotating refresh tokens with server-side session records, CSRF, per-session rate limiting at 60 rpm, idempotency keys, input validation on every endpoint. |

See `docs/requirements-matrix.md` for a row-by-row mapping of every prompt
requirement to code and tests.

---

## 2. Quickstart (Docker only)

The only supported way to run MergeStream is via Docker. Compose starts
MongoDB and the Node application together.

From `repo/`:

```bash
cp .env.example .env
docker-compose up --build
```

That single command:

1. Builds the Node 20 image (server + client bundle, dependencies pre-installed).
2. Starts MongoDB 6 in a named volume.
3. Starts the Express server on port 4000 with the scheduler and worker
   running in-process.

Open `http://127.0.0.1:4000`.

Stop and remove containers (volume preserved):

```bash
docker-compose down
```

### Seed demo data

```bash
docker-compose exec app npm run repos:init
docker-compose exec app npm run db:seed
```

### Demo credentials

`.env.example` ships with deterministic seed passwords. After
`cp .env.example .env`, sign in directly with:

| Username     | Password              | Role        |
| ------------ | --------------------- | ----------- |
| `admin`      | `AdminPass1!`         | Admin       |
| `maintainer` | `MaintainerPass1!`    | Maintainer  |
| `developer`  | `DeveloperPass1!`     | Developer   |

When `MS_SEED_*_PASSWORD` is set in `.env`, accounts are created without
the `mustChangePassword` flag. Clear those env vars before running in
production; the seed will then issue random passwords and force a change
on first login.

### API verification (curl)

After login, capture the cookies:

```bash
# 1. Login (saves session + refresh + csrf cookies)
curl -c cookies.txt -X POST http://127.0.0.1:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"AdminPass1!"}'
# expected 200: {"user":{"id":"...","username":"admin","role":"ADMIN",...}}

# 2. Dashboard (admin-only metrics + project health)
curl -b cookies.txt http://127.0.0.1:4000/api/pipeline/dashboard
# expected 200: {"projects":[...],"queue":{"queued":0,"running":0}}

# 3. Trigger a run (CSRF + Idempotency-Key required)
CSRF=$(awk '$6=="ms_csrf"{print $7}' cookies.txt)
curl -b cookies.txt -X POST \
  http://127.0.0.1:4000/api/pipeline/projects/<PROJECT_ID>/runs \
  -H 'Content-Type: application/json' \
  -H "X-CSRF-Token: $CSRF" \
  -H 'Idempotency-Key: demo-001' \
  -d '{"sourceBranch":"feature/green"}'
# expected 201: {"run":{"id":"...","status":"QUEUED",...}}
```

---

## 3. Testing (Docker only)

The full test suite (server unit + integration + contract + client unit)
runs against `mongodb-memory-server` inside the test image. No host MongoDB,
no host Node, no network access.

```bash
bash run_tests.sh
```

`run_tests.sh` builds `Dockerfile` and runs `npm test` inside the resulting
container. Equivalent two-step form:

```bash
docker build -t mergestream-test -f Dockerfile ..
docker run --rm mergestream-test
```

Run a single suite by overriding the container command:

```bash
docker run --rm mergestream-test npm run test:unit
docker run --rm mergestream-test npm run test:integration
docker run --rm mergestream-test npm run test:contract
docker run --rm mergestream-test npm run test:client
```

Risk-to-test mapping in `docs/testing-strategy.md`.

---

## 4. npm scripts (executed inside the container)

| Script | What it does |
| ------ | ------------ |
| `npm start` | Builds the client bundle, then starts the Express server. Scheduler and worker run in-process. (Run via `docker-compose up`.) |
| `npm run dev` | Runs server (`tsx` watch mode) and client (`vite`) in parallel. |
| `npm run build` | Builds server (`tsc`) and client (`vite build`). |
| `npm run lint` | ESLint on both workspaces. |
| `npm test` | Full suite: server unit + integration + contract + client unit. Uses `mongodb-memory-server`. |
| `npm run test:unit` | Server unit tests only. |
| `npm run test:integration` | Server integration tests only. |
| `npm run test:contract` | End-to-end HTTP contract tests only. |
| `npm run test:client` | Client unit tests only. |
| `npm run db:seed` | Seed admin/maintainer/developer accounts and a sample project. |
| `npm run repos:init` | Initialize sample bare repositories under `fixtures/repos/`. |
| `npm run prune` | Run retention pruning on demand (runs, notifications, idempotency keys). |

Invoke any of them via `docker-compose exec app <script>` while the stack
is running, or `docker run --rm mergestream-test <script>` for one-off
test runs.

---

## 5. Environment variables

See `.env.example` for the full list. Highlights:

- `MS_MONGO_URL` - MongoDB connection string (compose sets this to the
  internal `mongo` service).
- `MS_JWT_ACCESS_SECRET`, `MS_JWT_REFRESH_SECRET` - secret bytes for JWT signing.
- `MS_ACCESS_TOKEN_TTL_SECONDS` (default 900), `MS_REFRESH_TOKEN_TTL_SECONDS` (default 28800), `MS_SESSION_TTL_SECONDS` (default 28800 = 8 h).
- `MS_BCRYPT_ROUNDS` fixed at 12.
- `MS_LOCKOUT_THRESHOLD` = 5, `MS_LOCKOUT_WINDOW_SECONDS` = 900 (15 min).
- `MS_RATE_LIMIT_PER_MINUTE` = 60 per session.
- `MS_ALLOWED_REPO_ROOTS` - comma-separated filesystem roots that project
  `repoPath` values must resolve under. A Maintainer cannot point a project
  at an arbitrary path.
- `MS_WORKSPACE_ROOT` - directory where ephemeral merge workspaces are
  created and removed. Must be distinct from `MS_ALLOWED_REPO_ROOTS`.
- `MS_MAX_CONCURRENT_RUNS` = 4, `MS_MAX_QUEUED_RUNS` = 50.
- `MS_RUNS_RETENTION_PER_PROJECT` = 500, `MS_NOTIFICATIONS_RETENTION_PER_USER` = 200.
- `MS_HISTORY_DEFAULT_LIMIT` = 50, `MS_AUDIT_SEARCH_LIMIT` = 1000.
- `MS_SEED_*_PASSWORD` - optional deterministic seed passwords. When set,
  the seed runs without forcing password change.

---

## 6. Architecture at a glance

- `app/server/` - Express + TypeScript + Mongoose. Modules: `auth`,
  `users`, `projects`, `pipeline`, `notifications`, `audit`, `metrics`.
- `app/client/` - React + TypeScript + Vite + React Router + TanStack Query.
  One bundle served by the same Express process.
- `scripts/` - local seed + sample-repo initialiser + on-demand prune runner.
- `fixtures/` - static Git output fixtures for conflict-parser tests,
  generated bare repos for manual verification.
- `docs/` - requirements matrix, architecture, security model, API
  contract, data model, pipeline engine, testing strategy, manual
  verification.

See `docs/architecture.md` for the full diagram and module-ownership table.

---

## 7. Manual verification

Some behaviour is inherently runtime-sensitive and is not covered by
automated tests. See `docs/manual-verification.md` for the checklist,
including:

- real local Git polling against a live bare repository;
- actual shell test execution against a real project workspace;
- browser-observed 5-second polling updates;
- 15-minute lockout and 8-hour session expiry timing.

---

## 8. Security posture

- Passwords hashed with bcrypt cost 12. Never returned by any API, never
  logged. Masking enforced by a single `sanitize()` helper used by every
  DTO mapper and audit logger.
- JWT access + rotating refresh tokens, both in `HttpOnly` cookies. Every
  authenticated request checks a server-side session record, so password
  reset and account deactivation revoke tokens instantly.
- CSRF token tied to session; `X-CSRF-Token` header required on every
  POST/PUT/PATCH/DELETE except `POST /api/auth/refresh` (cookie-based,
  not form-triggered - CSRF exemption is intentional).
- Rate limit of 60 requests per minute keyed by session id.
- Input validation via `zod` on every endpoint - params, query, and body
  schemas reject unknown fields.
- `repoPath` must resolve under an allow-listed root. Test command is the
  only shell-executed process; Git is invoked through `execa` with
  explicit args (no shell interpolation).

Full details in `docs/security-model.md`.

---

## 9. Limitations

- Designed for local infrastructure only. No SMTP, no OAuth, no SaaS CI.
- Password reset is in-app: the Administrator opens a dialog and either
  supplies a temporary password or accepts a generated one displayed once.
- Account deletion is logical (`status = DELETED`) to preserve audit
  integrity.
- `mongodb-memory-server` downloads a mongod binary (~200 MB) on the first
  test image build; subsequent runs reuse the cached layer.
