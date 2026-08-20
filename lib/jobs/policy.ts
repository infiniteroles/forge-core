/**
 * Async jobs — policy (Fase 4.0).
 *
 * For Fase 4.0 the runner is a simple inline/background continuation: the
 * request returns immediately and the job keeps running on the same Node
 * process. There is no distributed queue (no Redis/BullMQ yet). These settings
 * are what the Settings page reports and what future queue backends will
 * replace.
 */

export interface JobPolicy {
  /** Whether the async job system is available at all. */
  available: boolean;
  /** How jobs are executed. "inline" is the Fase 4.0 runner. */
  runner: "inline" | "disabled";
  /** Whether the UI polls job status. */
  pollingEnabled: boolean;
  /** Recovery is manual (user triggered), never automatic. */
  recovery: "manual";
  /** A running job older than this (ms) without a heartbeat is considered stale. */
  heartbeatStaleMs: number;
}

export function getJobPolicy(): JobPolicy {
  const mode = (process.env.ASYNC_JOBS_MODE ?? "inline").trim();
  return {
    available: mode !== "disabled",
    runner: mode === "disabled" ? "disabled" : "inline",
    pollingEnabled: true,
    recovery: "manual",
    heartbeatStaleMs: Number(
      process.env.ASYNC_JOBS_STALE_MS ?? "120000"
    ),
  };
}
