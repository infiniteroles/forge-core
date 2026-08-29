// Perfiles especializados de agentes que participan en cada proyecto.
// `icon` es el emoji (para texto del chat) y `iconName` el icono Material
// Symbols (para la interfaz).

export type AgentRole = "coordinator" | "planner" | "dev" | "infra" | "qa";

export const AGENT_ROLES: {
  role: AgentRole;
  label: string;
  icon: string;
  iconName: string;
}[] = [
  { role: "coordinator", label: "Coordinador", icon: "🧭", iconName: "hub" },
  { role: "planner", label: "Planificación", icon: "🧠", iconName: "psychology" },
  { role: "dev", label: "Desarrollo", icon: "🧑‍💻", iconName: "code" },
  { role: "infra", label: "Infraestructura", icon: "🛠️", iconName: "dns" },
  { role: "qa", label: "Testing / QA", icon: "🧪", iconName: "science" },
];

export function agentRoleMeta(
  role?: string | null
): { role: string; label: string; icon: string; iconName: string } {
  const r = (role ?? "").trim().toLowerCase();
  const found = AGENT_ROLES.find((a) => a.role === r);
  if (found) return found;
  if (r) return { role: r, label: r, icon: "🤖", iconName: "smart_toy" };
  return { role: "general", label: "General", icon: "🤖", iconName: "smart_toy" };
}
