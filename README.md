# Forge Core01

Development control plane for agent-assisted projects.

Forge Core01 is the internal control plane for INFINITEROLES / CORE01. It lets you
create development projects, capture instructions for agents, track project status,
review activity, and (later) connect Telegram, GitHub, Coolify and DeepSeek.

## Stack

- **Next.js 15** (App Router) + React 19 + TypeScript
- **Prisma** + PostgreSQL
- **Tailwind CSS** (dark, minimal UI)
- **Zod** (validation), **bcryptjs** (password hashing), **jose** (JWT session cookies)

## Local setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Then fill in `.env`:

- `DATABASE_URL` — PostgreSQL connection string.
- `AUTH_SECRET` — a long random string used to sign session cookies.
- `ADMIN_EMAIL` — the single admin email used to log in.
- `ADMIN_PASSWORD_HASH` — a bcrypt hash of the admin password.
- `NEXT_PUBLIC_APP_URL` — public URL of the app (used for absolute links).

Generate the admin password hash with:

```bash
node -e "console.log(require('bcryptjs').hashSync('your-password', 12))"
```

### 3. Start PostgreSQL (local)

```bash
docker compose up -d db
```

The local database is `forge_core` with user `forge` / password `forge_dev_password`.

### 4. Run migrations

```bash
npx prisma migrate deploy
```

### 5. Seed (optional)

Creates the admin user (from env) and an example project:

```bash
npm run db:seed
```

### 6. Run the app

```bash
npm run dev
```

Open http://localhost:3000.

## Healthcheck

```bash
curl http://localhost:3000/api/health
# {"status":"ok","service":"forge-core","timestamp":"..."}
```

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
- `PATCH /api/projects/[id]` — update a project.
- `POST /api/instructions` — create an instruction.

Mutating endpoints require an authenticated session.

## Security notes

- Single admin user, configured via `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` (bcrypt).
- Sessions are signed JWTs stored in `httpOnly` cookies (`AUTH_SECRET`).
- `/dashboard` and `/projects` are protected by middleware.
- Do not commit real secrets. `.env` is gitignored.
