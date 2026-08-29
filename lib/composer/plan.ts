// Fase 6.0 — Chat Composer: development & test plan generator.
// From a confirmed proposal (and optional user feedback), produces a pragmatic
// build/test plan for the autonomous phase.

import { chatCompletion } from "@/lib/llm/client";
import { applySkill } from "@/lib/agents/skills";
import type { LLMMessage } from "@/lib/llm/types";
import type { ComposerPlan, ComposerProposal, ComposerSpec } from "./types";

const SYSTEM_PROMPT = `You are the engineering planner of "Forge Composer". Based on a confirmed app spec and architecture proposal, produce a DETAILED, realistic development and test plan that an autonomous builder can execute phase by phase. Do NOT be generic — tailor it to the app (data model, auth, screens, endpoints).

PHASES (6 to 9, in this order when applicable):
1. Setup — scaffold, configuración, dependencias, entorno.
2. Modelo de datos — esquema/modelos, migraciones (Prisma), seeds.
3. Autenticación — auth y sesiones (si la app la requiere; si no, indicarlo).
4. Backend / API — endpoints, servicios, validaciones.
5. Frontend — páginas, componentes, estado, navegación.
6. Tests unitarios — lógica de negocio, validadores, helpers (vitest).
7. Tests de integración / E2E — flujos completos (API + UI), smoke test del arranque.
8. QA y revisión — checklist manual para el usuario, revisión de la PR, ajustes finales.

TASKS: al menos 2-3 tareas CONCRETAS por fase, pequeñas y accionables, con descripción clara. Cada tarea lleva "phase" (nombre de su fase), "kind" (setup|db|auth|backend|frontend|test|qa) y "agent" (el PERFIL ESPECIALIZADO que la ejecutará):
  - "planner" → planificación y análisis.
  - "dev" → desarrollo de código (scaffold, modelo de datos, auth, backend, frontend).
  - "infra" → infraestructura, despliegue, previews, CI, Dockerfile.
  - "qa" → tests unitarios, tests de integración/E2E y revisión de la PR.
Asigna el rol más adecuado a cada tarea (varios agentes distintos deben participar en el plan: dev, qa, infra y planner cuando corresponda).

TEST STRATEGY: sé específico. Nombra los tests unitarios (lógica de negocio), los tests de integración/E2E (flujos principales del usuario) y la checklist de QA/manual que el usuario debe ejecutar para validar el MVP.

RISKS: 1-3 riesgos reales del proyecto.

Respond with STRICT JSON only, matching this shape:
{
  "summary": "2-3 sentences in the user's language summarizing the plan",
  "phases": ["Setup", "Modelo de datos", "Auth", "Backend", "Frontend", "Tests unitarios", "Tests E2E", "QA"],
  "tasks": [
    {"title": "...", "description": "...", "kind": "setup|db|auth|backend|frontend|test|qa", "phase": "Setup", "agent": "dev"}
  ],
  "testStrategy": "detailed testing approach (unit, integration/E2E, QA checklist)",
  "risks": ["risk 1", "risk 2"]
}`;

function extractJsonObject(text: string): Record<string, unknown> | null {
  try {
    const trimmed = text.trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return null;
}

export async function generatePlan(
  spec: ComposerSpec,
  proposal: ComposerProposal,
  feedback?: string
): Promise<ComposerPlan> {
  const messages: LLMMessage[] = [
    { role: "system", content: applySkill("planner", SYSTEM_PROMPT) },
    {
      role: "user",
      content:
        `App spec:\n${JSON.stringify(spec, null, 2)}\n\n` +
        `Architecture proposal:\n${JSON.stringify(proposal, null, 2)}\n\n` +
        (feedback ? `User feedback on the previous plan:\n${feedback}\n\n` : "") +
        `Generate the development and test plan.`,
    },
  ];

  const result = await chatCompletion({
    messages,
    temperature: 0.3,
    maxTokens: 4000,
    responseFormat: "json_object",
  });

  const parsed = extractJsonObject(result.content);
  const tasks = Array.isArray(parsed?.tasks)
    ? (parsed.tasks as unknown[]).map((t) => {
        const o = (t ?? {}) as Record<string, unknown>;
        return {
          title: String(o.title ?? "Tarea"),
          description: String(o.description ?? ""),
          kind: String(o.kind ?? "backend"),
          phase: typeof o.phase === "string" ? o.phase : undefined,
          agent: typeof o.agent === "string" ? o.agent : undefined,
        };
      })
    : [
        {
          title: "Preparar el proyecto base",
          description: "Scaffold inicial y configuración.",
          kind: "setup",
          phase: "Setup",
          agent: "dev",
        },
      ];

  return {
    summary:
      typeof parsed?.summary === "string"
        ? parsed.summary
        : "Plan de desarrollo generado.",
    phases: Array.isArray(parsed?.phases)
      ? (parsed.phases as string[])
      : ["Setup", "Core", "Tests"],
    tasks,
    testStrategy:
      typeof parsed?.testStrategy === "string"
        ? parsed.testStrategy
        : "Tests unitarios del núcleo + smoke test del endpoint principal.",
    risks: Array.isArray(parsed?.risks)
      ? (parsed.risks as string[])
      : undefined,
  };
}
