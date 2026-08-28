# Forge Core01 — Roadmap y siguientes pasos

> Estado de referencia: HEAD `62297df` (main), 2026-08-28. Prioridad sugerida en orden.

## A corto plazo (completar Fase 6.x — Composer end-to-end)

### 6.4c — Completar el build autónomo hasta el preview
- El build autónomo (WorkSession) sobre el repo nuevo debe producir un **scaffold real** (Next.js + shadcn + Prisma) en una rama/PR, y **generar un preview** (`/api/composer/preview` ya lo expone).
- Hacer que el **workspace** (chat + preview al lado) se actualice en vivo: cuando la WorkSession termina y hay preview `ready`, el iframe se carga automáticamente.
- Mejorar el **plan del Composer**: tareas concretas por fase/capa (setup → modelo de datos → auth → backend → frontend → tests) en vez de una única tarea genérica.

### 6.5 — Iterar por chat viendo los cambios ✅ (desplegado, commit `2e0b6c0`)
- Hecho: chat activo en `building`/`preview`/`done` → cada mensaje lanza una **WorkSession de iteración** (`startComposerIteration`) y el preview se regenera al lado del chat.
- Hecho: `POST /api/composer/chat` acepta `building|preview|done`; `GET` devuelve `projectId`.
- Pendiente de validación en pruebas: feedback en building mientras la iteración está en curso (múltiples iteraciones encoladas).

### 6.6 — Handoff a tu IDE ✅ (implementado, ver commit de la fase)
- Hecho: al crear un repo nuevo, el Composer sube a `main` (antes del build) **`README.md` + `AGENTS.md` + `.github/copilot-instructions.md`** generados con la spec/propuesta/plan (`lib/composer/handoff.ts`, `pushComposerHandoff` con retry; `build.ts` lo llama antes de lanzar el build autónomo; evento `composer.handoff_created`; test `tests/composer/handoff.test.ts`).
- Solo aplica a repos nuevos (no a URLs de repos existentes).
- Pendiente de validación E2E en pruebas: crear un proyecto con repo nuevo y comprobar que los 3 ficheros aparecen en el repo y que el usuario puede clonarlo.

## A medio plazo

### 5.1 — Pulido MVP (no imprescindible)
- Mejoras estéticas/funcionales pendientes del flujo (TaskCard, paneles, micro-interacciones).
- Traducir textos residuales en inglés de la UI si se quiere 100% español.

### Operaciones / infraestructura
- **Rotar GITHUB_TOKEN** (manual, requiere sesión web de GitHub).
- **Reducir fallos transitorios de build** de Coolify (red del contenedor): evaluar reintento automático o ajuste de configuración.
- Revisar y archivar **proyectos/repos de prueba** creados con el Composer (PadelHub, FitClub, Recetario, InventarioPro…).
- Evaluar aprovisionar **BBDD real por proyecto** (hoy las previews comparten la BD dev).

## Ideas largas (visión V0/Bolt)

- **Logo**: ya decidido — solo subida (sin generación IA); inferir paleta/estilo y aplicarlo al scaffold.
- **Previsualización multicanal**: el chat como sidebar o terminal (ya hecho) + preview en iframe.
- **Multi-tenant**: que el Composer sirva a varios usuarios con proyectos separados.
- **Mercado de componentes**: elegir shadcn o Material 3 por proyecto (default shadcn).

## Notas de proceso (lecciones)

- `eslint`/`next build` se **cuelgan en local** → validar build vía Coolify.
- **`tsc` real** es el gate de tipos fiable (el language server del editor NO detecta errores de tipos de Prisma en payloads de update).
- `prisma` usa el binario directo (`node node_modules/prisma/build/index.js`), no `npx prisma`.
- Deploy de Coolify = **manual** (Actions → Deploy) y con **fallos transitorios de red** → reintentar.
