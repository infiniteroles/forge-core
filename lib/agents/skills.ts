// Sistema de skills de los agentes especializados. Cada rol tiene su SKILL.md
// (instrucciones de dominio) que se inyecta en sus prompts al ejecutar.
// Si el fichero no existe en disco, se usa un fallback incrustado.

import fs from "node:fs";
import path from "node:path";

export interface AgentSkill {
  role: string;
  name: string;
  content: string;
}

const SKILL_DIR = path.join(process.cwd(), "skills");

const ROLE_SKILLS: Record<
  string,
  { name: string; file: string; fallback: string }
> = {
  coordinator: {
    name: "Coordinador",
    file: "coordinator/SKILL.md",
    fallback:
      "Coordina el flujo: una pregunta a la vez, asigna cada tarea al agente adecuado (planner/dev/infra/qa), valida que el proyecto esté listo antes de construir y mantén al usuario informado (sin stops silenciosos).",
  },
  planner: {
    name: "Planificación",
    file: "planner/SKILL.md",
    fallback:
      "Produce 6-9 fases (setup, datos, auth, backend, frontend, tests unitarios, tests E2E, QA) con 2-3 tareas concretas por fase y asigna un agente (planner/dev/infra/qa) a cada tarea.",
  },
  dev: {
    name: "Desarrollo",
    file: "dev/SKILL.md",
    fallback:
      "Next.js + React + TypeScript + Tailwind (shadcn/ui o Material 3). Genera el scaffold la primera vez, usa Prisma con migraciones, cambios pequeños en la rama y respeta la safe-file-policy (nunca secretos ni .env).",
  },
  infra: {
    name: "Infraestructura",
    file: "infra/SKILL.md",
    fallback:
      "Dockerfile y .dockerignore desplegables (puerto 3000), prepara el DEV Preview en Coolify con env mínima sin secretos, y reporta la URL. No toques producción sin aprobación.",
  },
  qa: {
    name: "Testing / QA",
    file: "qa/SKILL.md",
    fallback:
      "Tests unitarios de lógica (vitest), tests de integración/E2E y smoke del arranque, revisión conservadora de la PR (riesgo, tests, cambios peligrosos) y checklist manual para el usuario.",
  },
};

function loadSkill(role: string): AgentSkill {
  const cfg = ROLE_SKILLS[role];
  if (!cfg) return { role, name: role, content: "" };
  try {
    const content = fs.readFileSync(path.join(SKILL_DIR, cfg.file), "utf8");
    return { role, name: cfg.name, content };
  } catch {
    return { role, name: cfg.name, content: cfg.fallback };
  }
}

const cache: Record<string, AgentSkill> = {};

export function getAgentSkill(role: string): AgentSkill {
  if (!cache[role]) cache[role] = loadSkill(role);
  return cache[role];
}

/** Antepone la skill del rol al prompt base del agente. */
export function applySkill(role: string, basePrompt: string): string {
  const skill = getAgentSkill(role);
  if (!skill.content.trim()) return basePrompt;
  return `[SKILL: ${skill.name}]\n${skill.content.trim()}\n\n---\n\n${basePrompt}`;
}
