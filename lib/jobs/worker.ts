/**
 * Detached job worker (Fase 4.3).
 *
 * Runs in a SEPARATE process (`npm run worker`) so long jobs are not tied to
 * the web container that Coolify redeploys. The web enqueues JobRuns; this
 * worker polls the queue, claims jobs with a DB lock + heartbeat, and runs
 * the existing job handlers (e.g. `runProductionPromotionJob`).
 *
 * Locking is a conditional UPDATE (no Redis): a job is only claimable when
 * it is queued/stale, or running/waiting with a heartbeat older than the
 * lock timeout. The winner updates `lockedBy`/`lastHeartbeatAt`, so only one
 * worker executes it. The worker refreshes the heartbeat while it runs.
 */

import { prisma } from "@/lib/db";
import { getJobWorkerConfig, type JobWorkerConfig } from "./worker-policy";
import {
  touchJobHeartbeat,
  upsertWorkerHeartbeat,
  type JobRunRow,
} from "./service";
import { runProductionPromotionJob } from "@/lib/production-promotion/job";

export { isWorkerActive } from "./service";

const HANDLERS: Record<
  string,
  (jobRunId: string, opts?: { fromStage?: string }) => Promise<void>
> = {
  production_promotion: (jobRunId, opts) =>
    runProductionPromotionJob(jobRunId, opts),
};

let stopped = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Starts the worker loop if `JOB_WORKER_ENABLED=true`. Keeps the process
 * alive forever. Returns immediately when the worker is disabled.
 */
export function startJobWorker(): void {
  const cfg = getJobWorkerConfig();
  if (!cfg.enabled) {
    // eslint-disable-next-line no-console
    console.log("[worker] disabled (JOB_WORKER_ENABLED=false)");
    return;
  }
  // eslint-disable-next-line no-console
  console.log(
    `[worker] started (id=${cfg.workerId}, poll=${cfg.pollIntervalMs}ms, ` +
      `heartbeat=${cfg.heartbeatMs}ms, lock=${cfg.lockTimeoutMs}ms, ` +
      `types=${cfg.types.join(",")})`
  );
  void runWorkerLoop(cfg);
}

/** The never-ending poll loop. One job at a time (maxConcurrentJobs applies to claim size). */
export async function runWorkerLoop(cfg: JobWorkerConfig): Promise<void> {
  while (!stopped) {
    try {
      await tickWorker(cfg);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[worker] loop error:", err instanceof Error ? err.message : err);
    }
    await sleep(cfg.pollIntervalMs);
  }
}

/** One poll: heartbeat liveness, find a runnable job, claim and run it. */
export async function tickWorker(cfg: JobWorkerConfig): Promise<void> {
  try {
    await upsertWorkerHeartbeat(cfg);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[worker] heartbeat error:", err instanceof Error ? err.message : err);
  }

  const job = await findNextRunnableJob(cfg);
  if (!job) return;

  const meta = (job.metadata ?? {}) as Record<string, unknown>;
  const fromStage =
    typeof meta.recoveryFromStage === "string" ? meta.recoveryFromStage : undefined;

  const claimed = await claimJobRun(job.id, cfg);
  if (!claimed) return; // another worker got it first

  // eslint-disable-next-line no-console
  console.log(
    `[worker] picked job ${job.id} (type=${job.type}, stage=${job.currentStage ?? "preflight"}, fromStage=${fromStage ?? "preflight"})`
  );

  const heartbeat = setInterval(() => {
    touchJobHeartbeat(job.id).catch(() => {
      /* transient */
    });
  }, cfg.heartbeatMs);

  try {
    const handler = HANDLERS[job.type];
    if (!handler) {
      throw new Error(`No hay handler para el tipo de job "${job.type}".`);
    }
    await handler(job.id, fromStage ? { fromStage } : undefined);
    // eslint-disable-next-line no-console
    console.log(`[worker] completed job ${job.id}`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[worker] failed job ${job.id}:`,
      err instanceof Error ? err.message : err
    );
  } finally {
    clearInterval(heartbeat);
    await releaseJobRun(job.id);
  }
}

/**
 * Finds one claimable job: queued, stale, or running/waiting with an expired
 * heartbeat. Only processes the configured job types.
 */
export async function findNextRunnableJob(
  cfg: JobWorkerConfig
): Promise<JobRunRow | null> {
  const cutoff = new Date(Date.now() - cfg.lockTimeoutMs);
  const candidates = await prisma.jobRun.findMany({
    where: {
      type: { in: cfg.types },
      OR: [
        { status: "queued" },
        { status: "stale" },
        { status: { in: ["running", "waiting"] }, lastHeartbeatAt: { lt: cutoff } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, cfg.maxConcurrentJobs),
  });
  return candidates[0] ?? null;
}

/**
 * Atomically claims a job using the same predicate as the finder, so only one
 * worker wins. Sets running + lock + heartbeat. Returns true when claimed.
 */
export async function claimJobRun(
  jobRunId: string,
  cfg: JobWorkerConfig
): Promise<boolean> {
  const now = new Date();
  const claimCutoff = new Date(now.getTime() - cfg.lockTimeoutMs);
  const res = await prisma.jobRun.updateMany({
    where: {
      id: jobRunId,
      OR: [
        { status: "queued" },
        { status: "stale" },
        { status: { in: ["running", "waiting"] }, lastHeartbeatAt: { lt: claimCutoff } },
      ],
    },
    data: {
      status: "running",
      lockedAt: now,
      lockedBy: cfg.workerId,
      lastHeartbeatAt: now,
    },
  });
  return res.count === 1;
}

/** Refreshes the heartbeat of a job being processed (also keeps the lock fresh). */
export async function heartbeatJobRun(jobRunId: string): Promise<void> {
  await prisma.jobRun.update({
    where: { id: jobRunId },
    data: { lastHeartbeatAt: new Date(), lockedAt: new Date() },
  });
}

/** Clears the worker lock once the handler finished (job is terminal). */
export async function releaseJobRun(jobRunId: string): Promise<void> {
  await prisma.jobRun
    .update({
      where: { id: jobRunId },
      data: { lockedAt: null, lockedBy: null },
    })
    .catch(() => {
      /* terminal state may already be set; lock release is best-effort */
    });
}

/** Stops the worker loop (used by tests / graceful shutdown). */
export function stopJobWorker(): void {
  stopped = true;
}
