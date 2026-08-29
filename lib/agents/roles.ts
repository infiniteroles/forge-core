// Perfiles especializados de agentes que participan en cada proyecto.

export type AgentRole = "coordinator" | "planner" | "dev" | "infra" | "qa";

export const AGENT_ROLES: { role: AgentRole; label: string; icon: string }[] = [
  { role: "coordinator", label: "Coordinador", icon: "🧭" },
  { role: "planner", label: "Planificación", icon: "🧠" },
  { role: "dev", label: "Desarrollo", icon: "🧑‍💻" },
  { role: "infra", label: "Infraestructura", icon: "🛠️" },
  { role: "qa", label: "Testing / QA", icon: "🧪" },
];

export function agentRoleMeta(
  role?: string | null
): { role: string; label: string; icon: string } {
  const r = (role ?? "").trim().toLowerCase();
  const found = AGENT_ROLES.find((a) => a.role === r);
  if (found) return found;
  if (r) return { role: r, label: r, icon: "🤖" };
  return { role: "general", label: "General", icon: "🤖" };
}
