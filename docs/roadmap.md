# Forge Core01 — Roadmap y siguientes pasos

> Estado de referencia: HEAD `98e2658` (main), 2026-08-29. Prioridad sugerida en orden.

## A corto plazo (completar Fase 6.x — Composer end-to-end)

### 6.5 — Iterar por chat viendo los cambios ✅ (desplegado, commit `2e0b6c0`)
- Hecho: chat activo en `building`/`preview`/`done` → cada mensaje lanza una **WorkSession de iteración** (`startComposerIteration`) y el preview se regenera al lado del chat.
- Hecho: `POST /api/composer/chat` acepta `building|preview|done`; `GET` devuelve `projectId`.
- Pendiente de validación en pruebas: feedback en building mientras la iteración está en curso (múltiples iteraciones encoladas).

### 6.6 — Handoff a tu IDE ✅ (implementado, ver commit de la fase)
- Hecho: al crear un repo nuevo, el Composer sube a `main` (antes del build) **`README.md` + `AGENTS.md` + `.github/copilot-instructions.md`** generados con la spec/propuesta/plan (`lib/composer/handoff.ts`, `pushComposerHandoff` con retry; `build.ts` lo llama antes de lanzar el build autónomo; evento `composer.handoff_created`; test `tests/composer/handoff.test.ts`).
- Solo aplica a repos nuevos (no a URLs de repos existentes).
- Pendiente de validación E2E en pruebas: crear un proyecto con repo nuevo y comprobar que los 3 ficheros aparecen en el repo y que el usuario puede clonarlo.

### 6.7 — UI/UX Composer + modo claro + borrado completo ✅ (desplegado)
- Hecho: Composer a pantalla completa con chat en sidebar ancha; preview con toggle móvil/escritorio; pasos en footer con tips; input alto; logo como pregunta del discovery (adjunto con 📎); modo claro global con toggle persistente; borrado completo de proyectos (BD+repo+previews) con confirmación BORRAR.
- Pendiente de validar en pruebas: flujo completo con la nueva UI (una iteración completa y borrado real de un proyecto de prueba).

### 6.8 — Auto-continuar + decisiones en el chat ✅ (desplegado)
- Hecho: el gate del Builder Proposal se auto-continúa (Forge avanza solo; safe-file-policy sigue activa); el Composer consulta la WorkSession y pregunta en el chat las decisiones reales (Continuar / Pedir un cambio) y avisa al terminar/fallar.
- Pendiente de validar en pruebas: flujo completo con un proyecto nuevo (que ya no se quede en “Forge necesita tu decisión” por el Builder Proposal) y una decisión real que aparezca en el chat.

### 6.9 — Check previo de necesidades + histórico persistente ✅ (desplegado)
- Hecho: check de readiness (nombre/repo verificados y solventables desde el chat) antes de arrancar; histórico del Composer persistente con desplegable de proyectos.
- Pendiente de validar en pruebas: un flujo completo eligiendo "sin repo" (debe bloquear y pedir resolver) y retomar una conversación tras recargar.

### 6.13 — Perfiles especializados de agentes ✅ (desplegado)
- Hecho: el plan asigna planner/dev/infra/qa por tarea; los stages del build se etiquetan con su agente; el proyecto muestra el panel "Agentes del proyecto".

### 6.14 — Skills por agente especializado ✅ (desplegado)
- Hecho: skills por rol (`skills/<rol>/SKILL.md`), loader (`lib/agents/skills.ts`) e inyección en los 7 prompts de agentes; rol coordinator (🧭); badge de skill en el panel de agentes; Dockerfile copia `skills/`.

### 6.15 — Restyling Material 3 del Composer ✅ (desplegado)
- Hecho: iconos Material Symbols en vez de emojis, tokens M3 (CSS), cabecera plegable, selector de proyecto movido al footer junto a los steps, restyling completo del Composer y chips de agentes con iconos por rol.

### 6.15b — Reordenar layout del Composer ✅ (desplegado)
- Hecho: selector de proyecto debajo del chat, pasos debajo del preview (footer eliminado) y tip contextual en la cabecera junto a "Forge Composer" sin duplicar info.

### 6.16 — Estilo Material 3 en todo el site ✅ (desplegado)
- Hecho: header/nav global con iconos y pill activa, componentes compartidos (badges, cards, timeline, paneles, botones) y páginas (login, dashboard, projects, new, detalle, settings) con tokens M3 y Material Symbols en vez de emojis.

### 5.1 / 6.17 — Identidad visual Forge CORE01 + fix Composer ✅ (desplegado)
- Hecho: fix del Composer pillado (hidratación por link duplicado), paleta dark-first con verde CORE01, fuentes Geist/Space Grotesk/JetBrains Mono, logo nuevo dark/light en header y login, utilidades forge-*.

### 6.18 — Composer sin preguntas de hosting/dominio ✅ (desplegado)
- Hecho: el discovery y la propuesta asumen siempre Coolify con wildcard del nombre del proyecto; ya no se pregunta por servidor/dominio.
- Próximo (opcional): que cada fase la ejecute realmente un agente especializado distinto (hoy es un solo builder con roles etiquetados).

### 6.12 — Plan de desarrollo detallado ✅ (desplegado)
- Hecho: fases detalladas (setup→datos→auth→backend→frontend→unit→e2e→QA), 2-3 tareas por fase y estrategia de pruebas completa.

### 6.4c — Scaffold real del MVP ✅ (retomado y desplegado; pendiente de validación E2E)
- Hecho: el build genera el scaffold Next.js + Tailwind en la rama (stage `ensure_scaffold`) y prepara el DEV Preview automáticamente (stage `ensure_dev_preview`).
- Pendiente: validar en pruebas un flujo completo (aprovechar que la PR ya contiene la app y el preview aparece solo).

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
