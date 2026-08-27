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
- **PR Review Gate**: analyze a task's draft PR, summarize the diff, flag risks and recommend ready-for-review (never merges, deploys or auto-approves).
- **Autonomous DEV Work Session**: a single "Work on this" action that runs issue → branch → plan → draft PR → Builder Proposal → Builder Commit → PR review automatically and prepares a PR for human review.
- **Iteration Loop (Continue / Ask for changes)**: iterate on an existing task reusing the same branch and PR — a new Builder Proposal, a new commit on the same branch, a fresh PR analysis and an updated human summary.
- **Session Checks Lite**: a lightweight internal validation stage that runs a closed allowlist of commands (`npm run lint`, `npm run build`, `npx prisma validate`) after a Builder Commit and shows a short, human summary. Never a full CI pipeline.
- **DEV Preview from Work Session**: prepare a navigable preview URL for a task branch/PR without merging or touching `main`/production. Three modes (`disabled`/`manual`/`coolify_api`); default `disabled`.
- **Human Approval: Prepare Production**: the first formal human-approval gate before production. Forge prepares a `ProductionReadinessReview` (recommendation, risk, preview, checks, changed files) and a human can Approve/Reject — **never merges, never deploys, never touches `main`**.
- Read-only `/settings` page describing the deployment and integration status.
- Healthcheck endpoint at `/api/health`.

Not implemented yet (planned for later phases): assigning tasks to real agents, GitHub App, Telegram, LiteLLM, Ollama, real test runner, automatic merge/deploy, automatic preview cleanup, preview auto-trigger at end of session.

## Documentación

- **`AGENTS.md`** — instrucciones para agentes IA / Copilot que trabajen en este repo (comandos, guardrails, arquitectura, trampas del entorno).
- **`docs/current-state.md`** — estado actual completo (fases 2.x–6.6, entornos Coolify, endpoints, cómo validar/desplegar, limitaciones).
- **`docs/roadmap.md`** — siguientes pasos (6.x, ops pendientes).
- **`docs/composer-vision.md`** — visión del Chat Composer (Fase 6.0).

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
- `POST /api/tasks/[id]/github/pr/review` — analyze a draft PR (structured review).
- `POST /api/tasks/[id]/github/pr/review/check` — refresh PR + review metadata.
- `POST /api/tasks/[id]/github/pr/ready` — convert a draft PR to ready for review (no merge).
- `POST /api/tasks/[id]/work-session/start` — run an autonomous DEV work session for a task.
- `POST /api/projects/[id]/ideas/work-session/start` — create a task from an idea and run a DEV work session.
- `POST /api/tasks/[id]/work-session/iterate` — start an iteration (mode `iteration`) for a task with a new instruction (`{ "instruction": "..." }`), reusing task/branch/PR.
- `POST /api/work-sessions/[id]/continue` — continue a work session; optional `{ "instruction": "..." }` (no instruction → default "continue with the next safe step").
- `POST /api/work-sessions/[id]/checks/run` — (re)run the lightweight session checks for a work session.
- `POST /api/work-sessions/[id]/preview/prepare` — prepare a DEV preview for a work session (disabled → `not_configured`, manual → pending, coolify_api → create/reuse + deploy).
- `POST /api/preview-deployments/[id]/refresh` — refresh a preview deployment status (coolify API or manual).
- `POST /api/work-sessions/[id]/preview/manual` — register a manual preview URL (`{ "previewUrl": "https://..." }`).
- `POST /api/work-sessions/[id]/production/prepare` — prepare a `ProductionReadinessReview` for a work session (no merge/deploy).
- `POST /api/production-readiness/[id]/approve` — human approval (`{ "notes"?: "..." }`); only when recommendation is `ready_for_production`.
- `POST /api/production-readiness/[id]/reject` — human rejection (`{ "notes": "..." }` required).
- `POST /api/production-readiness/[id]/refresh` — re-evaluate and preserve human decisions.
- `GET /api/settings/coolify/diagnostics` — Coolify/preview runner diagnostics (never returns the token).
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

## PR Review Gate

Adds a human-assisted review phase for pull requests generated from Forge tasks.
Forge reads the draft PR, summarizes the change, flags risks and gives a
recommendation — it **never** merges, deploys, closes issues or auto-approves.

Flow:

```
Task with Builder Commit + Draft PR
→ Analyze PR
→ Forge reads PR diff + metadata (limited)
→ DeepSeek produces a structured review
→ Forge saves AgentRun + result
→ Human reviews
→ Manual action: Mark Ready for Review (draft → ready), or keep draft / re-run
```

### What it reads (limited)

- PR metadata (state, draft, base/head, merged), PR files with diff patches and
  PR commits, via `lib/github/pr-context.ts`.
- Limits: max 40 files, 8 KB per diff, 150 KB total context. No full file
  contents, no secrets, no binaries.
- The changed-file paths are classified with the **safe-file-policy**
  (`assessPrPaths`) to flag blocked/sensitive/infra/workflow paths.

### Output structure

`prReviewOutputSchema` (Zod):

- `summary`, `change_overview`
- `files_changed[{ path, change_type, summary, risk }]`
- `safety_assessment{ touches_blocked_paths, touches_secrets, touches_infra, touches_tests, touches_runtime_code, notes[] }`
- `review_findings[{ severity: info|warning|blocking, title, description, file }]`
- `recommended_checks[{ command, purpose }]`
- `risk_level`, `recommendation`, `ready_for_review`, `human_notes[]`

### Ready-for-review rules

- `ready_for_review=false` if the diff touches blocked/sensitive/infra paths.
- `ready_for_review=false` if there are `blocking` findings.
- `recommendation=keep_draft|needs_changes` when there are no sufficient
  functional changes.
- `recommendation=needs_human_decision` when context is insufficient.

### Endpoints

```
POST /api/tasks/[id]/github/pr/review        — Analyze PR (structured review)
POST /api/tasks/[id]/github/pr/review/check  — refresh PR + review metadata
POST /api/tasks/[id]/github/pr/ready         — convert draft PR → ready (no merge)
```

`pr/ready` only works when the last completed review has
`ready_for_review === true`. It never merges, closes issues, changes labels or
requests reviewers.

### Task model fields (new in this phase)

`githubPrReviewRunId`, `githubPrReviewStatus`, `githubPrReviewSummary`,
`githubPrReviewRecommendation`, `githubPrReviewRiskLevel`,
`githubPrReviewReadyForReview`, `githubPrReviewLastCheckedAt`,
`githubPrMarkedReadyAt`.

### UI

- Task cards show a **PR Review Gate** block: **Analyze PR**, the review result
  (`PR Review: <recommendation> · risk <risk_level>` + `Ready for review:
  Yes/No`), **View review**, and **Mark Ready for Review** (only when draft +
  completed review with `ready_for_review=true`).
- The task edit page shows a read-only **PR Review Gate** section (summary,
  change overview, files changed, safety assessment, findings, recommended
  checks, risk/recommendation/ready, human notes, last checked, marked ready at).
- The project Backlog adds `PR reviews`, `PRs ready for review` and
  `PRs marked ready` counters.
- `/settings` adds PR Review Gate / model / can-mark-ready / LLM provider /
  GitHub PR access.

Events logged: `github.pr_review.created`, `github.pr_review.completed`,
`github.pr_review.failed`, `github.pr.ready_for_review`,
`github.pr.ready_for_review_failed`. Metadata never includes the token or
secrets.

### Current limitations

- One review per Analyze PR click; no PR comments, no inline suggestions.
- No merge, no deploy, no auto-approval, no reviewer requests.
- Diff context is bounded (patches only, truncated at limits).

### Next steps

Controlled test runner (build validation in a sandbox), PR comments,
Coolify DEV deploy button, single atomic multi-file commits via Git Data API.

## Autonomous DEV Work Session

A single high-level action that runs the whole validated pipeline under the hood,
so you do not have to click every step manually.

Flow:

```
Idea / Task
→ Work on this / Start DEV Work Session
→ ensure issue (skip if exists)
→ ensure branch (skip if exists)
→ ensure plan commit (skip if exists)
→ ensure draft PR (skip if exists)
→ Builder Proposal (if missing / not safe → waiting_for_user)
→ Builder Commit (only if safe; safe_to_commit=false → completed_with_warnings, no write)
→ Analyze PR (structured review)
→ human summary
```

### What is automated

Creating the issue, branch, plan commit and draft PR, running the Builder
Proposal, running the Builder Commit on the task branch, analyzing the PR,
updating metadata and logging to the ActivityLog.

### What still requires human approval

Merge to `main`, deploy to production, closing issues automatically, deleting
data, touching secrets, touching sensitive infrastructure, or relaxing the
safe-file policy.

