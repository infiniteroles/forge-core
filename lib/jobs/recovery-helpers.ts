/**
 * Async jobs — recovery helpers (Fase 4.0).
 */

import type { JobRunRow } from "./service";
import { isJobRecoverableStatus } from "./types";

/**
 * A job is recoverable when it is in a non-terminal state that can be checked
 * against the real resource (running, waiting, stale or failed). Terminal
 * states (completed/cancelled) are never recovered.
 */
export function isRecoverable(
  job: Pick<JobRunRow, "status">
): boolean {
  return isJobRecoverableStatus(job.status);
}
