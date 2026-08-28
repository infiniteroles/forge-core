# Forge Core01 — Estado actual

> Última actualización: 2026-08-28 · HEAD: `64ffed7` (main) — todo pusheado a `origin/main`.

Forge Core01 es el **control plane** (Next.js/Prisma/Coolify) para desarrollo asistido por IA de INFINITEROLES / CORE01. El objetivo a largo plazo es un **equipo de desarrollo basado en IA**: tú describes la app y Forge pregunta, propone, planifica, construye de forma autónoma y te muestra un **MVP previsualizable** para iterar por chat.

## Stack

- **Next.js 15.1.6** (App Router) + React 19 + TypeScript + Tailwind 3 (tema oscuro `#0b0b0f`, acento `#ff6b57`).
- **Prisma 6** + PostgreSQL (gestionada por Coolify).
- **Zod**, **bcryptjs**, **jose** (sesiones JWT).
- **DeepSeek** (`deepseek-v4-pro`) vía `lib/llm/client.ts` (OpenAI-compatible, devuelve `usage`).
- **GitHub REST** vía `lib/github/*` (issues, branches, plan commits, PRs, PR review; nunca mergea sin aprobación).
- **Coolify** (`forge.core01.io`) para hosting y previews; deploy **manual por UI** (Actions → Deploy) o **vía API** (en promoción).

## Entornos (Coolify)

| Recurso | Detalle |
|---|---|
| Web app | uuid `xto36lhsf3vb5jqpii4wxagx` · dominio `forge-app.dev.core01.io` |
| Worker detached | app `forge-worker` uuid `h9n74kcqvouy6wb1p0zbyouk` (sin dominio, procesa jobs de promoción) |
| Proyecto/environment | proyecto `hf9oinffcklhxjtql15hdtca` · env `zosmfufrflnhfc2lmscxf0ys` · servidor `i1ot2ms2ehgpt6oa9clddecb` |

## Fases completadas (resumen)

- **2.x Backlog & GitHub**: proyectos, instructions, activity, Planner (DeepSeek), backlog de tareas, issues, branches, plan commits, draft PRs.
- **3.0–3.2**: Builder Proposal (análisis) → Builder Commit (cambios en rama, safe-file-policy) → PR Review Gate (sin merge).
- **3.3–3.4**: Work Session autónoma (`runDevWorkSession`: issue→branch→plan→PR→proposal→commit→review) + **Iteration Loop** (Continue / Ask for changes).
- **3.5**: Session Checks Lite (allowlist de comandos; runner `disabled` por diseño).
- **3.6–3.7C**: DEV Preview vía Coolify API (modos disabled/manual/coolify_api) + runtime env para apps preview (`shared_dev`).
- **4.0–4.2B**: Jobs async (`JobRun` + runner inline con fallback), promoción async, **deploy de main auto-disparado vía Coolify API**, ventana deploy_wait 600s.
- **4.3/4.3B**: **Worker detached** (`forge-worker` con deploy key SSH) procesa promociones; fallback inline cuando no hay worker.
- **4.4**: Hardening operativo (worker-state, runbook, **rotación de tokens**: COOLIFY_API_TOKEN `forge-api-2026-08-22c` id 5; GITHUB_TOKEN **pendiente manual**).
- **4.5**: Eficiencia LLM (métricas de uso, caché de PR review por head SHA, context budget, session budget, simple-task detector).
- **5.0**: MVP flow polish (`lib/mvp-flow/flow-state.ts`, `MvpFlowPanel`, `AdvancedSection`, siguiente acción recomendada, micro-feature `/api/mvp-lite`).
- **6.0 — Chat Composer** (ver más abajo): chat de discovery → propuesta → plan → **build autónomo** → **workspace con preview al lado del chat**.

## Fase 6.0 — Chat Composer