### Model

`WorkSession` groups a session: `projectId`, `taskId?`, `status`
(`queued | running | waiting_for_user | completed | completed_with_warnings |
failed | cancelled`), `mode` (`dev | fix | iteration | exploration`),
`objective`, `summary`, `currentStage`, `result` (JSON), `error`, timestamps.
`AgentRun.workSessionId` links runs to the session.

### Endpoints

```
POST /api/tasks/[id]/work-session/start           — run a DEV session for a task
POST /api/projects/[id]/ideas/work-session/start  — create a task from an idea, then run the session
```

Body for the idea endpoint: `{ "idea": "..." }`.

### UI

- Task cards show a primary **Work on this** button; after the session, the card
  shows the session status, a human-readable summary, **View session** and
  **Open PR**, plus **Continue** and **Ask for changes** (real, see Iteration
  Loop below) and `Discard` / `Prepare production` (coming soon).
- The project detail page has a **New idea** box with **Start DEV Work Session**.
- `/work-sessions/[id]` shows the objective, status, current stage, summary,
  artifacts (issue/branch/plan/PR/commit links), files changed, warnings,
  agent runs, the activity timeline, and — for iterations — parent/child
  sessions, iteration number and requested changes, plus **Continue**,
  **Ask for changes** and **Open PR** actions.

Events logged: `work_session.started`, `work_session.stage_started`,
`work_session.stage_completed`, `work_session.waiting_for_user`,
`work_session.completed`, `work_session.completed_with_warnings`,
`work_session.failed`. Metadata never includes tokens or secrets.

### Orchestrator

`lib/work-sessions/` contains `types.ts`, `stages.ts` (reusable ensure-stage
functions) and `orchestrator.ts` (`runDevWorkSession` + `runIterationWorkSession`).
It reuses the existing GitHub/LLM primitives and never duplicates work if a stage
is already done.

## Iteration Loop: Continue / Ask for changes

Forge does not stop at the first attempt. You can iterate on a task the way you
work for real: ask Forge to change something and it reuses the same task, branch
and pull request — it never starts a new task or a new PR unnecessarily.

```
Óscar: "bien, pero cambia esto…"
→ Continue / Ask for changes
→ same task, same branch, same PR
→ fresh analysis (if needed)
→ new Builder Proposal driven by the new instruction
→ new Builder Commit on the SAME branch
→ existing PR updates automatically
→ PR re-analyzed
→ updated human summary
```

### Two high-level actions

- **Continue** — `POST /api/work-sessions/[id]/continue` (or the task-level
  iterate endpoint without a session): ask Forge to keep working from the current
  state. Without an instruction it uses a safe default: *"continue from the
  current state of this task and apply the next safe, useful development step."*
- **Ask for changes** — `POST /api/tasks/[id]/work-session/iterate` with
  `{ "instruction": "Add a timestamp field…" }`: a concrete adjustment. The new
  instruction takes priority over the original plan (as long as it does not
  violate the guardrails).

### How reuse works

- The new `WorkSession` is created with `mode = "iteration"`,
  `parentWorkSessionId` pointing to the previous session and a computed
  `iterationNumber`.
- The iteration pipeline is `refresh_context → ensure_existing_task →
  ensure_issue → ensure_branch → ensure_draft_pr → run_iteration_builder_proposal
  → run_builder_commit → analyze_pr → summarize_result`.
- It never creates a new task, issue, branch or plan commit if they already
  exist, and never opens a second PR for the same branch.
- Builder Proposal and Builder Commit receive the iteration context: the user's
  new instruction, previous work-session summaries, the last Builder Commit
  summary, the last PR review summary and the current file contents from the
  branch — so the Builder modifies the existing file instead of rewriting it.

### Model fields (new in this phase)

`WorkSession.parentWorkSessionId`, `WorkSession.requestedChanges` and
`WorkSession.iterationNumber` (default `1`), plus the self-relation
`parentWorkSession` / `childrenWorkSessions`.

### Endpoints

```
POST /api/tasks/[id]/work-session/iterate   body: { "instruction": "..." }
POST /api/work-sessions/[id]/continue       body: { "instruction"?: "..." }
```

Both create a NEW linked `WorkSession` (never overwrite the previous one) and
return `{ ok, workSession }`.

### ActivityLog

`work_session.iteration_started`, `work_session.iteration_requested`,
`work_session.iteration_completed`, `work_session.iteration_completed_with_warnings`,
`work_session.iteration_failed`, `work_session.continued` (plus the shared
`work_session.stage_started` / `work_session.stage_completed`). Metadata includes
`workSessionId`, `parentWorkSessionId`, `taskId`, `iterationNumber`, a short
`instruction`, `prUrl` and `commitUrl` — never tokens or secrets.

### Guardrails (unchanged and mandatory)

No merge, no deploy, no direct `main` writes, no automatic issue closing, no
file deletion, no `.env`/secrets, no keys/certificates, no firewall/SSH/VPS, no
workflow/Docker/infra edits, and the safe-file policy is never relaxed. If the
Builder sets `safe_to_commit=false`, Forge does not force the write.

## Session Checks Lite

A lightweight, automatic validation stage inside Work Sessions. After Forge
applies a Builder Commit it runs a small, closed allowlist of checks and reports
a short result — it is **not** a CI pipeline, not a test runner and not a place
for model-suggested commands.

### When they run

- In DEV sessions: `run_builder_commit → run_session_checks → analyze_pr → summarize_result`.
- In iteration sessions: the same stage is inserted after the iteration Builder Commit.
- If there was no new Builder Commit (or the commit was blocked with
  `completed_with_warnings` without writing), the checks are recorded as
  `skipped`.

### Allowlist (closed, hardcoded)

```
npm run lint
npm run build
npx prisma validate
```

No commands come from user input or from the model. `npm test` is not run in
this phase.

### Runner modes

- `SESSION_CHECKS_RUNNER=local` — enables the real runner: clone the task
  branch into a temp dir, `npm ci`, run the allowlist commands via `spawn`
  (no shell), bounded per-command and globally, and delete the temp dir.
- default (or any other value) — **disabled**: every allowlist command is
  recorded as `skipped` with the message *"Check runner not configured yet"* and
  the session continues normally.

In this deployment the runner is **disabled** by default because the app
container does not keep the task branch or a full `node_modules`; enabling it
would clone + `npm ci` on every session, which is slow and risky in production.

### Safety limits

- Per-command timeout: 120 s (`SESSION_CHECKS_TIMEOUT_MS`), global bounded.
- Log tails capped at 8 KB each (`SESSION_CHECKS_MAX_TAIL`) — never full logs.
- Commands run with `spawn` and `shell: false` — no shell, no arbitrary scripts.
- Cloning uses the public `https://github.com/<owner>/<repo>.git` URL only —
  tokens are never placed in the URL or printed.
- Temp directory per session, removed when done.
- Failing checks never revert, never block the session, never deploy — the
  session is marked `completed_with_warnings` and the summary explains it.

### Model

`SessionCheck` (new): `workSessionId`, `projectId`, `taskId?`, `name`,
`command`, `status` (`queued|running|passed|failed|skipped|cancelled|timeout`),
`exitCode?`, `summary?`, `stdoutTail?`, `stderrTail?`, `startedAt`, `finishedAt?`,
`durationMs?`, timestamps. Relations to `WorkSession` (cascade), `Project`
(cascade) and `Task` (set-null). Migration: `20260823000000_add_session_checks`.

### Orchestrator stage

`lib/work-sessions/checks.ts` exports `runSessionChecks(workSessionId)` (creates
`SessionCheck` rows + returns a short summary), the `SESSION_CHECK_ALLOWLIST`,
`getSessionCheckRunnerConfig()` and `isSessionCheckRunnerEnabled()`.
`stageRunSessionChecks` in `lib/work-sessions/stages.ts` runs it inside both
pipelines and stores the compact result on the session (`result.checks`).

### Manual endpoint

```
POST /api/work-sessions/[id]/checks/run
```

Authenticated. Re-runs the checks for an existing session and returns
`{ ok, summary, checks }`. Useful to retry or backfill a session.

### UI

- `/work-sessions/[id]` shows a **Checks** section: name, command, status,
  exit code, duration, summary and capped stdout/stderr tails, plus a small
  **Run checks** button (manual re-run).
- Task cards show a compact `Checks: passed | failed | skipped` chip on the
  latest work session block.
- The human summary includes a `Comprobaciones:` line (build/lint/prisma OK,
  failed, or skipped because the runner is not configured).

### ActivityLog

