/**
 * Async jobs — human-readable summary builder (Fase 4.0).
 */

import type { JobRunRow } from "./service";
import { JOB_STAGE_LABELS } from "./types";

/**
 * Builds a short, human-readable progress line for a job from its structured
 * fields. Used on the job status endpoint and the UI.
 */
export function buildJobSummary(
  job: Pick<
    JobRunRow,
    "status" | "type" | "currentStage" | "progressPercent" | "error"
  >
): string {
  const stage =
    job.currentStage && JOB_STAGE_LABELS[job.currentStage]
      ? JOB_STAGE_LABELS[job.currentStage]
      : job.currentStage ?? "inicio";
  const pct =
    typeof job.progressPercent === "number" ? `${job.progressPercent}%` : "—";

  switch (job.status) {
    case "queued":
      return "Job encolado, pendiente de iniciar.";
    case "running":
      return `En curso — ${stage} (${pct}).`;
    case "waiting":
      return `Esperando — ${stage} (${pct}).`;
    case "completed":
      return "Job completado.";
    case "failed":
      return job.error
        ? `Job fallido: ${job.error}`
        : "Job fallido.";
    case "cancelled":
      return "Job cancelado.";
    case "stale":
      return "Job marcado como stale (sin actividad); requiere recuperación manual.";
    case "recovered":
      return "Job recuperado y en curso de nuevo.";
    default:
      return `Estado ${job.status} — ${stage} (${pct}).`;
  }
}
