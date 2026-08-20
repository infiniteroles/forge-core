/**
 * Async jobs — runner (Fase 4.0).
 *
 * The Fase 4.0 runner is deliberately simple: after the request returns, the
 * job keeps running on the same Node process (inline background continuation).
 * On the Coolify container Forge runs as a long-lived Next.js server, so the
 * promise keeps executing after the HTTP response is sent.
 *
 * This is the ONLY place a job is dispatched. When a real queue arrives
 * (Redis/BullMQ later), this primitive is what gets swapped out — the job
 * handlers stay the same.
 */

import { logActivity } from "@/lib/activity";
import type { JobRunRow } from "./service";

/**
 * Dispatches a job handler in the background without blocking the request.
 * The handler owns the full lifecycle (start/stages/complete/fail). Any
 * unhandled rejection is logged so it never crashes the process.
 */
export function runJobInBackground(
  job: Pick<JobRunRow, "id" | "type" | "projectId" | "resourceType" | "resourceId">,
  handler: (ctx: { jobRunId: string }) => Promise<void>
): void {
  const jobRunId = job.id;
  void (async () => {
    try {
      await handler({ jobRunId });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Error inesperado en el job";
      await logActivity({
        projectId: job.projectId,
        type: "job.failed",
        message: `El job de tipo "${job.type}" terminó con un error inesperado: ${message}`,
        metadata: {
          jobRunId,
          type: job.type,
          resourceType: job.resourceType ?? undefined,
          resourceId: job.resourceId ?? undefined,
          status: "failed",
        },
      });
      // eslint-disable-next-line no-console
      console.error(`[jobs] ${job.type} (${jobRunId}) failed:`, err);
    }
  })();
}
