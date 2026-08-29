// Resumen de los agentes que han trabajado en un proyecto, a partir de la
// actividad (etapas de work-session etiquetadas con su rol) y de los agent runs.

import { AGENT_ROLES, agentRoleMeta, type AgentRole } from "./roles";

export interface ProjectAgentSummary {
  role: string;
  label: string;
  icon: string;
  /** Icono Material Symbols para la interfaz. */
  iconName: string;
  /** Etapas de work-session ejecutadas por este rol. */
  stages: number;
  /** Agent runs registrados para este rol. */
  runs: number;
}

const RUN_ROLE: Record<string, AgentRole> = {
  planner: "planner",
  "builder-proposal": "dev",
  "builder-commit": "dev",
  "pr-review": "qa",
  "session-checks": "qa",
};

export function summarizeProjectAgents(
  activityLogs: Array<{ type: string; metadata?: unknown }>,
  agentRuns: Array<{ agentName?: string | null }>
): ProjectAgentSummary[] {
  const stageCount: Record<string, number> = {};
  for (const l of activityLogs) {
    if (l.type !== "work_session.stage_started") continue;
    const meta = (l.metadata ?? {}) as { agent?: string };
    if (meta.agent) {
      const role = agentRoleMeta(meta.agent).role;
      stageCount[role] = (stageCount[role] ?? 0) + 1;
    }
  }

  const runCount: Record<string, number> = {};
  for (const r of agentRuns) {
    const role = r.agentName ? RUN_ROLE[r.agentName] ?? "dev" : "dev";
    runCount[role] = (runCount[role] ?? 0) + 1;
  }

  const present = new Set<string>([
    ...Object.keys(stageCount),
    ...Object.keys(runCount),
  ]);

  return AGENT_ROLES.filter((a) => present.has(a.role)).map((a) => ({
    role: a.role,
    label: a.label,
    icon: a.icon,
    iconName: a.iconName,
    stages: stageCount[a.role] ?? 0,
    runs: runCount[a.role] ?? 0,
  }));
}
