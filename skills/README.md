# Skills de los agentes de Forge

Cada agente especializado tiene su skill (instrucciones de dominio) que se inyecta
en sus prompts al ejecutar.

| Agente | Skill | Dominio |
| --- | --- | --- |
| 🧭 Coordinador | `skills/coordinator/SKILL.md` | Orquesta la conversación y el flujo (descubrimiento, check previo, handoff). |
| 🧠 Planificación | `skills/planner/SKILL.md` | Fases detalladas, tareas por fase, asignación de agentes, estrategia de pruebas. |
| 🧑💻 Desarrollo | `skills/dev/SKILL.md` | Next.js + shadcn, scaffold, Prisma, commits seguros. |
| 🛠️ Infraestructura | `skills/infra/SKILL.md` | Dockerfile, previews en Coolify, entornos. |
| 🧪 Testing / QA | `skills/qa/SKILL.md` | Tests unitarios/E2E, revisión de PR, checklist manual. |

El cargador vive en `lib/agents/skills.ts` (`getAgentSkill`, `applySkill`) y cada
prompt de agente lo aplica en tiempo de ejecución.
