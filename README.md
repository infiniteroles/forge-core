# Forge Core01

Development control plane for agent-assisted projects.

Forge Core01 is the internal control plane for INFINITEROLES / CORE01. It lets you
create development projects, capture instructions for agents, track project status,
review activity, and (later) connect Telegram, GitHub, Coolify and DeepSeek.

## Current status (MVP)

- Single-admin auth (email + bcrypt password, JWT session cookie).
- Projects: create, edit, archive (logical, no hard delete) and detail view.
- Instructions: capture work for future agents (manual source for now).
- Activity log: timeline of `project.created`, `project.updated`, `project.archived`, `instruction.created`.
- Read-only `/settings` page describing the deployment and integration status.
- Healthcheck endpoint at `/api/health`.

Not implemented yet (planned for later phases): DeepSeek, Telegram, GitHub App, Coolify API, real agents.

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
- `POST /api/instructions` — create an instruction.

Mutating endpoints require an authenticated session.

## Security notes

- Single admin user, configured via `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` (bcrypt).
- Sessions are signed JWTs stored in `httpOnly` cookies (`AUTH_SECRET`).
- `/dashboard`, `/projects` and `/settings` are protected by middleware.
- Do not commit real secrets. `.env`, `.env.*`, `.credentials`, `*.pem`, `*.key` and `*.crt` are gitignored (`.env.example` is the only tracked env template).

## Pending

- DeepSeek integration
- Telegram bot
- GitHub App
- Coolify API
- Real agent runs

