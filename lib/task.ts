import { z } from "zod";

export const TASK_TYPES = [
  "product",
  "frontend",
  "backend",
  "infra",
  "qa",
  "docs",
] as const;

export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_PRIORITIES = ["high", "medium", "low"] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUSES = [
  "todo",
  "ready",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_TYPE_LABELS: Record<string, string> = {
  product: "Product",
  frontend: "Frontend",
  backend: "Backend",
  infra: "Infra",
  qa: "QA",
  docs: "Docs",
};

export const TASK_PRIORITY_LABELS: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export const TASK_STATUS_LABELS: Record<string, string> = {
  todo: "To do",
  ready: "Ready",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};

export const TASK_STATUS_TONES: Record<string, string> = {
  todo: "bg-neutral-700/40 text-neutral-300",
  ready: "bg-sky-500/15 text-sky-300",
  in_progress: "bg-amber-500/15 text-amber-300",
  blocked: "bg-red-500/15 text-red-300",
  done: "bg-emerald-500/15 text-emerald-300",
  cancelled: "bg-neutral-700/40 text-neutral-400",
};

const clearableText = z
  .string()
  .trim()
  .max(5000)
  .optional()
  .or(z.literal(""))
  .transform((value) => (value && value.length > 0 ? value : null));

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: clearableText,
  type: z.enum(TASK_TYPES).default("backend"),
  priority: z.enum(TASK_PRIORITIES).default("medium"),
  status: z.enum(TASK_STATUSES).default("todo"),
  sortOrder: z.number().int().optional().default(0),
  assignedAgent: clearableText,
  notes: clearableText,
});

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    description: clearableText,
    type: z.enum(TASK_TYPES),
    priority: z.enum(TASK_PRIORITIES),
    status: z.enum(TASK_STATUSES),
    sortOrder: z.number().int(),
    assignedAgent: clearableText,
    notes: clearableText,
  })
  .partial();
