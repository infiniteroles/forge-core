/**
 * Detached job worker — configuration (Fase 4.3).
 *
 * The web process enqueues JobRuns; a separate `forge-worker` process polls
 * the queue, claims jobs with a DB lock + heartbeat, and runs the job stages.
 * This lets long promotions survive a redeploy of the web container (the
 * worker runs in its own container and is never the one being redeployed).
 *
 * No Redis yet: just Postgres polling + conditional updates for locking.
 */

export interface JobWorkerConfig {
  /** Whether THIS process is (or expects) the detached worker. */
  enabled: boolean;
  /** Identifier this worker uses in locks (`lockedBy`) and heartbeats. */
  workerId: string;
  /** How often (ms) the worker polls for runnable jobs. */
  pollIntervalMs: number;
  /** A job whose heartbeat/lock is older than this (ms) is reclaimable. */
  lockTimeoutMs: number;
  /** How often (ms) the worker refreshes the job heartbeat while running it. */
  heartbeatMs: number;
  /** Max jobs processed concurrently by this worker. */
  maxConcurrentJobs: number;
  /** Job types this worker is allowed to process. */
  types: string[];
}

export function getJobWorkerConfig(): JobWorkerConfig {
  const enabled =
    (process.env.JOB_WORKER_ENABLED ?? "false").trim().toLowerCase() === "true";
  return {
    enabled,
    workerId: (process.env.JOB_WORKER_ID ?? "forge-worker").trim() || "forge-worker",
    pollIntervalMs: Number(process.env.JOB_WORKER_POLL_INTERVAL_MS ?? "5000"),
    lockTimeoutMs: Number(process.env.JOB_WORKER_LOCK_TIMEOUT_MS ?? "120000"),
    heartbeatMs: Number(process.env.JOB_WORKER_HEARTBEAT_MS ?? "10000"),
    maxConcurrentJobs: Math.max(
      1,
      Number(process.env.JOB_WORKER_MAX_CONCURRENT_JOBS ?? "1")
    ),
    types: (process.env.JOB_WORKER_TYPES ?? "production_promotion")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