- **URL**: `/composer` · Endpoint: `POST/GET /api/composer/chat` · Preview: `GET /api/composer/preview?projectId=…`.
- **Modelo**: `ComposerSession` (status `discovering|proposal|planning|building|preview|done|blocked`; messages/spec/proposal/plan JSONB; projectId; palette; logoUrl). Migración `20260824000001_add_composer_sessions`.
- **Código**: `lib/composer/{types,discovery,proposal,plan,build}.ts` + `lib/github/create-repository.ts` + `components/composer/ComposerClient.tsx` + `app/api/composer/{chat,preview}/route.ts`.
- **Flujo**:
  1. **Discovery**: el agente hace **una pregunta a la vez**; preguntas cerradas → **opciones clicables** (botones). Producen `spec` (name, purpose, repo, auth, audience, uiLibrary, palette/logoStyle).
  2. **Propuesta**: arquitectura (frontend/backend/BD/auth/hosting) para confirmar o iterar.
  3. **Plan**: al confirmar, genera plan de desarrollo/pruebas (fases, tareas, estrategia). Feedback regenera el plan.
  4. **Aprobar plan → build autónomo**: crea el **Proyecto** real, **crea el repo GitHub** (privado, `auto_init`, `main`) si el spec pide repo nuevo, lo enlaza, y **lanza la WorkSession autónoma** en segundo plano.
  5. **Workspace**: en fases build/preview muestra el **preview (iframe) al lado del chat** con toggle **Chat lateral / Chat inferior** (preferencia en `localStorage`).
  6. **Iterar por chat (Fase 6.5)**: en fases `building`/`preview`/`done` el chat sigue activo — cada mensaje se trata como un **cambio solicitado** y lanza una **WorkSession de iteración** (`startComposerIteration` en `lib/composer/build.ts`): crea una sesión `mode:"iteration"` sobre la primera tarea del proyecto (con `requestedChanges`, `parentWorkSessionId` y `iterationNumber+1`), la ejecuta en segundo plano vía `runIterationWorkSession`, y el **preview se regenera al lado del chat**. El `POST /api/composer/chat` acepta ahora `building|preview|done` y el `GET` devuelve `projectId` para retomar.
  7. **Handoff a tu IDE (Fase 6.6)**: al crear un repo nuevo, el Composer sube a `main` (antes de que el builder cree su rama) **`README.md` + `AGENTS.md` + `.github/copilot-instructions.md`** (generados con la spec/propuesta/plan; ver `lib/composer/handoff.ts`). Así puedes clonar el repo y seguir desarrollando con GitHub Copilot desde el minuto uno.
- **Reglas de producto**: logo **solo subida** (prohibida la generación desde la herramienta; de un logo se infiere paleta en cliente vía canvas); UI por defecto **shadcn/ui**, alternativa **Material 3**.

## Fase 6.5 — Iterar por chat (desplegado)

- Commit `2e0b6c0` → deploy Success en producción.
- `lib/composer/build.ts`: nueva función `startComposerIteration(projectId, changeRequest)` → crea WorkSession de iteración sobre la primera tarea del proyecto y la lanza en segundo plano.
- `app/api/composer/chat/route.ts`: estados permitidos ampliados a `building|preview|done`; rama de iteración por chat; `GET` devuelve `projectId`.
- `components/composer/ComposerClient.tsx`: input habilitado durante `building`/`preview` (placeholder *“Pide un cambio…”*); `isBlocked` desactivado para que el chat siga usable.

## Fase 6.6 — Handoff a tu IDE (desplegado)

- `lib/composer/handoff.ts`: `buildComposerHandoffFiles(spec, proposal, plan)` (puro, testeable) genera `README.md`, `AGENTS.md` y `.github/copilot-instructions.md` (stack, comandos, convenciones shadcn/Material 3, guardrails, respuestas en español); `pushComposerHandoff(repoFullName, …)` los sube a `main` vía Contents API con reintento (2 retries) por la rama de `auto_init`.

## 6.x — Mejoras UX del Composer + fix de build (desplegado)

