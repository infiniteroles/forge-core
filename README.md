# Forge Core01

Development control plane for agent-assisted projects.

Forge Core01 is the internal control plane for INFINITEROLES / CORE01. It lets you
create development projects, capture instructions for agents, track project status,
review activity, and (later) connect Telegram, GitHub, Coolify and DeepSeek.

## Current status (MVP)

- Single-admin auth (email + bcrypt password, JWT session cookie).
- Projects: create, edit, archive (logical, no hard delete) and detail view.
- Instructions: capture work for future agents (manual source for now).
- Activity log: timeline of `project.*`, `instruction.created`, `agent.run.*`, `task.*`, `backlog.created`.
- **DeepSeek Planner**: "Ask Planner" runs an LLM planning agent (direct DeepSeek API, OpenAI-compatible) and stores the result as an `AgentRun`.
- **Backlog**: turn a Planner run's `proposed_tasks` into editable `Task` records (create, edit, change status, mark done, cancel).
- **GitHub links**: associate a project with a repo, and link tasks to GitHub issues, branches, plan commits and draft PRs (read/write via REST, read-only by default).
- **Builder Proposal Agent**: analyze a single task + limited repository context and propose an implementation strategy via DeepSeek — analysis only, no code/commit/PR/deploy changes.
- **Builder Commit Agent**: generate concrete, validated functional changes for a task and commit them **only** on the task branch (guarded by proposal, safe-file policy and strict limits).
- Read-only `/settings` page describing the deployment and integration status.
- Healthcheck endpoint at `/api/health`.

Not implemented yet (planned for later phases): assigning tasks to real agents, GitHub App, Telegram, Coolify API, LiteLLM, Ollama, Builder Agent commits/PR updates, real code-writing agents.

## Stack

- **Next.js 15** (App Router) + React 19 + TypeScript
- **Prisma** + PostgreSQL
- **Tailwind CSS** (dark, minimal UI)
- **Zod** (validation), **bcryptjs** (password hashing), **jose** (JWT session cookies)

## Environment variables

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. |
| `AUTH_SECRET` | Long random string used to sign session cookies. |
| `ADMIN_EMAIL` | The single admin email used to log in. |
| `ADMIN_PASSWORD_HASH` | bcrypt hash of the admin password. |
| `NEXT_PUBLIC_APP_URL` | Public URL of the app (used for absolute links and `/settings`). |
| `DEEPSEEK_API_KEY` | DeepSeek API key (OpenAI-compatible). Empty/absent disables the LLM features. |
| `DEEPSEEK_BASE_URL` | LLM provider base URL (default `https://api.deepseek.com`). |
| `DEEPSEEK_MODEL` | Model id (default `deepseek-v4-pro`). |
| `LLM_REQUEST_TIMEOUT_MS` | Request timeout in ms (default `90000`). |
| `GITHUB_TOKEN` | Optional GitHub PAT for repository metadata lookups. Empty/absent → public repos only. |
| `GITHUB_API_BASE_URL` | GitHub REST API base URL (default `https://api.github.com`). |
| `GITHUB_DEFAULT_OWNER` | Default owner shown in `/settings` (default `infiniteroles`). |

Generate the admin password hash with:

```bash
node -e "console.log(require('bcryptjs').hashSync('your-password', 12))"
```

## Development

```bash
npm install          # install dependencies
npm run dev          # start dev server on http://localhost:3000
npm run build        # production build
npm run start        # run the production build
npm run lint         # run ESLint
```

### Local PostgreSQL

```bash
docker compose up -d db
```

The local database is `forge_core` with user `forge` / password `forge_dev_password`.

## Prisma commands

```bash
npx prisma validate                 # validate the schema
npx prisma generate                 # generate the Prisma client
npx prisma migrate dev --name <n>   # create + apply a migration (dev)
npx prisma migrate deploy           # apply pending migrations (prod/safe)
npm run db:seed                     # seed admin user + example project
```

## Migrations

Migrations live in `prisma/migrations/` and are applied idempotently with
`npx prisma migrate deploy`. On the deployed environment always use
`prisma migrate deploy` — do **not** use `prisma db push`.

## Healthcheck

```bash
curl https://forge-app.dev.core01.io/api/health
# {"status":"ok","service":"forge-core","timestamp":"..."}
```

