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
- Read-only `/settings` page describing the deployment and integration status.
- Healthcheck endpoint at `/api/health`.

Not implemented yet (planned for later phases): assigning tasks to real agents, GitHub App, Telegram, Coolify API, LiteLLM, Ollama, real code-writing agents.

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