`work_session.checks.started`, `work_session.checks.completed`,
`work_session.checks.completed_with_warnings`, `work_session.checks.failed`,
`work_session.checks.skipped`. Metadata includes `workSessionId`, `taskId`,
`status` and a short `checks` array — never secrets, env vars or tokens.

### Current limitations

- Runner disabled by default; real local runner is behind
  `SESSION_CHECKS_RUNNER=local` and not exercised in production yet.
- No `npm test`, no model-suggested commands, no distributed runner, no CI.
- Checks are advisory — failing checks mark the session
  `completed_with_warnings` but never revert or block the PR.

### Next steps

Optional enablement of the local runner in a controlled environment, PR
comments with the check summary, and (a later phase) a real build-validation
sandbox.

## DEV Preview from Work Session

After a Work Session (or a Forge-generated PR) you can prepare a **navigable DEV
preview URL** to review the result in the browser — without merging, without
touching `main` and without touching production.

```
WorkSession with Task + Branch + PR
→ Prepare DEV Preview
→ Forge creates/reuses a DEV deployment for the branch
→ Forge saves URL + status
→ "Open DEV Preview"
→ review in the browser
```

### Environment variables

```
COOLIFY_BASE_URL="https://forge.core01.io"
COOLIFY_API_TOKEN=""
COOLIFY_SERVER_UUID=""
COOLIFY_PROJECT_UUID=""
COOLIFY_ENVIRONMENT_NAME="dev"
PREVIEW_DOMAIN_SUFFIX=".dev.core01.io"
PREVIEW_RUNNER_MODE="disabled"    # disabled | manual | coolify_api
```

Rules: never commit a real token; the token is never shown in the UI, logs or
ActivityLog; if `COOLIFY_API_TOKEN` is missing Forge keeps working and shows
`DEV Preview: Not configured`; `PREVIEW_RUNNER_MODE` defaults to `disabled`.

### Runner modes

- **disabled** (default) — Forge never tries to create a preview; it records a
  `PreviewDeployment` with status `not_configured` and the message *"DEV Preview
  runner is not configured"*. The session is not affected.
- **manual** — Forge records a pending manual preview; you register a URL via
  the manual endpoint/UI and it becomes `ready`.
- **coolify_api** — Forge creates/reuses a Coolify application for the task
  branch (domain `preview-<taskShortId>.dev.core01.io` or
  `ws-<workSessionShortId>.dev.core01.io`), launches a deploy in the DEV
  environment (never production) and tracks its status.

In this deployment the runner is **disabled** because no `COOLIFY_API_TOKEN` is
configured. The Coolify API is reachable (`/api/v1` responds, 401 without a
token) — enabling `coolify_api` requires generating a token in Coolify
(*Keys & Tokens*) and adding it to the app environment.

### Model

`PreviewDeployment` (new): `projectId`, `taskId?`, `workSessionId?`, `provider`
(`manual|coolify`), `status` (`not_configured|queued|creating|deploying|ready|
failed|stopped|skipped`), `previewUrl?`, `domain?`, `branchName?`,
`repositoryFullName?`, `pullRequestNumber?`, `coolifyApplicationUuid?`,
`coolifyDeploymentUuid?`, `coolifyProjectUuid?`, `coolifyServerUuid?`,
`commitSha?`, `lastDeploymentStatus?`, `lastDeploymentLogUrl?`, `error?`,
`metadata?`, timestamps (`requestedAt`, `deployedAt`, `lastCheckedAt`,
`stoppedAt`). Relations to `Project` (cascade), `Task` and `WorkSession`
(set-null). Migration: `20260824000000_add_preview_deployments`.

The preview URL/status is also stored on `WorkSession.result`
(`previewUrl`/`previewStatus`) so cards can show it without an extra query.

### Client

`lib/coolify/` contains `types.ts`, `client.ts` (config + authenticated fetch
with timeout; the token is never logged) and `preview.ts`
(`prepareDevPreview`, `refreshPreviewDeployment`, `buildPreviewDomain`, plus
`createOrReusePreviewApplication` / `triggerPreviewDeployment` /
`getPreviewDeploymentStatus` for the `coolify_api` path). If Coolify is not
configured or unreachable, previews degrade to `not_configured`/`failed` with a
clear message and never break the app.

### Endpoints

```
POST /api/work-sessions/[id]/preview/prepare   — prepare (create/reuse) a DEV preview
POST /api/preview-deployments/[id]/refresh     — refresh deployment status
POST /api/work-sessions/[id]/preview/manual    — body { "previewUrl": "https://..." }
```

When not configured, `prepare` returns `{ ok: false, status: "not_configured",
error: "DEV Preview runner is not configured" }` (HTTP 200).

### UI

- `/work-sessions/[id]` shows a **DEV Preview** panel: Prepare, Deploying +
  Refresh status, **Open DEV Preview** + Refresh, Preview failed (+ error, retry)
  and a small "Register manual preview URL" form.
- Task cards show a compact `DEV Preview: ready/deploying/failed/not configured`
  chip in the latest work-session block, with **Open Preview** / **Prepare
  Preview** actions (not the protagonist).
- The project Backlog adds `DEV previews: X · Ready previews: Y`.
- `/settings` shows DEV Preview status, runner mode, Coolify base URL, token
  (Hidden/Not set), domain suffix and default provider.

### ActivityLog

`preview.prepare_requested`, `preview.created`, `preview.application_reused`,
`preview.application_created`, `preview.deployment_started`, `preview.ready`,
`preview.failed`, `preview.not_configured`, `preview.refreshed`,
`preview.manual_registered`. Metadata includes `previewDeploymentId`,
`workSessionId`, `taskId`, `provider`, `status`, `previewUrl`, `domain`,
`branchName` — never tokens or secrets.

### Guardrails

No production, no merge, no direct `main` writes, no automatic issue closing,
no deleting resources without approval, no `.env`/secrets, no keys/certificates,
no firewall/SSH/VPS changes, no workflow/Docker/infra edits, and the token is
never printed.

### Current limitations

- Runner disabled by default; `coolify_api` requires a `COOLIFY_API_TOKEN` +
  a server/project UUID and is not exercised in production yet.
- No automatic preview at the end of a session (manual "Prepare DEV Preview").
- No cleanup/stop of previews, no multi-environment system, no background
  queues/WebSockets.

### Next steps

Enable `coolify_api` with a real token, add preview cleanup, optional automatic
preview after sessions, and a "Stop preview" action.

## Coolify API Preview Runner

This phase completes the real `coolify_api` mode: Forge talks to the Coolify
REST API to create/reuse a preview application for the task branch, assigns a
`*.dev.core01.io` domain, launches a deployment and tracks its status.

### Creating a Coolify API token

1. Log into Coolify (`https://forge.core01.io`) → **Keys & Tokens** →
   **API tokens** → **Create new token**.
2. Copy the generated token and add it to the app environment variables on
   Coolify as `COOLIFY_API_TOKEN` (encrypted). Never commit it to the repo and
   never paste it into Forge — Forge never prints it.
3. Set `PREVIEW_RUNNER_MODE=coolify_api`.

### Required variables

```
COOLIFY_BASE_URL="https://forge.core01.io"
COOLIFY_API_TOKEN=""                # real token (Coolify Keys & Tokens)
COOLIFY_SERVER_UUID=""              # optional: auto-discovered if empty
COOLIFY_PROJECT_UUID=""             # optional: auto-discovered if empty
COOLIFY_ENVIRONMENT_NAME="dev"
PREVIEW_DOMAIN_SUFFIX=".dev.core01.io"
PREVIEW_RUNNER_MODE="coolify_api"
PREVIEW_DEFAULT_PORT="3000"
PREVIEW_BUILD_PACK="dockerfile"
PREVIEW_APP_NAME_PREFIX="forge-preview"
PREVIEW_DEPLOY_TIMEOUT_MS="300000"
```

### Getting the server / project UUID

`GET /api/settings/coolify/diagnostics` (or the **Check Coolify connection**
button in `/settings`) lists the configured state and, when the env vars are
empty, best-effort discovers the first Coolify server and project. If the UUIDs
are missing the diagnostics report says `serverUuidSource: missing` /
`projectUuidSource: missing` and you should set them explicitly in Coolify env
vars.

### Prepare DEV Preview flow (coolify_api)

```
validate session/task/project
→ check branch + repo
→ compute domain (preview-<taskShortId>.dev.core01.io)
→ create/reuse PreviewDeployment (status creating)
→ create/reuse Coolify app (forge-preview-<taskShortId>)
→ trigger deployment (status deploying, coolifyDeploymentUuid saved)
→ refresh maps Coolify status → queued/deploying/ready/failed/stopped
→ Open DEV Preview
```

Never deploys to production, never merges, never touches `main`.

### Diagnostics endpoint

