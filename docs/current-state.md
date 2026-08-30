# Forge Core01 — Estado actual

> Última actualización: 2026-08-30 · HEAD: `f3725e4` (main) — todo pusheado a `origin/main`.

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

## 6.8b — Fix: fallo silencioso al crear repo nuevo en el Composer (desplegado)

Commit `d126b9f` → deploy `hz2c1h2olocdfy8uldmkctre` **Success** (~5 min).
- **Problema**: si el usuario elegía "repo nuevo" y `createRepository` fallaba (p. ej. el slug ya existía como repo en la org, nombres globales), el error se tragaba en silencio → se creaba un **proyecto muerto** (repo=None, 0 work sessions, el chat decía "build en marcha" pero no hacía nada).
- **Fix**: `lib/composer/build.ts` hace **dedup del nombre del repo** (prueba `slug`, `slug-2`, `slug-3`… hasta 5) y si aun así falla **lanza un error claro**; `app/api/composer/chat/route.ts` muestra ese error **en el chat** (⚠️ con opción de reintentar o dar una URL) en lugar de un falso éxito; `isAffirmative` incluye "reintentar".
- **Nota**: el builder autónomo aún NO genera un scaffold real de la app (la PR de un MVP solo incluye el plan `.forge/…`); falta la capacidad de scaffold de la roadmap (6.4c).

## 6.9 — Check previo de necesidades + histórico persistente del Composer (desplegado)

Commit `1e77958` → deploy `mabiaogdgz7ipuyichhnyvt2` **Success** (~4 min).
- **Check previo antes de construir**: nuevo `lib/composer/readiness.ts` (`evaluateComposerReadiness`, `formatReadinessChecklist`, `readinessOptions`, `isRepoResolutionIntent`, `githubUrlFromMessage`). Antes de aprobar el plan se valida nombre, propósito y repositorio (repo nuevo → verifica nombre libre en GitHub y que GitHub esté configurado; URL → valida formato y acceso; sin repo → bloquea). Si hay ❌ bloqueantes, **no arranca**: muestra la checklist en el chat con botones para solventar (**Crear repo nuevo** / **Usar URL de repo existente**) y se queda en `planning` hasta resolver.
- **Histórico persistente**: nuevo `GET /api/composer/sessions` lista las sesiones (con proyecto). El Composer guarda la sesión en `localStorage` + URL (`?session=`), **retoma la última al recargar** y muestra un **desplegable arriba** para seleccionar proyecto/conversación (con "Nueva conversación"). `GET /api/composer/chat` ahora deriva `workSessionId` del proyecto para seguir el estado del build al retomar.
- Validado en prod: `/api/composer/sessions` devuelve 11 sesiones (TengoYBusco con proyecto y status building).

## 6.10 — Reintentos automáticos del LLM (desplegado)

Commit `2bf0e3a` → deploy `gnbtviccublbqkklrxypplpu` **Success** (~8 min).
- **Problema**: DeepSeek devuelve `empty_response` de forma intermitente → un build podía fallar (`❌ El build ha fallado. LLM provider returned an empty or invalid response`) sin posibilidad de auto-recuperación.
- **Fix**: `lib/llm/client.ts` `chatCompletion` ahora **reintenta automáticamente** (`empty_response`, `timeout` y errores de red) hasta `LLM_MAX_RETRIES` (default 3) con backoff `LLM_RETRY_DELAY_MS` (default 900ms). Beneficia a TODOS los agentes (discovery, propuesta, plan, builder proposal/commit, PR review) sin tocar cada llamada.
- `.env.example` con `LLM_MAX_RETRIES` / `LLM_RETRY_DELAY_MS`.
- Validado: el build fallido de TengoYBusco se **reanudó** (iteración 2) y pasa del punto donde antes fallaba (`run_iteration_builder_proposal` en marcha, sin error).

## 6.11 — Stepper avanza al terminar el build + panel de preview honesto (desplegado)

