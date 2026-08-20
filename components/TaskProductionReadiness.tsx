"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface TaskProductionReadinessData {
  reviewId: string | null;
  status: string | null; // draft|ready|blocked|needs_changes|approved|rejected|null
  recommendation: string | null;
  workSessionId: string | null;
}

const LABELS: Record<string, string> = {
  ready: "ready",
  approved: "approved",
  blocked: "blocked",
  needs_changes: "needs changes",
  rejected: "rejected",
  draft: "not prepared",
};

function toneFor(status: string | null): string {
  if (status === "approved" || status === "ready")
    return "bg-emerald-500/10 text-emerald-300";
  if (status === "blocked" || status === "rejected")
    return "bg-red-500/10 text-red-300";
  if (status === "needs_changes") return "bg-amber-500/10 text-amber-300";
  return "bg-neutral-700/40 text-neutral-400";
}

/**
 * Compact production-readiness chip for a task card (Fase 3.8).
 * Prepare only creates a readiness review — never merges or deploys.
 */
export function TaskProductionReadiness({
  data,
}: {
  data?: TaskProductionReadinessData | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = data?.status ?? null;
  const label = status ? LABELS[status] ?? status : "not prepared";

  async function prepare() {
    if (!data?.workSessionId || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/work-sessions/${data.workSessionId}/production/prepare`,
        { method: "POST", headers: { "Content-Type": "application/json" } }
      );
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        router.refresh();
        if (body.error) setError(body.error);
      } else {
        setError(body.error || body.message || "Production readiness request failed.");
      }
    } catch {
      setError("Network error while preparing production.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`rounded px-1.5 py-0.5 font-mono ${toneFor(status)}`}
        title="Production readiness (no merge, no deploy)"
      >
        Production: {label}
      </span>
      {data?.workSessionId ? (
        <>
          <button
            type="button"
            onClick={prepare}
            disabled={loading}
            className="rounded border border-border px-1.5 py-0.5 text-[11px] text-neutral-300 transition hover:border-accent/50 disabled:opacity-50"
          >
            {loading ? "Preparing…" : "Prepare"}
          </button>
          <Link
            href={`/work-sessions/${data.workSessionId}`}
            className="rounded border border-border px-1.5 py-0.5 text-[11px] text-accent transition hover:border-accent/50"
          >
            View
          </Link>
        </>
      ) : null}
      {error ? (
        <span className="text-[10px] text-red-300" title={error}>
          error
        </span>
      ) : null}
    </span>
  );
}