```
GET /api/settings/coolify/diagnostics
```

Authenticated. Returns `{ configured, baseUrl, hasToken, runnerMode,
connection, serverUuid, projectUuid, environmentName, … }`. Never returns the
token. When `COOLIFY_API_TOKEN` is missing it returns
`{ ok: false, configured: false, error: "COOLIFY_API_TOKEN is not configured" }`.

### Troubleshooting

- **401 Unauthorized** → token missing/incorrect or insufficient permissions.
  Re-check `COOLIFY_API_TOKEN` in Coolify Keys & Tokens.
- **404 endpoint** → the installed Coolify version/API differs; check the
  client in `lib/coolify/client.ts` (base path `/api/v1`) and the actual
  endpoints exposed by the instance.
- **No server UUID** → set `COOLIFY_SERVER_UUID` (or let diagnostics discover it).
- **No project UUID** → set `COOLIFY_PROJECT_UUID` (or let diagnostics discover it).
- **Domain not reachable** → verify the DNS wildcard `*.dev.core01.io` points to
  the VPS (`169.58.177.100`) and that the Coolify proxy picks up the new domain.
- **Deploy failed** → check the deployment logs in Coolify (the preview stores
  `lastDeploymentLogUrl`).

### Current limitations

- `coolify_api` is implemented but requires a real token; until then previews
  stay `not_configured`/`failed` with a clear message and `manual` mode keeps
  working.
- No preview auto-trigger at the end of a session, no cleanup/stop, no
  multi-environment management, no background queues.

## Human Approval: Prepare Production

Adds the first formal **human-approval gate before production**. Forge PREPARES
a readiness summary for a work session / task / PR, and a human can approve or
reject it. **Approve readiness no hace merge ni deploy**: the gate never merges
the PR, never deploys to production and never touches `main`.

### What it does

1. **Prepare production** (`POST /api/work-sessions/[id]/production/prepare`):
   loads the session + task + PR metadata + last PR review + session checks +
   DEV preview + changed files (safe-file policy), runs the evaluator and
   persists a `ProductionReadinessReview`.
2. **Approve** (`POST /api/production-readiness/[id]/approve`): only when the
   recommendation is `ready_for_production`. Records `approvedBy`/`approvedAt`.
3. **Reject** (`POST /api/production-readiness/[id]/reject`): requires a
   `notes` reason. Records `rejectedAt` + `humanNotes`.
4. **Refresh** (`POST /api/production-readiness/[id]/refresh`): re-evaluates and
   preserves human decisions. If the review was approved and a critical blocker
   appears, it falls back to `needs_changes`.

### Model

`ProductionReadinessReview` (`prisma/migrations/20260825000000_add_production_readiness_reviews`):
`projectId`, `taskId?`, `workSessionId?`, `previewDeploymentId?`, `status`
(`draft|ready|blocked|needs_changes|approved|rejected|cancelled`),
`recommendation` (`ready_for_production|needs_changes|blocked|manual_review_required`),
`riskLevel` (`low|medium|high|critical|unknown`), `summary`, `blockingReasons`,
`checksSummary`, `previewSummary`, `prSummary`, `filesSummary`, `humanNotes`,
`approvedBy`, `approvedAt`, `rejectedAt`.

### Readiness rules (`lib/production-readiness/evaluator.ts`)

- **PR**: must be open, target `main`, branch ≠ `main`, and have a Builder commit.
- **PR review**: `needs_changes` → `needs_changes`; `keep_draft` →
  `manual_review_required`; risk `high/critical` → `blocked`. The evaluator
  NEVER forces `ready_for_production` over a `needs_changes`/`keep_draft`.
- **Session checks**: passed = positive, skipped = warning, failed =
  `needs_changes`, timeout = `manual_review_required`.
- **DEV preview**: ready = positive, deploying = `manual_review_required`,
  failed = `blocked`, not_configured/none = `needs_changes`.
- **Safe-file policy**: blocked paths / secrets → `blocked`.

### Policy (always conservative)

- Production Readiness Gate: **Available**.
- Merge automation: **Disabled**.
- Production deploy automation: **Disabled**.
- Approval required: **Yes** (only a human can approve).

### UI