Commits `dc1dd4b` (UX) + `a57f7e8`/`62297df` (fix build):
- **Split layout del Composer**: workspace con chat y preview en columnas/chat inferior mejorado.
- **Loading feedback** en el chat durante las llamadas al LLM.
- **Continue fire-and-forget**: al aprobar plan / confirmar, no bloquea esperando la respuesta síncrona.
- **Back-to-composer**: enlace para volver al Composer desde el workspace/proyecto.
- **Fix build**: `a57f7e8` eliminó un `previewPane` huérfano en `ComposerClient.tsx`; `62297df` corrigió el narrowing de `previous.task` en `app/api/work-sessions/[id]/continue/route.ts` y una llave sobrante en `ComposerClient.tsx` (eran la causa de 2 deploys fallidos). `tsc` EXIT=0.
- Deploy `yi9jnrv9alceqfonmqkz6hjs` → **Success**; `/api/health` 200 y `/api/composer/chat` → 401 (build vivo).

## 6.7 — UI/UX Composer + modo claro + borrado completo (desplegado)

Commits `b3d9af2` + `cb8be61` (chore gitignore) → deploy `e3hb2yjehtbtmuga5odu4vb8` **Success** (~4 min).
- **Layout a pantalla completa**: Composer con `AppShell wide` (rompe el `max-w-6xl`); **chat en sidebar ancha** (~400px) a la izquierda y **el contenido ocupa el resto**; en móvil se apilan.
- **Preview móvil**: toggle 🖥️/📱 en el panel de preview; en 📱 el iframe se muestra en un marco de teléfono (390px) centrado.
- **Pasos en footer**: el stepper de fases se movió a un **footer fijado al pie** del Composer junto con un **tip contextual** (💡) según la fase.
- **Campo de chat** más alto (2 líneas) y a todo el ancho de la sidebar; botón **📎** para adjuntar logo (el logo pasa a ser **una pregunta más del discovery**, no un control especial).
- **Modo claro** para todo Forge Core: colores semánticos convertidos a CSS variables (`--background/surface/surface-2/border/text-dim/accent`) en `globals.css` con `.light`; `components/ThemeToggle.tsx` (toggle ☀️/🌙 en el header, persiste en `localStorage`); overrides `.light` para los neutros hardcodeados. `tailwind.config.ts` usa `rgb(var(--...) / <alpha-value>)`.
- **Borrado completo de proyectos** (liberar recursos): `lib/projects/delete-project.ts` (`deleteProjectCompletely`) borra la BD (cascade: tasks/workSessions/previews/readiness/promotions/jobs/activity/composerSessions) + **repo de GitHub** (best-effort) + **apps preview de Coolify** (best-effort). Endpoint `POST /api/projects/[id]/delete` (requiere `{confirm:"BORRAR"}`). UI: `ProjectDeleteButton` en la página del proyecto (pide escribir BORRAR).
- Validado en prod: `/api/health` 200; `/composer` renderiza sidebar+footer; toggle de tema aplica fondo claro `rgb(246,246,248)`.

## 6.8 — Auto-continuar + decisiones en el chat (desplegado)

Commit `64ffed7` → deploy `aoeydl27ozfkmcmsgelkimqn` **Success** (~5 min).
- **Auto-continuar**: el gate del **Builder Proposal** (`safe_to_attempt_next=false` → “not safe to attempt yet”) ya **no detiene** la sesión: el orquestador lo marca `autoContinuable` y Forge **avanza solo** (el siguiente stage, builder commit, conserva su propia safe-file-policy → no se debilitan guardrails). Evento `work_session.auto_continued`.
- **Decisiones reales en el chat**: el Composer ahora **consulta el estado de la WorkSession** (nuevo `GET /api/work-sessions/[id]`) y, si Forge necesita una decisión real (`waiting_for_user`), **pregunta en el chat** con el motivo y botones **▶️ Continuar** (llama al endpoint de continue) / **✏️ Pedir un cambio**.
- **Fin de build visible**: cuando la sesión termina (`completed`/`completed_with_warnings`/`failed`) el chat muestra un mensaje ✅/⚠️/❌ con el resumen — sin stops silenciosos.
- Ficheros: `lib/work-sessions/{types,stages,orchestrator}.ts`, `lib/activity.ts`, `app/api/work-sessions/[id]/route.ts` (nuevo), `components/composer/ComposerClient.tsx`.
- `lib/composer/build.ts`: `createComposerProject` llama a `pushComposerHandoff` justo antes de lanzar el build autónomo (para que la rama del builder también herede los ficheros); evento `composer.handoff_created`.
- Test `tests/composer/handoff.test.ts` (6 casos). Solo aplica a repos **nuevos** creados por el Composer (no a URLs de repos existentes).