Commit `bbdb035` → deploy `qbhw1gplnf6fepkbp8jxuuor` **Success** (~4 min).
- El **stepper inferior del Composer ya avanza** cuando la WorkSession termina: `completed` → **Listo**, `completed_with_warnings` → **Preview**, `failed` → **Bloqueado** (`stepIndex` trata los estados terminales como el último paso; `inWorkspace` incluye `blocked`).
- El **panel de preview** ya no se queda en "en espera…": si el build terminó pero no hay app que previsualizar, muestra un aviso claro (el repo aún no contiene código de la app, solo el plan).
- **Limitación honesta**: el preview sigue vacío porque el builder autónomo aún no genera el **código de la app** (solo el plan `.forge/…`). Para que el preview muestre un MVP real hace falta el **scaffold mínimo (Next.js + shadcn)** — el paso 6.4c que el usuario canceló; queda a su elección retomarlo.

## 6.4c — Scaffold real del MVP + preview automático (desplegado)

Commit `4b84bb0` → deploy `mncoctq0du5zsuvydfos1n9l` **Success** (~4 min).
- **`lib/scaffold/nextjs.ts`** (función pura, testeable): `buildNextJsScaffold({name, purpose, accent, background})` genera un proyecto **Next.js 15 + Tailwind 3 funcional** (package.json, tsconfig, next.config, tailwind/postcss config, `app/{layout,page,globals.css}`, `.gitignore`, **Dockerfile** para Coolify, `.dockerignore`, favicon). La landing usa nombre/propósito/paleta con escape JSX seguro.
- **`stageEnsureScaffold`** (nuevo stage `ensure_scaffold` en DEV_STAGES, tras crear la rama): si la rama no tiene `package.json`, genera el scaffold y lo commitea (Contents API). Así la PR contiene la app real.
- **`stageEnsureDevPreview`** (nuevo stage `ensure_dev_preview`, último): al terminar el build, si Coolify está configurado, genera el **DEV Preview automáticamente** (`prepareDevPreview`) — el preview aparece solo.
- Test `tests/scaffold/nextjs.test.ts` (5 casos). `tsc` EXIT=0; `/api/health` 200.

## 6.13 — Perfiles especializados de agentes (desplegado)

Commit `f4663c5` → deploy `oy2nenmqbboyz0wap55xv7kt` **Success** (~5 min).
- **Roles**: `lib/agents/roles.ts` define `planner` (🧠 Planificación), `dev` (🧑‍💻 Desarrollo), `infra` (🛠️ Infraestructura), `qa` (🧪 Testing/QA) + `agentRoleMeta()`.
- **Plan con agentes**: el generador de plan (`lib/composer/plan.ts`) asigna a cada tarea su **perfil especializado** (`agent`); el chat (`formatPlan`) y la tarjeta del plan muestran el icono del agente por tarea.
- **Stages etiquetados**: cada etapa del build (`orchestrator.ts`) lleva su agente (issue/branch/PR/commit→dev; scaffold/preview→infra; plan→planner; checks/review→qa) y se registra en el activity (`metadata.agent`).
- **Panel "Agentes del proyecto"**: en la página del proyecto (`lib/agents/summary.ts` + UI) muestra qué agentes han trabajado, con nº de etapas y análisis por rol.
- `tsc` EXIT=0; `/api/health` 200.

## 6.22 — `completed_with_warnings` ya no detiene el build (desplegado)

Commit `ab52dad` → deploy `1hl2qr9vjy129pkuquedig0o` **Success** (~9 min).
- Un aviso en una etapa intermedia (builder commit, PR review…) ya **no detiene el bucle**: se registra y se continúa hasta `ensure_dev_preview`, así el **preview siempre se genera** aunque el LLM avise.
- El estado final de la sesión conserva `completed_with_warnings` si hubo avisos.
- `tsc` EXIT=0; `/api/health` 200.

## 6.23 — Preview de repos privados: error claro + sync de estado (desplegado)