- `/work-sessions/[id]`: **Production readiness** panel (status, recommendation,
  risk, summary, blocking reasons, Approve/Reject/Refresh + "This does not merge
  or deploy").
- Task card: compact `Production: …` chip + `Prepare` / `View`.
- Project: counters `Production ready: X · Approved: Y · Blocked: Z`.
- `/settings`: `Production Readiness Gate`, `Merge automation`, `Production
  deploy automation`, `Approval required`.

### ActivityLog events

`production.prepare_requested`, `production.review_created`, `production.ready`,
`production.needs_changes`, `production.blocked`, `production.approved`,
`production.rejected`, `production.refreshed` — safe metadata only (review id,
session/task id, recommendation, risk level, preview status, PR number).

## Fase 3.8B — Resolve Readiness Needs Changes & Approval Happy Path

Closes the happy path when a task is blocked by `needs_changes`: Forge can
diagnose WHY it is not ready, re-run the PR review without touching code, apply
a corrective iteration when needed, and approve only when the real state is
`ready_for_production`. Same guardrails as Fase 3.8: never merge, never deploy
to production, never touch `main`, never force `ready_for_production`.

### Diagnostics ("Why not ready?")

`lib/production-readiness/diagnostics.ts` — `buildReadinessDiagnostics(input)`
returns structured diagnostics:

```
{
  "blocking": [],                 // real blockers (→ blocked)
  "needsChanges": [ ... ],        // required changes / manual review
  "warnings": [ ... ],            // non-blocking (e.g. checks skipped, stale review)
  "positiveSignals": [ ... ]      // what is OK (preview ready, PR open→main, files allowed)
}
```

The evaluator (`evaluateProductionReadiness`) decides from these diagnostics and
persists them on the review (`ProductionReadinessReview.diagnostics`,
migration `20260826000000_add_readiness_diagnostics`). They feed
`blockingReasons`, the human summary and the Work Session UI.

### Re-run PR review (no code changes)

Reuses the existing `POST /api/tasks/[id]/github/pr/review` (full re-analysis of
the PR via the PR Review Gate). Accessible from the Production readiness panel
and the task card. After re-running, use **Refresh readiness** to re-evaluate.

### Fix readiness issues (corrective iteration)

The panel offers **Fix readiness issues**: a form pre-filled with the detected
reasons that calls the existing iteration flow
(`POST /api/tasks/[id]/work-session/iterate`). It reuses the same task, branch
and PR — no duplicated artifacts — runs a new Builder commit if needed, re-runs
the PR review, and then **Refresh readiness** re-evaluates.

### Summary humano

`buildProductionReadinessSummary()` distinguishes:
`Forge no recomienda pasar esta tarea a producción todavía.` → **Lo que está
bien** (positive signals) → **Qué falta** (blockers + required changes) →
**Avisos** → **Siguiente paso recomendado** (re-run PR review / corrective
iteration / fix preview / fix checks).

### UI

- Work Session panel: **Why not ready?** (bloqueos, cambios requeridos, avisos,
  señales positivas, última PR Review, fecha de evaluación) + actions
  `Re-run PR review`, `Refresh readiness`, `Fix readiness issues`,
  `Approve readiness` (solo si `ready_for_production`), `Reject`.
- Task card: `Production: needs changes — PR review` + `View readiness` +
  `Re-run review`.

### Next steps

Enable `coolify_api` with a real token, preview cleanup, optional automatic
preview after sessions, and a "Stop preview" action.

### Current limitations

- Synchronous execution (no background queue / WebSockets yet); a full session
  can take a few minutes.
- No automatic merge, deploy, production approval, reviewers, or test runner yet.

## Fase 3.8C — Approval Happy Path: Ready PR + Preview inheritance + Minimal Tests

Closes the real approval happy path by satisfying the conditions Forge itself
requires — without relaxing guardrails. Still never merges, never deploys to
production and never touches `main`; `Approve readiness` only records human
approval.

### Preview inheritance (`lib/production-readiness/preview-resolver.ts`)

`resolveReadyPreviewForTask()` finds the best ready DEV preview even when the
current work session (e.g. an iteration child) has none, by priority:

1. PreviewDeployment of the current work session (ready).
2. PreviewDeployment of the same task (ready).
3. PreviewDeployment with the same `branchName` (ready).
4. PreviewDeployment with the same `pullRequestNumber` (ready).
5. Most recent ready preview for the project.

Avoids false positives: never uses `failed`/`stopped` previews, never a preview
of another repository, and prefers an exact ready preview. Diagnostics show
`Preview heredado de WorkSession <id> (branch|task|pr)` as a positive signal and
`Preview source` in the panel.

### Minimal tests (Vitest)

`vitest` is a devDependency with `"test": "vitest run --passWithNoTests"` and a
root `vitest.config.ts`. The real test for `/api/ping` (`tests/api/ping.test.ts`
or co-located) lives on the feature branch (the route only exists there, since
`main` keeps `/api/ping` 404). It checks the endpoint returns
`{ ok: true, service: "forge-core" }` and does not assume `timestamp`/`checked`.
`npm test` on `main` passes with no tests (`--passWithNoTests`). The test is
added to the PR via the **Fix readiness issues** corrective iteration (same
task, branch and PR — no duplicated artifacts). Session Checks allowlist now
includes `npm test` (hardcoded, safe, short timeout; runner still disabled by
default).

### PR ready for review + approval happy path

1. Add minimal tests to the PR (corrective iteration).
2. `Re-run PR review` → `POST /api/tasks/[id]/github/pr/review` (new `pr-review`
   AgentRun). It should return `ready_for_review` with risk `low`/`medium`.
3. `Mark PR ready for review` → `POST /api/tasks/[id]/github/pr/ready`
   (GraphQL `markPullRequestReadyForReview`, no merge; requires the last review
   to recommend ready).
4. `Refresh readiness` → re-evaluates PR (not draft), tests present, preview
   inherited/ready, files allowed, checks passed/skipped.
5. `Approve readiness` → only when `recommendation = ready_for_production`;
   records `approvedBy`/`approvedAt` + `production.approved`. **Never merges or
   deploys.**

### UI

- Work Session panel: `Preview source`, `Preview URL`, `Tests` (yes/no),
  `PR draft` (yes/no) + actions `Re-run PR review`, `Mark PR ready for review`
  (solo si draft), `Refresh readiness`, `Fix readiness issues`,
  `Approve readiness` (solo si `ready_for_production`), `Reject`.
- Task card: `Production: needs changes — PR review` / `— PR draft` / `— tests`
  + `View readiness` + `Re-run review`.

### Guardrails (unchanged)

`Approve readiness` **no hace merge ni deploy**; la PR sigue abierta y `main`
permanece intacto (`/api/ping` 404 hasta que un humano haga merge).

## Fase 3.9 — Controlled Production Promotion

Añade el paso final: **promover a producción** un cambio ya aprobado. A
diferencia de todo lo anterior, esto **sí puede mergear a `main`**, pero solo
bajo condiciones estrictas y una confirmación humana explícita.

> **Resumen:** `Prepare promotion` solo hace preflight (nunca mergea).
> `Execute promotion` requiere escribir literalmente **`PROMOTE`**, re-ejecuta
> el preflight, mergea la PR vía GitHub API, espera al despliegue y verifica
> `/api/health` + el endpoint esperado en producción.

### Condiciones para promover (preflight)

`runProductionPromotionPreflight()` re-valida **en el momento de la promoción**:

1. `readiness.approved` — existe una revisión `approved` con recomendación
   `ready_for_production`.
2. `pr.ready` — la PR existe, está abierta, **no es draft**, **no está
   mergeada** y su base es `main`.
3. `pr.review` — la última PR Review recomienda `ready_for_review`.
4. `preview.ready` — hay una preview DEV lista con URL verificada.
5. `files.safe` — el diff de la PR no toca rutas bloqueadas por safe-file-policy.
6. `checks.no_critical_fails` — no hay fallos críticos en los checks del trabajo.

Si algo falla → `preflight_failed` con la lista de `blockingReasons`. **No se
mergea nada.**

### Modelo `ProductionPromotion`

Campos: `projectId`, `taskId?`, `workSessionId?`, `productionReadinessReviewId?`,
`previewDeploymentId?`, `status` (`draft|preflight_failed|ready_to_promote|
promoting|merged|deploying|verifying|completed|failed|cancelled`), `strategy`
(`github_pr_merge`), `mergeMethod` (`squash`), `prNumber?`, `prUrl?`,
`branchName?`, `baseBranch?`, `mergeCommitSha?`, `preflightSummary Json?`,
`deploymentSummary Json?`, `verificationSummary Json?`, `metadata Json?`,
`requestedBy?`, `requestedAt?`, `startedAt?`, `completedAt?`, `failedAt?`,
`cancelledAt?`.

### Flujo

1. `POST /api/production-readiness/[id]/promotion/prepare` — preflight →
   crea la `ProductionPromotion` en `ready_to_promote` (o `preflight_failed`).
   **Nunca mergea.**
2. `POST /api/production-promotions/[id]/execute` — requiere `{ confirm:
   "PROMOTE" }` (si no, HTTP 400). Re-ejecuta el preflight → `promoting` →
   `mergePullRequest()` (GitHub REST `PUT /pulls/{n}/merge`, método `squash`,
   título `Promote task <taskId>: <title>`) → `merged` (guarda `mergeCommitSha`)
   → `deploying` (espera el despliegue: `PRODUCTION_DEPLOY_WAIT_MS`=180s,
   poll `PRODUCTION_DEPLOY_POLL_INTERVAL_MS`=10s, modo `wait_for_existing_deploy`)
   → `verifying` → `completed`|`failed` con `verificationSummary`
   (`{ health, expectedEndpoint, prMerged, mergeCommitSha }`).
3. `POST /api/production-promotions/[id]/refresh` — re-lee el estado del merge y
   vuelve a sondear salud + endpoint. **Nunca re-mergea.**

`mergePullRequest()` (en `lib/github/pull-requests.ts`) **no borra la rama** y
**no cierra la issue** asociada. La verificación usa `PRODUCTION_BASE_URL`
(por defecto `https://forge-app.dev.core01.io`): `/api/health` y el endpoint
esperado derivado del diff (`app/api/ping/route.ts` → `/api/ping`).

### Actividad

Nuevos eventos `promotion.*`: `prepare_requested`, `preflight_passed`,
`preflight_failed`, `ready`, `execute_requested`, `merge_started`, `merged`,
`deploy_wait_started`, `verification_started`, `completed`, `failed`,
`refreshed`, `cancelled`. Metadata segura (ids, `prNumber`, `status`,
`mergeCommitSha`, `healthStatus` — nunca tokens).

### UI

- Work Session: panel **Production promotion** bajo Production readiness.
  Estados: No preparada / Preflight fallido / Listo para promover / Promoviendo
  / Mergeado / Desplegando / Verificando / Completado / Fallido / Cancelado.
  Acciones: `Prepare promotion` (solo si readiness aprobada), `Execute
  promotion` (solo si `ready_to_promote`, modal con input **PROMOTE**),
  `Refresh promotion`. Textos de advertencia: "Esto sí mergea la PR en main" y
  "Esto puede lanzar el despliegue de producción".
- Task card: chip compacto `Promotion: not prepared / ready / completed /
  failed` + `Prepare promotion` (solo si readiness aprobada) + `View promotion`.
- Proyecto: contador `Promotions ready: X · Promotions completed: Y ·
  Promotions failed: Z`.
- Settings: fila `Production promotion` (estrategia, método de merge, base URL,
  ventana de espera).

### Qué NO hace la promoción

- No fuerza `ready_for_production`: si la readiness no está aprobada, el
  preflight falla.
- No mergea sin `PROMOTE`: la confirmación es obligatoria (HTTP 400 si no).
- No hace auto-rollback: si la verificación falla tras el merge, queda
  `failed` con un error claro; un humano decide qué hacer.
- No borra la rama de la PR ni cierra la issue.
- No imprime tokens ni secretos.

### Variables de entorno

```bash
PRODUCTION_BASE_URL="https://forge-app.dev.core01.io"
PRODUCTION_PROMOTION_MODE="github_merge"
PRODUCTION_DEPLOY_WAIT_MS="180000"
PRODUCTION_DEPLOY_POLL_INTERVAL_MS="10000"
```

### Troubleshooting

- **Preflight fallido**: mira `blockingReasons` en el panel. Típicamente falta
  `Approve readiness` (y que la PR Review diga `ready_for_review`).
- **Ejecutar devuelve 400**: el cuerpo no contenía `"PROMOTE"`.
- **El PR se mergea pero el endpoint sigue 404**: Coolify puede no auto-desplegar
  al hacer merge. Lanza el deploy manualmente (Actions → Deploy) y pulsa
  `Refresh promotion` para completar la verificación.
- **Verificación fallida tras merge**: revisa `verificationSummary`
  (`health.status`, `expectedEndpoint.status`). No hay rollback automático.

## Fase 4.0 — Async Promotion Jobs & Recovery

### Por qué existe

En Fase 3.9 el `execute` hacía todo dentro de la request HTTP (merge +
deploy wait hasta 180s + verify). El proxy cortaba la request con un 502 a los
~60s, aunque el merge y el estado se guardaban correctamente en el servidor y la
promoción se podía recuperar con Refresh. Para no depender de requests HTTP
largas, Fase 4.0 introduce un sistema simple de **jobs asíncronos y
recuperación**, empezando por `ProductionPromotion`.

### Modelo `JobRun`

Tabla `JobRun` (migración `20260828000000_add_job_runs`):

```
type            production_promotion | preview_deployment | session_checks | work_session
status          queued | running | waiting | completed | failed | cancelled | stale | recovered
resourceType / resourceId   el recurso del job (p.ej. production_promotion / <id>)
projectId / taskId / workSessionId
currentStage / progressPercent / summary / error
input / result / metadata   (Json, sin secretos)
lockedAt / lockedBy / startedAt / finishedAt / failedAt / cancelledAt / lastHeartbeatAt
createdAt / updatedAt
```

`ProductionPromotion.jobRunId` (nullable, único) enlaza la promoción a su job.

### Cómo evita el 502

```
POST /execute
├─ valida sesión + confirm "PROMOTE"
├─ gate rápido de readiness (approved)
├─ crea JobRun type=production_promotion
├─ enlaza jobRunId + marca promotion "promoting"
├─ lanza el job en background (inline runner)
└─ responde YA: { ok, promotionId, jobRunId, status: "queued" }
```

El merge/deploy/verify corren en el job; la request vuelve en milisegundos.
**El runner actual es inline/background simple (continuación en el mismo
proceso Node), NO es una cola distribuida.** Está diseñado para poder moverse a
una cola real (Redis/BullMQ) más adelante sin cambiar el dominio.

### Stages del job

```
preflight    (10%)  re-ejecuta todos los guardrails
merge        (35%)  mergePullRequest vía GitHub API (squash)
deploy_wait  (60%)  espera a que main recoja el merge (poll /api/health + endpoint)
verify       (85%)  verifica PR merged + salud + endpoint esperado
complete     (100%) promotion completed | failed (sin rollback automático)
```

Cada stage actualiza `JobRun.currentStage`, `JobRun.progressPercent`,
`ProductionPromotion.status` y `ActivityLog` (`job.stage_*`, `promotion.*`).

### Endpoints

```
GET  /api/jobs/[id]           estado seguro del job (stage, %, error, timestamps)
POST /api/jobs/[id]/recover   recuperación manual desde la etapa correcta
POST /api/production-promotions/[id]/execute    (async, responde "queued")
POST /api/production-promotions/[id]/refresh    (sincroniza el JobRun si existe)
```

### UI

- `ProductionPromotionPanel` (WorkSession): al pulsar Execute muestra al momento
  "Promotion job started", Stage, progreso y Refresh. Polling cada 5s mientras el
  job está activo. Botón **Recover job** si el job es stale/failed recuperable.
- `TaskProductionPromotion` (TaskCard): `Promotion: promoting` + `Job: deploy_wait · 70%`.
- Settings: `Async Jobs: Available · Promotion execution: Async · Job polling:
  Enabled · Background queue: Inline runner · Recovery: Manual`.

### Recovery (idempotente)

Regla central: **una vez la PR está merged, el recovery NO repite el merge.**

- PR ya mergeada → el job se reanuda desde `deploy_wait` / `verify`.
- PR sin mergear → el job se reanuda desde `preflight` (guardrails re-evaluados).
- Si el endpoint no aparece tras el timeout → promotion `failed`, job `failed`,
  error claro, **sin rollback automático**.

### Limitaciones actuales

- El runner es inline (misma instancia Node); no hay cola distribuida, workers
  ni WebSockets. Si el contenedor se reinicia a mitad de job, el job queda
  `running`/`stale` y se recupera manualmente vía `/api/jobs/[id]/recover` o
  Refresh (marca `stale` si no hay heartbeat).
- No hay retry automático agresivo, cleanup automático ni rollback.
- Solo `production_promotion` tiene recuperación implementada; los demás tipos
  de `JobRun` están definidos pero no se usan todavía.

### Próximos pasos

- Validar el flujo async completo con una micro-tarea nueva (p.ej.
  `/api/version-lite`) end-to-end.
- Mover el runner a una cola real (Redis/BullMQ) y workers distribuidos.
- Telemetría/retry programado y cleanup de jobs.

## Fase 4.2 — Production Deploy Trigger via Coolify API

### Por qué existe

Fase 4.1 detectó que **Coolify no auto-despliega `main` tras el merge de una
PR** (la app Forge es de deploy manual). El job async mergeaba la PR pero el
deploy de producción había que lanzarlo a mano, y el `deploy_wait` (180s) podía
expirar dejando la promoción `failed` hasta un recovery manual.

Fase 4.2 cierra ese hueco: tras el merge, el propio job lanza el deploy de la
app principal vía la API de Coolify.

### Variables de entorno

```
PRODUCTION_DEPLOY_MODE="manual_wait"          # manual_wait | coolify_api
PRODUCTION_COOLIFY_APPLICATION_UUID=""        # UUID de la app de producción
PRODUCTION_DEPLOY_TRIGGER_TIMEOUT_MS="30000"  # timeout del trigger
PRODUCTION_DEPLOY_WAIT_MS="180000"            # ventana de espera
PRODUCTION_DEPLOY_POLL_INTERVAL_MS="10000"    # polling
```

- `manual_wait` (por defecto): NO llama a Coolify; espera/pollea los endpoints.
  El deploy lo lanza un humano. Comportamiento de Fase 4.1.
- `coolify_api`: el job resuelve la app principal y llama
  `POST /api/v1/applications/{uuid}/start` (action_deploy) tras el merge.

### Cómo descubrir / configurar la app UUID

1. Si `PRODUCTION_COOLIFY_APPLICATION_UUID` está seteado, se usa directamente.
2. Si no, Forge lista las apps de Coolify y la descubre por dominio
   (`PRODUCTION_BASE_URL` → coincide con el campo `domains` de la app).
3. Si no se puede resolver, error claro y la promoción queda `failed` recuperable
   (sin tocar nada).

### Flujo del job

```
preflight(10) → merge(35) → trigger_deploy(50) → deploy_wait(70) → verify(90) → complete(100)
```

- `trigger_deploy` en modo `coolify_api`: resuelve app → trigger → guarda
  `deploymentSummary` con `{ mode, applicationUuid, triggered, deploymentUuid,
  triggeredAt, status }` → `promotion.deploy_triggered`.
- `deploy_wait`: espera a que `/api/health` + endpoint esperado respondan.
- `complete`: `completed` | `failed` (sin rollback).

### Recovery

- PR ya mergeada + deploy no lanzado (modo `coolify_api`) → reanuda desde
  `trigger_deploy` (nunca re-mergea).
- PR ya mergeada + deploy lanzado → reanuda desde `deploy_wait` / `verify`.
- Promoción ya `completed` → recovery no hace nada peligroso.
- Endpoint ya responde → `completed`.

### Guardrails

- No merge sin readiness approved · No execute sin `PROMOTE` · No repetir merge ·
  No deploy fuera del flujo · No rollback automático · No se imprimen tokens ·
  No se toca firewall/SSH/VPS · No se relaja safe-file-policy.

### Troubleshooting

- `401/403` → token Coolify incorrecto o allowlist de IPs de la API.
- `missing application uuid` → configurar `PRODUCTION_COOLIFY_APPLICATION_UUID`
  o revisar el dominio de la app en Coolify.
- `trigger failed` → revisar el endpoint `POST /applications/{uuid}/start` y los
  permisos del token.
- `deploy timeout` → revisar los logs de Coolify del deployment lanzado.
- `verification failed` → revisar la app principal (health/endpoint).

## Fase 4.2B — Clean Production Deploy Job Completion

### Por qué existe

La validación real de Fase 4.2 destapó dos problemas en el camino feliz:

1. El job usaba el objeto `ProductionPromotion` cargado UNA vez al inicio;
   las etapas que dependen de `deploymentSummary` / `verificationSummary` /
   `mergeCommitSha` leían datos obsoletos (fix original `a0c5440`, reforzado
   aquí en `verify`/`complete`).
2. La ventana `deploy_wait` (180s) es menor que un build real de Coolify
   (~5-10 min) → el job expiraba y quedaba `failed` hasta un `Recover`/`Refresh`.

El objetivo de 4.2B es que una promoción real termine en `completed` **sin**
`Refresh` correctivo ni `Recover` manual ni deploy manual.

### Recarga de Promotion fresca por etapa

Regla: si una etapa depende de `deploymentSummary`, `verificationSummary`,
`mergeCommitSha` o `status`, **recarga `ProductionPromotion` desde BD** antes de
leer/escribir. Afecta a `runTriggerDeployStage`, `runDeployWaitStage`,
`runVerifyStage`, `runCompleteStage`, `recoverProductionPromotionJob` y
`refreshProductionPromotion`.

### Timeout recomendado

```
PRODUCTION_DEPLOY_WAIT_MS="600000"   # 10 min, cubre builds reales de Coolify
PRODUCTION_DEPLOY_POLL_INTERVAL_MS="10000"
```

### deploy_wait mejorado

Durante `deploy_wait` se consulta, en este orden:

```
1. Estado del deployment en Coolify (si hay deploymentUuid) — getProductionDeploymentStatus
2. Poll de /api/health
3. Poll del endpoint esperado
```

- Un deploy de Coolify en `queued`/`in_progress` NO falla la espera (sigue
  dentro de ventana).
- Si Coolify reporta `failed`/`error` → falla rápido con mensaje claro.
- Metadata segura guardada en `deploymentSummary`:
  `{ deploymentUuid, coolifyStatus, healthOk, endpointOk }` (sin logs ni tokens).

### Recovery idempotente

- PR mergeada → **nunca re-mergea**.
- Deploy no lanzado (modo `coolify_api`) → reanuda desde `trigger_deploy`.
- Deploy lanzado pero Coolify lo reporta `failed` y el usuario pulsa `Recover`
  → reanuda desde `trigger_deploy` (relanza, no re-mergea).
- Deploy lanzado y en curso / endpoint ya responde → reanuda desde `deploy_wait`
  → `verify` → `complete`.
- Promoción `completed` → recovery no-op seguro.

## Fase 4.3 — Detached Job Runner

### Qué problema resuelve

Fase 4.2B confirmó que el runner inline muere cuando Forge dispara el deploy de
su propia app: Coolify reemplaza el contenedor y mata el proceso donde corría el
job, dejándolo `running`/`stale` hasta un `Recover` manual (aunque el endpoint ya
estuviera live).

Fase 4.3 separa la ejecución de jobs largos de la web:

```
forge-web      sirve UI/API, ENCOLA JobRuns (nunca los ejecuta inline)
forge-worker   proceso separado: poll JobRuns queued/stale/reclaimable,
               lock + heartbeat en BD, ejecuta las stages, completed/failed
```

El worker sobrevive al redeploy de la web porque vive en su propio contenedor.
Sin Redis todavía: **polling + locks con UPDATE condicional en Postgres**.

### Variables de entorno

```
JOB_WORKER_ENABLED="false"              # true solo en el proceso worker
JOB_WORKER_ID="forge-worker"
JOB_WORKER_POLL_INTERVAL_MS="5000"
JOB_WORKER_LOCK_TIMEOUT_MS="120000"
JOB_WORKER_HEARTBEAT_MS="10000"
JOB_WORKER_MAX_CONCURRENT_JOBS="1"
JOB_WORKER_TYPES="production_promotion"
```

Por defecto: **web** `JOB_WORKER_ENABLED=false` (solo encola) · **worker**
`JOB_WORKER_ENABLED=true` (procesa la cola).

### Cómo arrancar el worker

```
npm run worker        # tsx scripts/job-worker.ts — mantiene vivo el proceso
```

`tsx` está en `dependencies` (se necesita en producción). Logs mínimos y sin
secretos: `[worker] started`, `[worker] picked job ...`, `[worker] completed
job ...`, `[worker] failed job ...`.

### Cómo crear el servicio `forge-worker` en Coolify

1. Crear una nueva app/servicio desde el **mismo repo** `infiniteroles/forge-core`.
2. Nombre: `forge-worker` (puede ser un servicio auxiliar, no una app web).
3. Comando de arranque: `npm run worker`.
4. Mismas env vars seguras necesarias que Forge web (al menos `DATABASE_URL`,
   `AUTH_SECRET` si hiciera falta, y las de GitHub/Coolify que usa la promoción:
   `GITHUB_TOKEN`, `COOLIFY_API_TOKEN`, `COOLIFY_BASE_URL`, `COOLIFY_PROJECT_UUID`,
   `COOLIFY_SERVER_UUID`, `PRODUCTION_*`, `DEEPSEEK_*` si aplica).
5. `JOB_WORKER_ENABLED=true`.
6. **No exponer dominio público** · **No abrir puertos** · No `NEXT_PUBLIC_*`.

### Modelo de worker

- `WorkerState` (nueva tabla): el worker hace `upsert` de su heartbeat cada poll;
  la web usa `isWorkerActive()` para saber si hay worker y decidir el dispatch.
- `lib/jobs/worker.ts`: `startJobWorker()`, `runWorkerLoop()`, `tickWorker()`,
  `findNextRunnableJob()`, `claimJobRun()`, `heartbeatJobRun()`, `releaseJobRun()`.
- Claim atómico: `updateMany` con predicado `queued|stale|(running/waiting con
  heartbeat expirado)` — solo un worker gana. Heartbeat refresca el lock mientras
  corre la stage (cubre `deploy_wait` de 600s).
- El worker reutiliza `runProductionPromotionJob(jobRunId, { fromStage })` — sin
  duplicar lógica de stages (preflight → merge → trigger_deploy → deploy_wait →
  verify → complete), que siguen actualizando `JobRun` + `ProductionPromotion` +
  `ActivityLog`.

### Execute / Recovery

- `POST /execute` → valida `PROMOTE`, crea `JobRun` `queued`, enlaza
  `promotion.jobRunId`, devuelve `{ ok, promotionId, jobRunId, status: "queued" }`.
  La web **nunca ejecuta inline**.
- `POST /jobs/[id]/recover` → si hay worker activo (`isWorkerActive()`), marca el
  job `queued` con el stage de reanudación (`recoveryFromStage`) para que el
  worker lo procese; si no hay worker, ejecuta el recovery inline como fallback
  manual. Nunca repite el merge si la PR ya está mergeada.

### Limitaciones

- Sin Redis todavía: el poll es por intervalos (5s) y el lock es de base de datos
  (suficiente para 1 worker / 1 job concurrente). No es una cola distribuida.
- `JOB_WORKER_MAX_CONCURRENT_JOBS` limita el claim por poll; el worker actual
  procesa un job por tick (secuencial).
- Si no hay worker desplegado, los jobs quedan `queued` hasta que exista uno (o
  se use el recovery inline manual).

### Guardrails

- No merge sin readiness approved · No execute sin `PROMOTE` · No repetir merge ·
  No deploy fuera del flujo · No cerrar issues · No borrar previews/branches ·
  No imprimir tokens · No tocar firewall/SSH/VPS · No relajar policies.

## Fase 4.4 — Worker Operations Hardening

Endurece la operación diaria del `forge-worker`: mejor visibilidad del estado,
runbook operativo y checklist de rotación de tokens. **Sin** nuevas features
grandes, sin Redis/BullMQ, sin cleanup automático.

### Regla de ejecución (worker vs inline)

```
Worker activo  → la web SOLO encola; el worker procesa
Worker no activo → la web puede usar fallback inline controlado
```

La UI lo refleja en el panel de job:

```
Runner: detached       ← worker activo (isWorkerActive())
Runner: inline fallback ← sin worker activo (fallback controlado)
Runner: unknown        ← modo desconocido
```

El fallback inline existe para no romper el flujo si el worker no está
desplegado o se cae; cada vez que se usa se registra un evento
`worker.fallback_used` (y `worker.marked_inactive` si el worker estaba activo y
su heartbeat quedó stale). Cuando el worker vuelve a hacer heartbeat, la web
vuelve a encolar y deja de ejecutar inline automáticamente.

### Visibilidad del worker

- **Settings**: `Worker active`, `Worker ID`, `Last heartbeat`, `Last heartbeat
  age`, `Worker mode`, `Fallback inline`, `Poll interval`, `Lock timeout`,
  `Heartbeat interval`, `Max concurrency`, `Job types`, `Last picked /
  completed / failed job`.
- **Panel de promoción/job**: `Runner`, `Worker expected`, `Job locked by`,
  `Last heartbeat`, `Stale`, `Recover available`.
- Helper seguro `lib/jobs/worker-state.ts` → `getWorkerStateSummary()` (sin
  secretos: solo booleans/números/ids/fechas).

### Runbook operativo

#### Qué hacer si el worker cae

1. Ver `Coolify → forge-worker → Runtime Logs`. Debe verse `[worker] started`.
2. Si el contenedor está `Exited`/`Restarting`: mirar el log de arranque
   (error de `DATABASE_URL`, migración, etc.), corregir env, redeploy del worker.
3. Mientras no haya worker, la web usa el fallback inline (jobs queued → inline).
4. Tras recuperarlo, Settings debe volver a `Worker active: Yes`.

#### Qué hacer si un job queda stale

1. Identificar el `JobRun` (panel de promoción → `Stale: yes`).
2. Comprobar si el worker sigue vivo (Settings → `Worker active`).
3. Si el worker está vivo: pulsar `Recover job` — re-encola con el stage de
   reanudación para el worker (nunca repite merge).
4. Si el worker está caído: recuperarlo primero y luego `Recover job` (usará
   fallback inline si sigue sin worker).

#### Qué hacer si falla la API de Coolify

1. Ver el resumen de la stage `trigger_deploy`/`deploy_wait` en el job
   (`deploymentSummary`: `coolifyStatus`, `error`).
2. Comprobar `COOLIFY_API_TOKEN` (Settings → Coolify diagnostics → connection)
   y que la IP del servidor esté en la allowlist de la API.
3. Reintentar con `Refresh promotion` o `Recover job`; el job es idempotente
   (no re-mergea una PR ya mergeada).

#### Qué hacer si falla el token de GitHub

1. `Settings` / logs del job → errores de la etapa `merge` (`401`,
   `Bad credentials`).
2. Regenerar `GITHUB_TOKEN`, actualizar web y worker, redeploy ambos.
3. Reintentar con `Recover job`.

#### Qué hacer si una promoción queda en `failed`

1. Abrir el job y leer `error` + `verificationSummary`/`deploymentSummary`.
2. Si la PR ya se mergeó pero falló el deploy/verify: tras arreglar el deploy
   (manual o API), pulsar `Refresh promotion` o `Recover job` → reanuda desde
   `deploy_wait`/`verify` sin repetir el merge.
3. Si falló antes del merge: `Recover job` → reanuda desde `preflight`.

#### Cómo recuperar un job

```
POST /api/jobs/[id]/recover      # o botón "Recover job" en el panel
```

- Worker activo → re-encola para el worker (`recoveryFromStage`).
- Sin worker → fallback inline.
- Nunca repite el merge de una PR ya mergeada.

#### Cómo validar que el worker está activo

- Settings → `Worker active: Yes` y `Last heartbeat age` < 60s.
- `Coolify → forge-worker → Runtime Logs` → `[worker] started` y logs de pick.

#### Cómo redeployar web y worker

- **Web**: `Coolify → forge-web (forge-app.dev.core01.io) → Actions → Deploy`
  (toma main, corre migraciones con `prisma migrate deploy` al arrancar).
- **Worker**: `Coolify → forge-worker → Actions → Deploy` (misma imagen; el
  Dockerfile arranca `npm run worker` cuando `JOB_WORKER_ENABLED=true`).
- Validar tras deploy: `curl https://forge-app.dev.core01.io/api/health` →
  `200`, y Settings → `Worker active: Yes`.

### Rotación de tokens (checklist)

> Manual, fuera de Copilot. **Nunca** pegar tokens en commits, logs, README,
> ActivityLog ni respuestas.

1. Crear un nuevo `COOLIFY_API_TOKEN` en Coolify (Keys & Tokens).
2. Actualizar `COOLIFY_API_TOKEN` en **forge-web** (env vars).
3. Actualizar `COOLIFY_API_TOKEN` en **forge-worker** (env vars).
4. Redeploy de web y worker.
5. Validar: Settings → Coolify diagnostics → connection OK.
6. Revocar el token antiguo de Coolify.
7. Si aplica, crear un nuevo `GITHUB_TOKEN` (PAT con scopes del repo).
8. Actualizar `GITHUB_TOKEN` en forge-web y forge-worker.
9. Validar: `gh` read/write OK y una operación de PR read (no hace falta una
   promoción completa).

### Cleanup (fase futura, NO en esta fase)

Esta fase **no** borra nada automáticamente: previews, branches, issues, JobRuns
antiguos ni promociones antiguas se conservan. El cleanup se documenta como
trabajo futuro.

## Fase 4.5 — Pragmatic LLM Cost & Context Efficiency

Primera pasada de eficiencia de coste/contexto LLM. **No** cambia la
arquitectura ni el flujo funcional (WorkSession / Preview / Readiness /
Promotion / Worker intactos); solo reduce llamadas y contexto y añade
visibilidad.

### Qué se mide

`AgentRun` (migración `20260831000000_add_agent_run_usage_metrics`) guarda, por
llamada LLM (Builder Proposal, Builder Commit, PR Review, Planner):

```
promptTokens · completionTokens · totalTokens · estimatedCostUsd · provider
```

- `usage` se guarda **solo cuando el proveedor lo devuelve**; si no, queda
  `null` (no se inventa nada).
- `estimatedCostUsd` se calcula **solo si hay precios configurados**:
  `LLM_DEEPSEEK_INPUT_COST_PER_1M` / `LLM_DEEPSEEK_OUTPUT_COST_PER_1M`
  (USD por 1M tokens). Si no hay precios → `n/a`.
- `LLM_COST_TRACKING_ENABLED="true"` (por defecto). Nunca bloquea nada.

UI: `/work-sessions/[id]` muestra `LLM calls · Tokens · Est. cost` por sesión y
tokens/coste por run; `AgentRunCard` muestra tokens/coste si existen; `/settings`
muestra la config de eficiencia.

### Qué se reutiliza

- **PR Review por head SHA** (`lib/llm-efficiency/pr-review-cache.ts`): si la
  última review se generó para el mismo `head` de la PR y no hay commits nuevos,
  se **reutiliza** en vez de llamar al modelo. Evento `pr_review.reused`.
  Aplicado en el endpoint de re-run y en la stage `analyze_pr`. Para forzar:
  `POST /api/tasks/[id]/github/pr/review?force=1`. No marca `ready` si la review
  existente no lo está.
- **Builder Proposal**: si ya existe una `completed` con `safe_to_attempt_next`
  y no es una iteración (nueva instrucción), se reutiliza. Evento
  `builder.proposal.reused`. En iteraciones siempre se regenera.

### Cuándo se re-ejecuta PR Review

- Cambió el head de la PR (nuevo commit) → se re-ejecuta.
- No hay review previa → se ejecuta.
- `?force=1` → se ejecuta aunque no haya cambios.

### Context budget (`lib/llm-efficiency/context-budget.ts`)

Límites configurables y conservadores:

```
LLM_CONTEXT_MAX_FILES="8"                # archivos leídos del repo
LLM_CONTEXT_MAX_FILE_BYTES="20000"       # bytes por archivo
LLM_CONTEXT_MAX_TOTAL_BYTES="80000"      # bytes totales
LLM_CONTEXT_INCLUDE_ACTIVITY_LIMIT="20"  # eventos de actividad incluidos
```

Se aplican a `getLimitedRepositoryContext` / `readRepoFiles` (GitHub) y a los
sumarios embebidos en el contexto del Builder (ActivityLog y work-session
summaries truncados). No incluye README entero salvo necesario, ni logs largos,
ni output completo de AgentRuns (solo summary).

### Simple task detection (`lib/llm-efficiency/simple-task-detector.ts`)

Detección conservadora de tareas triviales ("Añadir endpoint GET /api/foo que
devuelva {...}"). **Nunca** se aplica si la petición toca BD, auth, infra, env
vars, pagos, seguridad, permisos o ficheros bloqueados. En esta fase solo
detecta y lo registra en ActivityLog (`llm.simple_task_detected`) — la ruta
barata no está automatizada al 100%.

### Budget por WorkSession (`lib/llm-efficiency/session-budget.ts`)

```
LLM_MAX_CALLS_PER_WORK_SESSION="5"
LLM_MAX_CALLS_PER_ITERATION="3"
LLM_WARN_AFTER_CALLS="3"
```

No agresivo: por defecto sin límites. Si se supera `warn_after` → aviso
(`llm.budget.warning`); si se supera el máximo → la sesión se pausa y pide
decisión humana (`llm.budget.exceeded`).

### Prompts compactos (`lib/llm/prompts/`)

`guardrails.ts` (guardrails compactos reutilizables) y `compact-context.ts`
(helpers para truncar summaries/actividad). Reducen verbosidad sin cambiar el
comportamiento.

### Micro-feature

`GET /api/efficiency-lite` → `{ "efficiency": "lite" }` (+ test) para validar el
deploy del modo eficiente. No es obligatorio promocionarla a producción.

### Pendientes de optimización futura (NO en esta fase)

Modelo de costes exacto por proveedor, dashboard financiero avanzado, caché
semántica, RAG persistente / vector DB, fine-tuning, multi-model routing
avanzado, colas/batching para LLM, y auto-selección de modelo por coste.

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

