/**
 * Worker state — safe operational summary (Fase 4.4).
 *
 * Aggregates liveness + configuration + a light glance at the last jobs the
 * worker touched, for the Settings page and any operational UI. Never
 * includes secrets, tokens, or raw env values — only booleans, numbers and
 * job identifiers/timestamps.
 */

import { prisma } from "@/lib/db";
import { getJobWorkerConfig } from "./worker-policy";
import { getWorkerStateInfo } from "./service";
import { getJobPolicy } from "./policy";

/** How old a heartbeat may be before the worker is considered inactive. */
export const WORKER_STALE_MS = 240000;

export interface WorkerJobRef {
  id: string;
  type: string;
  updatedAt: string;
}

export interface WorkerStateSummary {
  /** True when a worker reported a heartbeat recently (within WORKER_STALE_MS). */
  active: boolean;
  /** Worker identifier (from the latest heartbeat). */
  workerId: string | null;
  /** ISO timestamp of the latest heartbeat (null when none ever reported). */
  lastHeartbeatAt: string | null;
  /** Milliseconds since the latest heartbeat (null when none reported). */
  lastHeartbeatAgeMs: number | null;
  /** detached = worker active; inline = web fallback in use; unknown otherwise. */
  mode: "detached" | "inline" | "unknown";
  /** Whether the web inline fallback is allowed by policy (ASYNC_JOBS_MODE). */
  fallbackInlineEnabled: boolean;
  /** Whether this process expects to be the worker (JOB_WORKER_ENABLED). */
  enabled: boolean;
  pollIntervalMs: number;
  lockTimeoutMs: number;
  heartbeatMs: number;
  maxConcurrentJobs: number;
  /** Job types this worker is allowed to process. */
  supportedTypes: string[];
  lastPickedJob: WorkerJobRef | null;
  lastCompletedJob: WorkerJobRef | null;
  lastFailedJob: WorkerJobRef | null;
}

function toRef(r: { id: string; type: string; updatedAt: Date } | null) {
  return r ? { id: r.id, type: r.type, updatedAt: r.updatedAt.toISOString() } : null;
}

/**
 * Safe operational summary of the detached worker. Cheap enough for a server
 * component render: one WorkerState read + three small JobRun lookups.
 */
export async function getWorkerStateSummary(): Promise<WorkerStateSummary> {
  const info = await getWorkerStateInfo();
  const cfg = getJobWorkerConfig();
  const policy = getJobPolicy();

  const lastHeartbeatAgeMs =
    info.heartbeatAt !== null
      ? Math.max(0, Date.now() - new Date(info.heartbeatAt).getTime())
      : null;

  // "Picked" = a job that actually started (worker claim or inline start).
  const [lastPicked, lastCompleted, lastFailed] = await Promise.all([
    prisma.jobRun.findFirst({
      where: { status: { in: ["running", "completed", "failed"] } },
      orderBy: { startedAt: "desc" },
      select: { id: true, type: true, updatedAt: true },
    }),
    prisma.jobRun.findFirst({
      where: { status: "completed" },
      orderBy: { finishedAt: "desc" },
      select: { id: true, type: true, updatedAt: true },
    }),
    prisma.jobRun.findFirst({
      where: { status: "failed" },
      orderBy: { failedAt: "desc" },
      select: { id: true, type: true, updatedAt: true },
    }),
  ]);

  return {
    active: info.active,
    workerId: info.workerId,
    lastHeartbeatAt: info.heartbeatAt,
    lastHeartbeatAgeMs,
    mode: info.active ? "detached" : policy.runner === "inline" ? "inline" : "unknown",
    fallbackInlineEnabled: policy.runner === "inline",
    enabled: info.enabled,
    pollIntervalMs: cfg.pollIntervalMs,
    lockTimeoutMs: cfg.lockTimeoutMs,
    heartbeatMs: cfg.heartbeatMs,
    maxConcurrentJobs: cfg.maxConcurrentJobs,
    supportedTypes: cfg.types,
    lastPickedJob: toRef(lastPicked),
    lastCompletedJob: toRef(lastCompleted),
    lastFailedJob: toRef(lastFailed),
  };
}

/**
 * True when a worker previously reported heartbeats but is now stale — i.e.
 * the worker went from active to inactive. Used to emit a single
 * `worker.marked_inactive` event (not on every heartbeat).
 */
export async function workerWasActiveButNowStale(): Promise<boolean> {
  const info = await getWorkerStateInfo();
  return info.workerId !== null && !info.active;
}