Commit `f3725e4` (desplegado).
- **Causa raíz diagnosticada**: el build terminaba (iter 5 `cmtfgj` updated `app/page.tsx`) pero el preview no aparecía. La app de preview se creaba con fuente **«Public GitHub»** y el repo `infiniteroles/tengoybusco` es **privado** → Coolify no podía clonarlo → el deploy fallaba en ~10s, pero la fila `PreviewDeployment` se quedaba `deploying` para siempre (nadie sincronizaba el estado con Coolify) y el Composer mostraba «aún no hay una app que previsualizar».
- **Fix**:
  - `prepareDevPreview` consulta la visibilidad del repo vía GitHub; si es **privado**, marca el preview `failed` con un mensaje accionable (hacer el repo público **o** conectar un GitHub App en Coolify → Sources) en lugar de quedarse `deploying`.
  - `GET /api/composer/preview` **refresca el estado real desde Coolify** (cooldown 20s) mientras el preview está `queued/creating/deploying`, para que un fallo real converja a `failed` con su error.
  - `ComposerClient` muestra el **error del preview en el panel derecho** y deja de hacer polling al fallar.
- `tsc` EXIT=0.

## 6.21 — Build resiliente (desplegado)

Commit `161afbe` → deploy `pywyt33dlyvwbe40e3ogiu0p` **Success** (~5 min).
- El fallo del LLM en `builder-commit` o `analyze_pr` **ya no tira abajo el build**: se registra el fallo y se continúa hasta generar el **DEV preview** (el scaffold ya está en la rama).
- Las **iteraciones por chat** ahora también regeneran el preview (`ensure_dev_preview` añadido a `ITERATION_STAGES`).
- `tsc` EXIT=0; `/api/health` 200.

## 6.20 — Reforzar reintentos LLM para el build autónomo (desplegado)

Commit `5cb9b3e` → deploy `db8t1zcmk9izrncrc7uwgm3k` **Success** (~6 min).
- El build autónomo moría por `empty_response` de DeepSeek (respuestas vacías intermitentes) y **3 reintentos no bastaban** → el preview no se construía solo.
- Ahora `chatCompletion` reintenta **5 veces** (6 intentos) con backoff creciente (`LLM_MAX_RETRIES=5`, `LLM_RETRY_DELAY_MS=1200`) — aplica a todos los agentes.
- `tsc` EXIT=0; `/api/health` 200.

## 6.19 — Control de calidad del plan del Composer (desplegado)

Commit `a2f0eef` → deploy `6awuljaqsumbiszgsaoi7hgg` **Success** (~4 min).
- El plan pobre salía porque `generatePlan` caía **silenciosamente en fallbacks genéricos** cuando el LLM devolvía algo no parseable o muy corto.
- Ahora `generatePlan` valida la calidad (mín. **5 fases y 6 tareas**), reintenta hasta 3 veces con un *nudge* pidiendo un plan detallado, y si sigue fallando devuelve un **error claro** en vez del plan genérico.
- `tsc` EXIT=0; `/api/health` 200.

## 6.18 — Composer sin preguntas de hosting/dominio (desplegado)

Commit `98e2658` → deploy `2bs1hxvairkan6fv0q3cggh4` **Success** (~5 min).
- El descubrimiento ya **no pregunta por servidor/dominio**: el despliegue es siempre **Coolify** con **wildcard** de subdominio derivado del nombre del proyecto (p. ej. `<slug>.dev.core01.io`).
- `discovery.ts`: regla explícita "HOSTING & DOMAIN ARE NEVER ASKED". `proposal.ts`: hosting siempre Coolify/Docker, sin preguntas de hosting ni dominios personalizados.
- `tsc` EXIT=0; `/api/health` 200.

## 5.1 / 6.17 — Identidad visual Forge CORE01 + fix Composer (desplegado)