In Coolify you can set the application healthcheck to `GET /api/health` (expect `200`).

## Deploying on Coolify

The repository includes a `Dockerfile` that:

1. installs dependencies;
2. generates the Prisma client and builds Next.js;
3. runs `prisma migrate deploy` at container start (safe, idempotent);
4. starts the app on `0.0.0.0:3000`.

On Coolify:

1. Create a **PostgreSQL** database for the app (do not reuse Coolify's internal DB).
2. Create an **Application** from this repository (Dockerfile build, port `3000`).
3. Set the environment variables (including the `DATABASE_URL` pointing to the managed DB).
4. Assign the domain, e.g. `https://forge-app.dev.core01.io`.
5. Deploy. Optionally run `npm run db:seed` once via a post-deployment command or terminal.

## API

- `GET /api/health` — healthcheck.
- `GET /api/projects` — list projects.
- `POST /api/projects` — create a project.
- `GET /api/projects/[id]` — project detail.
- `PATCH /api/projects/[id]` — update a project (name, slug, description, status, URLs, target domain, stack, repository, notes).
- `POST /api/projects/[id]/archive` — archive a project (sets `archivedAt` and `status = paused`).
- `POST /api/projects/[id]/planner` — run the DeepSeek Planner agent.
- `GET /api/projects/[id]/tasks` — list a project's tasks.
- `POST /api/projects/[id]/tasks` — create a task manually.
- `PATCH /api/tasks/[id]` — update a task (status, type, priority, assignee, notes…).
- `POST /api/agent-runs/[id]/create-backlog` — convert a Planner run's `proposed_tasks` into tasks.
- `POST /api/projects/[id]/repository/check` — look up GitHub repository metadata and store it on the project.
- `POST /api/tasks/[id]/github/issue` — create a GitHub issue from a task.
- `POST /api/tasks/[id]/github/issue/check` — refresh the linked issue metadata.
- `POST /api/tasks/[id]/github/branch` — create a work branch from a task.
- `POST /api/tasks/[id]/github/branch/check` — refresh the linked branch metadata.
- `POST /api/tasks/[id]/github/plan-commit` — create/update the task plan file.
- `POST /api/tasks/[id]/github/plan-commit/check` — refresh the plan commit metadata.
- `POST /api/tasks/[id]/github/pr` — create a draft PR from the task branch.
- `POST /api/tasks/[id]/github/pr/check` — refresh the linked PR metadata.
- `POST /api/tasks/[id]/builder/proposal` — run the Builder Proposal agent for a task.
- `POST /api/tasks/[id]/builder/commit` — run Builder Commit (validated write to the task branch).
- `POST /api/tasks/[id]/builder/commit/check` — refresh Builder Commit metadata.
- `POST /api/instructions` — create an instruction.

Mutating endpoints require an authenticated session.

## LLM / DeepSeek (Ask Planner)

The Planner is the first real AI integration. It calls DeepSeek directly through an
OpenAI-compatible `chat/completions` endpoint (no LiteLLM yet). The client lives in
`lib/llm/` and is provider-agnostic (base URL + model + key come from env).

On the project detail page, click **Ask Planner** to:

1. create an `AgentRun` (status `running`);
2. collect project data + latest instructions + recent activity;
3. call the model asking for a structured JSON plan (technical/product, not code);
4. save the result and mark the run `completed`, `completed_with_warnings` or `failed`;
5. log `agent.run.created` / `agent.run.completed` / `agent.run.failed`.

### Configure in Coolify

Add these environment variables to the application:

- `DEEPSEEK_API_KEY` — your DeepSeek API key.
- `DEEPSEEK_BASE_URL` — default `https://api.deepseek.com`.
- `DEEPSEEK_MODEL` — default `deepseek-v4-pro`.
- `LLM_REQUEST_TIMEOUT_MS` — default `90000`.

Then redeploy. Without `DEEPSEEK_API_KEY` the app keeps working and `/settings`
shows "DeepSeek integration: Not configured".

### Endpoint

```
POST /api/projects/[id]/planner
```

Authenticated. Returns `{ "ok": true, "agentRun": ... }` on success, or
`{ "ok": false, "error": "LLM provider is not configured" }` when no key is set.

### Troubleshooting

- **API key missing**: `/settings` shows "Not configured"; the endpoint returns a
  clear error and the app keeps working.
- **Timeout**: controlled by `LLM_REQUEST_TIMEOUT_MS`. The run is marked `failed`.
- **Invalid JSON from the model**: the raw output is preserved and the run is marked
  `completed_with_warnings`.
- **Provider error** (HTTP 4xx/5xx): the run is marked `failed` and the error is
  stored in the run output and the activity log.

## GitHub integration

Forge integrates with GitHub in five ways:

1. **Repository metadata** — associate a project with a repository and fetch
   basic metadata (visibility, default branch, last commit).
2. **Issues from tasks** — convert a Forge task into a GitHub Issue in the
   linked repository (Issues read/write).
3. **Branches from tasks** — create a work branch from a task, based on the
   repository default branch.
4. **Plan commits from tasks** — create/update a planning Markdown file
   (`.forge/tasks/<taskId>.md`) on the task branch via the Contents API.
5. **Draft PRs from tasks** — open a draft pull request from the task branch
   to the base branch (Pull requests read/write; no merge, no functional code).

Flow:

```
Project with repositoryFullName → Check repository → GitHub REST → save metadata → show context
Task in Forge → Create GitHub Issue → issue created → save number/URL/state → ActivityLog
Task in Forge → Create Branch → branch created from default branch → save name/URL/base → ActivityLog
Task in Forge → Create Plan Commit → .forge/tasks/<taskId>.md committed → save SHA/URL → ActivityLog
Task in Forge → Create Draft PR → draft PR from task branch → save number/URL/state → ActivityLog
```

On the project detail page, the **Repository** panel shows provider, full name,
URL, visibility, default branch, description, last commit and last checked date.
Click **Check repository** to look up the repo and store the result. The Backlog
section shows a compact `Repository context: owner/repo · branch · visibility`
line plus `GitHub issues linked`, `GitHub branches linked`,
`Plan commits created` and `Draft PRs opened` summaries.

### Configure in Coolify

- `GITHUB_TOKEN` — optional for reading public repository metadata, **required
  to create issues, branches, plan commits and draft PRs**. Fine-grained or
  classic PAT.
- `GITHUB_API_BASE_URL` — default `https://api.github.com`.
- `GITHUB_DEFAULT_OWNER` — default `infiniteroles`.

Without `GITHUB_TOKEN`, `/settings` shows "GitHub integration: Public only /
Not configured", "Can create issues: No", "Can create branches: No",
"Can create plan commits: No" and "Can create draft PRs: No".

### Minimum token permissions

- Repository metadata read (`metadata: read`).
- Repository contents read/write (`contents: write`) — read for the last-commit
  lookup, write to create branch references, commit the plan Markdown file and
  commit Builder functional changes.
- Issues read/write (`issues: write`) — required to create issues.
- Pull requests read/write (`pull_requests: write`) — required to create PRs.

Draft PRs are created only from the task branch towards the project base branch
and are never merged automatically. The Builder Commit agent writes functional
code only on the task branch via the Contents API (no merge, no issue closing).

Prefer a fine-grained token scoped to `infiniteroles/forge-core` (or only the
needed repos). The token is never shown in the UI, logs or ActivityLog.

### Repository endpoint

```
POST /api/projects/[id]/repository/check
```

Authenticated. Requires the project to have `repositoryFullName`. Returns
`{ "ok": true, "repository": { ... } }` on success or
`{ "ok": false, "error": "Repository not found or GitHub token lacks access" }`
on failure. Events logged: `repository.checked`, `repository.linked` (first
link), `repository.check_failed`.

### Issue endpoints

```
POST /api/tasks/[id]/github/issue        — create a GitHub issue from a task
POST /api/tasks/[id]/github/issue/check  — refresh the linked issue metadata
```

### Branch endpoints

```
POST /api/tasks/[id]/github/branch        — create a work branch from a task
POST /api/tasks/[id]/github/branch/check  — refresh the linked branch metadata
```

### Plan commit endpoints

```
POST /api/tasks/[id]/github/plan-commit        — create/update the task plan file
POST /api/tasks/[id]/github/plan-commit/check  — refresh the plan commit metadata
```

The plan file lives at `.forge/tasks/<taskId>.md` on the task branch. If the
file already exists, Forge updates it with a new commit instead of duplicating
the path. Events logged: `github.plan_commit.created`, `github.plan_commit.updated`,
`github.plan_commit.checked`, `github.plan_commit.create_failed`,
`github.plan_commit.check_failed`.

### Pull request endpoints

```
POST /api/tasks/[id]/github/pr        — create a draft PR from the task branch
POST /api/tasks/[id]/github/pr/check  — refresh the linked PR metadata
```

PR titles use `Draft: <task.title>` and the body references the issue with
`Refs #<n>` (never `Closes #<n>`) so merging later does not auto-close issues.
Events logged: `github.pr.created`, `github.pr.checked`, `github.pr.create_failed`,
`github.pr.check_failed`.

On the project detail page, each task card shows **Create GitHub Issue** (or
`Issue #N · state`), **Create Branch** (or `Branch: forge/...`), **Create Plan
Commit** (or `Plan commit: <short sha>`) and **Create Draft PR** (or
`PR #N · state · draft` with **Open PR** and **Refresh PR**). If the task has
no branch yet, the cards show "Create a branch before…" hints.

### Branch naming convention

Branch names are generated safely from the task:

- with an issue: `forge/issue-<number>-<slug>`
- without an issue: `forge/task-<shortId>-<slug>`

Slugs are lowercased, accent-stripped and limited in length. On collision Forge
tries `-2`, `-3`, … up to a reasonable limit.

Events logged: `github.branch.created`, `github.branch.checked`,
`github.branch.create_failed`, `github.branch.check_failed`.

### Current limitations

- Read-only REST for metadata; issue/branch creation, plan-file commits and
  draft PRs are the only write operations (no merge, no functional code edits).
- No branch listing, commits history, PR merge, webhooks, comments or issue closing.
- No bidirectional sync — Forge pulls issue/branch/plan/PR state on demand via Refresh.
- Anonymous repository checks are subject to GitHub rate limits (60 req/h per IP).

Next phases: functional commits, Builder Agent commit/PR updates, GitHub App, Coolify API.

## Builder Proposal Agent

The first "Builder" agent is deliberately **read-only and analysis-only**: given a
single task, it gathers a safe context and produces an implementation proposal via
DeepSeek. It **never** writes code, creates commits, modifies files, opens PRs or
deploys anything.

Flow:

```
Task with linked repo → Ask Builder Proposal → build limited context
  → DeepSeek → structured JSON proposal → save AgentRun(taskId) → ActivityLog
```

### What it reads (limited GitHub context)

- Root tree of the task branch (top-level paths only).
- A few key files, if present: `README.md`, `package.json`, `Dockerfile`,
  `docker-compose.yml`, `next.config.*`, `tsconfig.json`, `prisma/schema.prisma`.
- Path listings for `app/`, `lib/`, `src/` and `components/` (names only).
- Task metadata, project metadata, linked issue/branch/plan/PR, recent activity
  and recent agent runs.

Safety limits: max 10 files with content, max 30 KB per file, max 120 KB total.
Never reads `.env`, secrets, binaries or large files. Missing files are skipped
without breaking the run. If the GitHub context cannot be read, the agent records
a warning and continues with task/project context.

### Output structure

`builderProposalOutputSchema` (Zod) — all fields are produced by the model:

- `summary`, `understanding`, `recommended_approach`
- `files_to_inspect[{path, reason}]`
- `files_likely_to_modify[{path, reason, change_type: create|update|delete|unknown}]`
- `implementation_steps[{title, description, risk: low|medium|high}]`
- `validation_commands[{command, purpose}]`
- `risks[]`, `questions[]`, `acceptance_criteria[]`
- `estimated_complexity` (low|medium|high), `safe_to_attempt_next` (boolean)

### Endpoint

```
POST /api/tasks/[id]/builder/proposal
```

Authenticated. Requires the task's project to have a linked `repositoryFullName`
(400 otherwise) and a configured LLM provider (503 otherwise). Returns
`{ "ok": true, "agentRun": ... }` on success, storing the proposal JSON in the
run output. The run is linked to the task via `taskId` on `AgentRun`.

### UI

- Each task card shows **Ask Builder Proposal**. Once a proposal exists, the card
  shows a compact summary (summary, approach, complexity, "safe to attempt next")
  with **View full proposal** and **Ask again**.
- The task edit page shows a read-only **Builder Proposal** section with the full
  proposal: summary, understanding, approach, files to inspect/modify,
  implementation steps, validation commands, risks, questions, acceptance criteria
  and complexity/safety flags.
- The project Backlog shows a `Builder proposals: X / total tasks` line.
- `/settings` shows Builder Proposal Agent status, model, LLM provider and GitHub
  context availability (keys are never displayed).

Events logged: `builder.proposal.created`, `builder.proposal.completed`,
`builder.proposal.failed`.

### Why it is safe

- No GitHub write calls are made from the Builder code path.
- GitHub context is limited and filtered (no secrets/large/binary files).
- The model is explicitly instructed to only analyze and propose.
- `safe_to_attempt_next` lets the human decide whether a later phase may attempt
  the change.

Migration: `20260818050000_add_agent_run_task_link` links `AgentRun` to `Task`.

## Builder Commit Agent

The second Builder agent is the first one that can generate **real functional
changes**, but under very strict limits. It only writes to the GitHub branch
associated with the task — never `main`, never production, never a merge, never
a deploy.

Flow:

```
Task with branch + draft PR + Builder Proposal
→ Run Builder Commit
→ Forge validates the task is safe
→ DeepSeek generates concrete, limited changes
→ Forge validates the changes (safe-file policy)
→ Forge applies changes ONLY on the task branch (Contents API, one commit per file)
→ GitHub creates commit → PR draft picks it up
→ Forge saves metadata + ActivityLog
```

### Safety gates (endpoint)

Before anything runs, Forge checks in order:

1. task belongs to a project with `repositoryFullName`;
2. task has a `githubBranchName`;
3. task has a `githubPrNumber` (draft PR);
4. a completed Builder Proposal exists for the task;
5. the proposal's `safe_to_attempt_next === true`;
6. `DEEPSEEK_API_KEY` is configured;
7. `GITHUB_TOKEN` is configured.

If the model returns `safe_to_commit: false`, proposes a blocked path, more than
5 files, a delete operation or non-JSON, Forge does **not** write to GitHub and
marks the run `completed_with_warnings` with the reason.

### Safe-file policy (`lib/github/safe-file-policy.ts`)

Always blocked: `.env*`, `.credentials`, `*.pem|key|crt|p12|pfx`, `*.sqlite|db`,
`.github/workflows/*`, `prisma/migrations/*`, `Dockerfile`,
`docker-compose*`, `nginx/*`, `caddy/*`, `scripts/deploy*`, `scripts/ssh*`.

Also blocked: absolute paths, `..`, binary files, files > 60 KB, more than 5
files per run, more than 120 KB total, and any delete operation.

Allowed zones (normal app code): `app/**`, `components/**`, `lib/**`,
`docs/**`, `.forge/**`, `README.md`. Modifying `prisma/schema.prisma`,
`README.md` or `.forge/**` should be justified by the task.

### Commit context

`buildBuilderCommitContext(taskId)` collects the task, project, branch, draft
PR, plan file, the latest **completed Builder Proposal**, the files the proposal
asked to inspect/modify (read from the task branch, read-only) and recent
activity/runs. Limits: max 12 files with content, 30 KB per file, 150 KB total.
Missing/blocked files are skipped with warnings. No `.env`, no secrets, no
binaries.

### Output structure

`builderCommitOutputSchema` (Zod):

- `summary`, `implementation_notes`
- `files[{ path, operation: create|update, reason, content }]`
- `validation_plan[{ command, purpose }]`
- `risks[]`, `post_commit_notes[]`
- `safe_to_commit` (boolean)

### Endpoints

```
POST /api/tasks/[id]/builder/commit        — run Builder Commit (validated write)
POST /api/tasks/[id]/builder/commit/check  — refresh the commit metadata
```

`builder/commit` returns `{ ok, status, changes, commits }` on success, or
`{ ok: false, error: "Builder commit failed: <reason>" }` on failure.
`builder/commit/check` requires `githubBuilderCommitSha` and refreshes URL,
message, committed-at and last-checked from GitHub.

### Task model fields (new in this phase)

`githubBuilderCommitSha`, `githubBuilderCommitUrl`, `githubBuilderCommitMessage`,
`githubBuilderCommittedAt`, `githubBuilderLastCheckedAt`, `builderLastRunId`,
`builderLastStatus`, `builderLastSummary`.

### UI

- Task cards show a **Builder Commit** block with the right guard message
  (run proposal first / not safe yet / create branch / create draft PR), then
  **Run Builder Commit**; once a commit exists: `Builder commit: <short sha>` +
  **Open Commit** + **Refresh Commit**.
- The task edit page shows a read-only **Builder Commit** section (last run,
  status, summary, commit SHA/URL/message, committed at, last checked, files
  changed, validation plan, risks, post-commit notes).
- The project Backlog adds `Builder commits: Y / total tasks`.
- `/settings` adds Builder Commit Agent / model / LLM provider / GitHub write
  access / Max files per run (5) / Max total change size (120 KB).

Events logged: `builder.commit.created`, `builder.commit.completed`,
`builder.commit.completed_with_warnings`, `builder.commit.failed`,
`builder.commit.checked`. Metadata never includes the token or secrets.

### Current limitations

- One commit per file (Contents API) — no single atomic multi-file commit yet.
- No merge, no issue closing, no deploy, no real command/test execution.
- GitHub context is read-only and limited; `prisma/migrations`, workflows,
  Dockerfile and infra files cannot be modified by the Builder.
- No PR body update or review flow yet.

### Reverting a Builder commit manually

If a Builder commit needs to be reverted, do it on GitHub directly (or locally):

```bash
git fetch origin
git checkout -b revert-branch origin/forge/<branch>
git revert <commitSha>
git push origin revert-branch
# then open a normal PR, or force-push the reverted branch if you own it
```

### Next steps

PR update/review flow, controlled test runner (build validation in a sandbox),
Coolify DEV deploy button, single atomic multi-file commits via Git Data API.

## Backlog (Planner → tasks)

Planner output can be turned into a real, editable backlog.

Flow:

```
Ask Planner → AgentRun (proposed_tasks) → Create Backlog → Task records
```

On a completed Planner run, click **Create Backlog**. Forge:

1. loads the `AgentRun` and parses its `output`;
2. extracts `proposed_tasks`;
3. creates a `Task` per proposed task (status `todo`), linked to the project and to the run (`sourceAgentRunId`);
4. skips titles already created from that run (no duplicates);
5. logs `backlog.created`.

The action is manual — tasks are never created automatically.

### Task model

| Field | Notes |
| --- | --- |
| `title` | required |
| `description` | optional |
| `type` | `product` \| `frontend` \| `backend` \| `infra` \| `qa` \| `docs` |
| `priority` | `high` \| `medium` \| `low` |
| `status` | `todo` \| `ready` \| `in_progress` \| `blocked` \| `done` \| `cancelled` |
| `sortOrder` | numeric |
| `assignedAgent` | optional |
| `notes` | optional |
| `sourceAgentRunId` | optional, links the task to its originating Planner run |

When a task transitions to `done`, `completedAt` is set; to `cancelled`, `cancelledAt` is set.

### Activity events

`task.created`, `task.updated`, `task.completed`, `task.cancelled`, `backlog.created`.

### Endpoints

```
GET    /api/projects/[id]/tasks
POST   /api/projects/[id]/tasks
PATCH  /api/tasks/[id]
POST   /api/agent-runs/[id]/create-backlog
```

`create-backlog` returns `{ "ok": true, "created": 7, "skipped": 0 }`.

## Security notes

- Single admin user, configured via `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` (bcrypt).
- Sessions are signed JWTs stored in `httpOnly` cookies (`AUTH_SECRET`).
- `/dashboard`, `/projects` and `/settings` are protected by middleware.
- Do not commit real secrets. `.env`, `.env.*`, `.credentials`, `*.pem`, `*.key` and `*.crt` are gitignored (`.env.example` is the only tracked env template).
- The LLM API key is only read server-side from `DEEPSEEK_API_KEY`; it is never logged, exposed in `/settings`, or sent to the browser.

## Pending

- Assign tasks to real agents (Builder / QA / Infra)
- GitHub App
- Telegram bot
- Coolify API
- LiteLLM / multi-provider routing
- Real code-writing agents