## Endpoints micro-feature (todos 200 en prod)

`/api/health`, `/api/version-lite`, `/api/deploy-lite`, `/api/job-lite`, `/api/worker-lite`, `/api/detached-lite`, `/api/efficiency-lite`, `/api/mvp-lite`, `/api/app-info`, `/api/ping`.

## Cómo ejecutar / validar / desplegar

```bash
npm install            # o npm ci
cp .env.example .env   # rellena: DATABASE_URL, AUTH_SECRET, DEEPSEEK_API_KEY, GITHUB_TOKEN, COOLIFY_*
npm run dev            # desarrollo

# Validaciones (entorno Mac con Node lento):
#  - eslint y next build SE CUELGAN en local → el build real se valida en el deploy de Coolify
#  - type-check local fiable:
NEXT_TELEMETRY_DISABLED=1 npx tsc --noEmit
#  - prisma (¡npx prisma CUELGA! usar el binario directo):
node node_modules/prisma/build/index.js validate
node node_modules/prisma/build/index.js generate
#  - tests (vitest; la recolección puede tardar ~1-2 min):
npx vitest run

# Despliegue (COOLIFY DEPLOY MANUAL):
#  1. git commit + push a main
#  2. Coolify UI → app web → Actions → Deploy (~6-7 min)
#  3. Los fallos "Error: aborted / empty_response / network" son transitorios → reintentar
```

**Migrations**: SQL manual en `prisma/migrations/` (NO `prisma migrate dev`); en el arranque del contenedor el Dockerfile ejecuta `prisma migrate deploy`.

## Guardrails (NO romper)

- **Sin merge** fuera del flujo de promoción aprobada; no tocar `main` sin aprobación humana explícita.
- **Sin deploy directo** de la app a producción salvo promoción aprobada.
- **Secrets nunca** en logs, respuestas, commits ni outputs.
- No borrar previews/ramas/issues de validaciones previas (limpieza pendiente = decisión explícita del usuario).
- No redes/colas externas (nada de Redis/BullMQ/Telegram).

## Limitaciones / pendientes operativos

- **GITHUB_TOKEN sin rotar** (requiere sesión web de GitHub del usuario) — documentado, no bloquea.
- El runner **inline** (fallback) muere cuando Coolify redeploya el contenedor de la propia app → las promociones inline necesitan un `Recover`; el **worker detached** evita esto.
- Las **previews** necesitan env runtime (`shared_dev`); la BD de preview es compartida con dev.
- El **plan del Composer es mínimo** (1 tarea genérica) — pendiente granularidad por fases/capas.
- Fallos de build de Coolify por **red transitoria** del contenedor → reintentar (no es error de código).
- Proyectos de prueba creados con el Composer (PadelHub, FitClub, Recetario, InventarioPro…) y sus repos — revisar si se conservan o archivan.

## Documentación

- `docs/composer-vision.md` — visión del Chat Composer (flujo, reglas de producto, subfases).
- `docs/roadmap.md` — siguientes pasos (roadmap).
- `AGENTS.md` — instrucciones para agentes IA / Copilot que trabajen en este repo.
- `README.md` — vista general y stack.
