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
- Read-only `/settings` page describing the deployment and integration status.
- Healthcheck endpoint at `/api/health`.

Not implemented yet (planned for later phases): assigning tasks to real agents, GitHub App, Telegram, LiteLLM, Ollama, real test runner, automatic merge/deploy, automatic preview cleanup, preview auto-trigger at end of session.

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

`preview.prepare_requested`, `preview.created`, `preview.deployment_started`,
`preview.ready`, `preview.failed`, `preview.not_configured`, `preview.refreshed`,
`preview.manual_registered`. Metadata includes `previewDeploymentId`,
`workSessionId`, `taskId`, `previewUrl`, `status`, `provider` — never tokens or
secrets.

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

### Current limitations

- Synchronous execution (no background queue / WebSockets yet); a full session
  can take a few minutes.
- No automatic merge, deploy, production approval, reviewers, or test runner yet.

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

