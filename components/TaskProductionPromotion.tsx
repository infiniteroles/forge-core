"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface TaskPromotionData {
  promotionId: string | null;
  status: string | null; // draft|preflight_failed|ready_to_promote|promoting|merged|deploying|verifying|completed|failed|cancelled
  prNumber: number | null;
  mergeCommitSha: string | null;
  summary: string | null;
  error: string | null;
  reviewId: string | null;
  workSessionId: string | null;
  jobRunId: string | null;
  jobStatus: string | null;
  jobStage: string | null;
  jobProgress: number | null;
  readinessApproved: boolean;
}

const JOB_STAGE_SHORT: Record<string, string> = {
  preflight: "preflight",
  merge: "merge",
  deploy_wait: "deploy_wait",
  verify: "verify",
  complete: "complete",
};

const PROMOTION_JOB_ACTIVE = [
  "promoting",
  "merged",
  "deploying",
  "verifying",
];

const LABELS: Record<string, string> = {
  ready_to_promote: "ready",
  completed: "completed",
  failed: "failed",
  preflight_failed: "preflight failed",
  promoting: "promoting",
  merged: "merged",
  deploying: "deploying",
  verifying: "verifying",
  cancelled: "cancelled",
  draft: "not prepared",
};

function toneFor(status: string | null): string {
  if (status === "completed" || status === "ready_to_promote")
    return "bg-emerald-500/10 text-emerald-300";
  if (status === "failed" || status === "preflight_failed")
    return "bg-red-500/10 text-red-300";
  if (status === "promoting" || status === "merged" || status === "deploying" || status === "verifying")
    return "bg-sky-500/10 text-sky-300";
  return "bg-neutral-700/40 text-neutral-400";
}

/**
 * Compact production-promotion chip for a task card (Fase 3.9).
 * Preparing only runs the preflight and creates the promotion record — it
 * NEVER merges. The actual merge requires typing PROMOTE on the work session.
 */
export function TaskProductionPromotion({
  data,
}: {
  data?: TaskPromotionData | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = data?.status ?? null;
  const label = status ? (LABELS[status] ?? status) : "not prepared";
  const canPrepare =
    Boolean(data?.reviewId) && Boolean(data?.readinessApproved) &&
    (status === null || status === "draft" || status === "preflight_failed" || status === "failed");
  const jobActive =
    status !== null && PROMOTION_JOB_ACTIVE.includes(status);
  const jobLine =
    jobActive && data?.jobStatus
      ? `Job: ${JOB_STAGE_SHORT[data.jobStage ?? ""] ?? data.jobStage ?? "?"}${typeof data.jobProgress === "number" ? ` · ${data.jobProgress}%` : ""}`
      : null;

  async function prepare() {
    if (loading || !data?.reviewId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/production-readiness/${data.reviewId}/promotion/prepare`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workSessionId: data.workSessionId ?? null }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        router.refresh();
        if (body.error) setError(body.error);
      } else {
        setError(body.error || body.message || "Promotion prepare failed.");
      }
    } catch {
      setError("Network error while preparing promotion.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`rounded px-1.5 py-0.5 font-mono ${toneFor(status)}`}
        title={
          data?.error ??
          "Production promotion (merge a main solo tras readiness aprobada y confirmación PROMOTE)"
        }
      >
        Promotion: {label}
      </span>
      {jobLine ? (
        <span
          className="rounded bg-neutral-700/40 px-1.5 py-0.5 font-mono text-[11px] text-neutral-300"
          title={`Job ${data?.jobRunId ?? ""} — estado ${data?.jobStatus ?? ""}`}
        >
          {jobLine}
        </span>
      ) : null}
      {canPrepare ? (
        <button
          type="button"
          onClick={prepare}
          disabled={loading}
          className="rounded border border-accent/50 px-1.5 py-0.5 text-[11px] text-accent transition hover:bg-accent/10 disabled:opacity-50"
        >
          {loading ? "Preparing…" : "Prepare promotion"}
        </button>
      ) : null}
      {data?.workSessionId ? (
        <Link
          href={`/work-sessions/${data.workSessionId}`}
          className="rounded border border-border px-1.5 py-0.5 text-[11px] text-accent transition hover:border-accent/50"
        >
          View promotion
        </Link>
      ) : null}
      {error ? (
        <span className="text-[10px] text-red-300" title={error}>
          error
        </span>
      ) : null}
    </span>
  );
}
