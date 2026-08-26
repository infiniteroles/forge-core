# AGENTS.md — Instrucciones para agentes IA / Copilot

Guía para agentes (Copilot, Claude, etc.) que trabajen en este repositorio. Léela antes de tocar código.

## Qué es

Control plane (Next.js 15 App Router + Prisma/PostgreSQL + DeepSeek + GitHub + Coolify) que crea proyectos, lanza work sessions autónomas de desarrollo (issue→branch→PR→builder→review), gestiona previews y promociones a producción, y ofrece un **Chat Composer** (`/composer`) que construye apps de cero (spec → propuesta → plan → build autónomo → preview).

## Comandos clave (¡hay trampas en este entorno!)

- **Type-check (gate fiable):** `NEXT_TELEMETRY_DISABLED=1 npx tsc --noEmit`
  - ⚠️ El language server del editor **NO detecta** errores de tipos de Prisma en payloads de update → **SIEMPRE** correr `tsc` real antes de desplegar (evita deploys fallidos de 6-7 min).
- **Prisma:** NO usar `npx prisma` (cuelga). Usar:
  - `node node_modules/prisma/build/index.js validate`
  - `node node_modules/prisma/build/index.js generate`
  - Migraciones = SQL manual en `prisma/migrations/` (el contenedor ejecuta `prisma migrate deploy` al arrancar).
- **Tests:** `npx vitest run` (la recolección puede tardar 1-2 min; no es hang).
- **Build:** `eslint` y `next build` se **cuelgan en local** → el build real se valida en el **deploy de Coolify** (máquina separada).
- **Git push (entorno):** usar `git -c credential.helper='' -c "credential.helper=/opt/homebrew/bin/gh auth git-credential" push origin main`.
- **Git commit:** `git -c commit.gpgsign=false commit -m "..."` (evita la firma GPG). Si `git` cuelga, limpiar: `rm -f .git/index.lock` y matar procesos git.

## Guardrails (NO romper)

- **Sin merge** fuera del flujo de promoción aprobada; no tocar `main` sin aprobación humana.
- **Sin deploy directo** a producción salvo promoción aprobada (el job de promoción sí puede auto-desplegar tras merge).
- **Secrets nunca** en logs, respuestas, commits ni outputs (tokens: `*_TOKEN`, `*_SECRET`, `*_PASSWORD`, `PRIVATE_KEY`, `SSH_KEY`).
- No borrar previews/ramas/issues de validaciones previas sin orden explícita.
- No añadir colas/Redis/BullMQ/Telegram (fuera de alcance).

## Arquitectura (mapa)

- `app/api/...` — rutas (auth con `getSession()`).
- `lib/llm/` — cliente DeepSeek + agentes (planner, builder-proposal, builder-commit, pr-review) + eficiencia (cost/context/session budgets).
- `lib/github/` — REST GitHub (client, repository, issues, branches, files, pull-requests, context, create-repository).
- `lib/coolify/` — API Coolify (previews, producción, deploy trigger, env).
- `lib/work-sessions/` — orquestador autónomo (stages, orchestrator, checks).
- `lib/jobs/` — JobRun async + worker detached (worker-state, worker-policy, worker).
- `lib/mvp-flow/` — Fase 5.0: estado/flujo MVP (siguiente acción recomendada).
- `lib/composer/` — Fase 6.0: Chat Composer (discovery, proposal, plan, build) + `lib/github/create-repository.ts`.
- `components/` — UI (TaskCard, paneles de preview/readiness/promotion, composer workspace).

## Flujo del Composer (6.0) — resumen para agentes

1. `POST /api/composer/chat` → `runDiscoveryTurn` (una pregunta por turno + opciones) → `spec`.
2. Con spec → `generateProposal` (arquitectura) → confirmación.
3. Confirmación → `generatePlan` (dev+test plan) → aprobación.
4. Aprobación → `createComposerProject` (crea Proyecto + repo GitHub + tarea + **WorkSession autónoma en background**).
5. `GET /api/composer/preview?projectId=…` → el workspace muestra el preview junto al chat (toggle lateral/inferior).

## Documentación

- `docs/current-state.md` — estado actual completo y cómo ejecutar/validar/desplegar.
- `docs/roadmap.md` — siguientes pasos (6.4c, 6.5, 6.6, ops).
- `docs/composer-vision.md` — visión del Composer.
