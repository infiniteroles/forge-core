export const PROJECT_STATUSES = [
  "draft",
  "planned",
  "dev_ready",
  "working",
  "review_needed",
  "ready_for_pro",
  "deployed_dev",
  "deployed_pro",
  "paused",
  "failed",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const INSTRUCTION_STATUSES = [
  "pending",
  "processed",
  "failed",
  "cancelled",
] as const;

export type InstructionStatus = (typeof INSTRUCTION_STATUSES)[number];

export const INSTRUCTION_SOURCES = [
  "manual",
  "telegram",
  "system",
  "github",
] as const;

export type InstructionSource = (typeof INSTRUCTION_SOURCES)[number];

export const AGENT_RUN_STATUSES = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;

export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  planned: "Planned",
  dev_ready: "DEV ready",
  working: "Working",
  review_needed: "Review needed",
  ready_for_pro: "Ready for PRO",
  deployed_dev: "Deployed (DEV)",
  deployed_pro: "Deployed (PRO)",
  paused: "Paused",
  failed: "Failed",
};

export const PROJECT_STATUS_TONES: Record<string, string> = {
  draft: "bg-neutral-700/40 text-neutral-300",
  planned: "bg-sky-500/15 text-sky-300",
  dev_ready: "bg-emerald-500/15 text-emerald-300",
  working: "bg-amber-500/15 text-amber-300",
  review_needed: "bg-violet-500/15 text-violet-300",
  ready_for_pro: "bg-accent/15 text-accent",
  deployed_dev: "bg-emerald-500/15 text-emerald-300",
  deployed_pro: "bg-accent/15 text-accent",
  paused: "bg-neutral-700/40 text-neutral-400",
  failed: "bg-red-500/15 text-red-300",
};