Commits `5e6b296` + `873ab42` (assets) → deploy `hk7mfpe18iicg3iwkn4mkuym` **Success** (~4 min).
- **Fix bug**: el Composer se quedaba "pillado" tras adjuntar el logo → causa raíz: error de hidratación React #418 por un `<link>` de Material Symbols duplicado (Next lo hoistea a `<head>` pero deja el original en el body). Se mueven las fuentes a `@import` en `globals.css` y se elimina el `<link>`; además se blinda `onUploadLogo` (try/catch).
- **Identidad Forge CORE01**: paleta dark-first (bg `#080A0D`, verde acento `#7CFF4D`), fuentes Geist/Space Grotesk/JetBrains Mono, fondo con radial sutil verde.
- **Logo nuevo**: `components/BrandLogo.tsx` (cambia variante dark/light) integrado en header (30px) y login (48px); assets en `app/res/`.
- **Utilidades**: `forge-card`, `forge-pill`, `forge-label`, `forge-button-primary/secondary`, `forge-input`; colores `forge.*` y `fontFamily` en Tailwind.
- `tsc` EXIT=0; `/api/health` 200; dashboard/composer OK sin error React.

## 6.16 — Estilo Material 3 en todo el site (desplegado)

Commit `602d773` → deploy `5lxs92vky3x81tiqxksy5a1x` **Success** (~4 min).
- **Header/Nav global M3**: `NavLinks.tsx` (client, `usePathname`) con iconos Material Symbols y pill activa; `AppShell` M3 (logo, botón New project con icono, logout con icono).
- **Componentes compartidos a M3**: `StatusBadge`, `AdvancedSection` (chevron que rota), `ProjectCard`, `TaskCard`, `ActivityTimeline`, `MvpFlowPanel`, botones de proyecto (delete/archive con iconos), avisos ⚠→Icon, ✓→Icon.
- **Páginas M3**: login, dashboard, projects, new project, detalle de proyecto (cabecera + paneles) y settings (cabecera + tablas).
- Los tokens M3 ya eran globales (6.15); aquí se aplican al resto del site y se sustituyen los emojis de la UI por Material Symbols.
- `tsc` EXIT=0; `/api/health` 200, `/login` 200, `/dashboard` renderiza con nav de iconos.

## 6.15b — Reordenar layout del Composer (desplegado)

Commit `7b5ce41` → deploy `cdfceoy01fnwbz5bsevftiit` **Success** (~5 min).
- **Desplegable bajo el chat**: el selector "Proyecto / conversación" se coloca **justo debajo del chat** (sidebar), a todo el ancho, con icono `folder_open` y botón ➕ de nueva conversación.
- **Pasos bajo el preview**: la barra de pasos se mueve **debajo del área de previsualización** (columna derecha); se elimina el footer.
- **Tip en la cabecera**: `ComposerHeader` ahora recibe `tip` y, plegada, muestra el tip contextual de la fase al lado de "Forge Composer" (icono `lightbulb`); al desplegarla muestra la descripción larga → no se duplica información. `ComposerClient` renderiza la cabecera (necesita el estado para el tip).
- `tsc` EXIT=0; `/api/health` 200; validado en navegador (cabecera con tip, selector con Padel Tour bajo el chat, steps bajo el preview).

## 6.15 — Restyling Material 3 del Composer (desplegado)

