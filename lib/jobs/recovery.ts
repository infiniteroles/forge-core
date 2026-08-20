/**
 * Async jobs — recovery (Fase 4.0).
 *
 * Recovery is MANUAL (never automatic). The job is checked against the real
 * state of its resource and resumed from the correct stage. The central
 * idempotency rule: once a PR is merged, recovery continues from the deploy
 * wait / verify stages and NEVER repeats the merge.
 */

import { logActivity } from "@/lib/activity";
import { getJobRun } from "./service";
import { isRecoverable } from "./recovery-helpers";
import { recoverProductionPromotionJob } from "@/lib/production-promotion/job";

/**
 * Recovers a job: validates it is recoverable, then dispatches to the
 * type-specific recovery. Returns the (possibly re-scheduled) job run.
 */
export async function recoverJob(
  jobRunId: string,
  opts?: { humanEmail?: string }
): Promise<{ recovered: boolean; jobRunId: string; message: string }> {
  const job = await getJobRun(jobRunId);
  if (!job) {
    throw new Error("No existe el job indicado.");
  }

  if (!isRecoverable(job)) {
    throw new Error(
      `El job no es recuperable (status ${job.status}). Solo se pueden recuperar jobs en running, waiting, stale o failed.`
    );
  }

  await logActivity({
    projectId: job.projectId,
    type: "job.recovery_started",
    message: `Recuperación iniciada para el job "${job.type}" (${jobRunId}).`,
    metadata: {
      jobRunId: job.id,
      type: job.type,
      resourceType: job.resourceType ?? undefined,
      resourceId: job.resourceId ?? undefined,
      stage: job.currentStage ?? undefined,
      status: job.status,
      requestedBy: opts?.humanEmail ?? undefined,
    },
  });

  if (job.type === "production_promotion") {
    return recoverProductionPromotionJob(jobRunId, opts);
  }

  throw new Error(
    `No hay recuperación implementada para el tipo de job "${job.type}".`
  );
}