Commit `64c0bd1` → deploy `38vxm3y6nqqb7jbgeutpqi5v` **Success** (~4 min).
- **Iconos Material Symbols** (librería oficial de Material 3): `components/Icon.tsx` + fuente vía `<link>` en `layout.tsx`; se sustituyen los emojis de la UI del Composer (botones, preview, steps, chips, tarjetas).
- **Tokens Material 3** en `globals.css` (--m3-* para oscuro/claro) + colores tailwind `m3:` → estética M3 (superficies tonales, primary container, outline, errores, formas 12-24px).
- **Cabecera plegable**: `components/composer/ComposerHeader.tsx` — barra compacta con título + icono; la descripción larga está oculta por defecto (botón chevron para desplegarla).
- **Selector de proyecto al footer**: el desplegable "Proyecto / conversación" sale de la parte superior y se coloca en el footer, junto a los pasos (con icono folder_open y botón + de nueva conversación).
- **Restyling completo del Composer**: chat con burbujas M3, input pill con botón de envío circular, tarjetas de propuesta/plan, stepper con iconos check/chevron, estados del preview con iconos error/check_circle, toggle escritorio/móvil con desktop_windows/phone_iphone.
- **Iconos por rol**: `lib/agents/roles.ts` + `summary.ts` ganan `iconName` (hub/psychology/code/dns/science) → los chips de "Agentes del proyecto" muestran iconos en vez de emojis. `ThemeToggle` usa light_mode/dark_mode.
- Nota: el aviso de hidratación React #418 aparece también en /dashboard (página sin tocar) → preexistente, no causado por esta fase.
- `tsc` EXIT=0; `/api/health` 200, `/api/composer/chat` 401; fuente Material Symbols 200; /composer renderiza (cabecera plegable + footer con selector + 25 iconos).

## 6.14 — Skills por agente especializado (desplegado)

Commit `8e201fc` → deploy `d7qtx6nane8sumjcj7qktsii` **Success** (~4 min).
- **Skills por rol**: nuevo `skills/<rol>/SKILL.md` (coordinator, planner, dev, infra, qa) + `skills/README.md`; instrucciones de dominio para cada perfil.
- **Loader**: `lib/agents/skills.ts` — `getAgentSkill(role)` (lee del disco con fallback incrustado y caché) y `applySkill(role, basePrompt)` que antepone `[SKILL: nombre]` al prompt.
- **Inyección en prompts**: los 7 SYSTEM_PROMPT de agentes ahora se envuelven con `applySkill`: discovery→coordinator, proposal/plan→planner, builder-proposal/builder-commit→dev, pr-review→qa, planner.ts→planner.
- **Rol coordinator**: añadido a `lib/agents/roles.ts` (🧭 Coordinador).
- **Panel de agentes**: cada chip del proyecto muestra la skill del agente (badge con `getAgentSkill(a.role).name`).
- **Dockerfile**: la imagen final copia `skills/` (las skills se cargan en runtime).
- `tsc` EXIT=0.

## Limpieza 2026-08-29 + endpoint de sesión

- Nuevo `DELETE /api/composer/sessions/[id]` (borra una conversación del Composer; no toca el proyecto).
- Limpieza operativa: borrados los proyectos de prueba/abandonados (TengoYBusco x2 → repos tengoybusco-3/t2 borrados, PadelHub, UI Test, T2) y 11 sesiones del Composer huérfanas. Quedan solo `Padel Tour` + `Forge Core01` (control plane) y 1 sesión.
- Resto: `tengoybusco-2` no se puede borrar con el token actual (falta admin; lo creó otro token) — borrado manual pendiente.

## 6.12 — Plan de desarrollo detallado (desplegado)

Commit `010fd30` → deploy `iqcmadbldlckdws4hehu4jaz` **Success** (~4 min).
- `lib/composer/plan.ts`: prompt mucho más exigente — pide **6-9 fases** (Setup → Modelo de datos → Auth → Backend → Frontend → Tests unitarios → Tests integración/E2E → QA) con **2-3 tareas concretas por fase**, cada una con `phase` y `kind` (setup|db|auth|backend|frontend|test|qa); **testStrategy específica** (unitarios, integración/E2E, checklist QA); `maxTokens` 2400→4000.
- `lib/composer/types.ts`: `ComposerPlan.tasks` ahora incluye `phase?`.
- `formatPlan` (route): agrupa las tareas **por fase** (🛠️ Fase + lista numerada) y muestra **🧪 Pruebas** y **⚠️ Riesgos** de forma clara (sin `**` literales).
- `tsc` EXIT=0; `/api/health` 200.
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
