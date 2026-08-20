"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface ProductionReadinessData {
  id: string | null;
  status: string | null; // draft|ready|blocked|needs_changes|approved|rejected
  recommendation: string | null;
  riskLevel: string | null;
  summary: string | null;
  blockingReasons: string[];
  humanNotes: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Sin preparar",
  ready: "Listo",
  blocked: "Bloqueado",
  needs_changes: "Requiere cambios",
  approved: "Aprobado",
  rejected: "Rechazado",
  cancelled: "Cancelado",
};

const RECOMMENDATION_LABELS: Record<string, string> = {
  ready_for_production: "Listo para producción",
  needs_changes: "Requiere cambios",
  blocked: "Bloqueado",
  manual_review_required: "Requiere revisión manual",
};

function toneFor(status: string | null): string {
  if (status === "approved") return "bg-emerald-500/10 text-emerald-300";
  if (status === "ready") return "bg-emerald-500/10 text-emerald-300";
  if (status === "blocked") return "bg-red-500/10 text-red-300";
  if (status === "needs_changes") return "bg-amber-500/10 text-amber-300";
  if (status === "rejected") return "bg-red-500/10 text-red-300";
  return "bg-neutral-700/40 text-neutral-400";
}

/**
 * Human Approval gate — Production readiness panel (Fase 3.8).
 * PREPARES a readiness summary and lets a human approve/reject. It NEVER
 * merges, NEVER deploys and NEVER touches main or production.
 */
export function ProductionReadinessPanel({
  workSessionId,
  review,
}: {
  workSessionId: string;
  review?: ProductionReadinessData | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function post(url: string, body?: Record<string, unknown>) {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        router.refresh();
        if (data.error) setError(data.error);
      } else {
        setError(data.error || data.message || "Production readiness request failed.");
      }
    } catch {
      setError("Network error while handling production readiness.");
    } finally {
      setLoading(false);
    }
  }

  async function prepare() {
    await post(`/api/work-sessions/${workSessionId}/production/prepare`);
  }

  async function refresh() {
    if (!review?.id) return;
    await post(`/api/production-readiness/${review.id}/refresh`);
  }

  async function approve() {
    if (!review?.id) return;
    await post(`/api/production-readiness/${review.id}/approve`, { notes: "" });
  }

  async function reject() {
    if (!review?.id) return;
    await post(`/api/production-readiness/${review.id}/reject`, {
      notes: rejectNote,
    });
    setRejectOpen(false);
    setRejectNote("");
  }

  const status = review?.status ?? null;
  const canApprove =
    review?.id != null &&
    review.recommendation === "ready_for_production" &&
    status !== "approved";

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-dim">
          Production readiness
        </h2>
        {status ? (
          <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${toneFor(status)}`}>
            {STATUS_LABELS[status] ?? status}
          </span>
        ) : (
          <span className="rounded bg-neutral-700/40 px-1.5 py-0.5 font-mono text-[11px] text-neutral-400">
            Sin preparar
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-text-dim">
        Prepara un resumen de preparación para producción. Esto NO hace merge ni
        despliega y NO toca main.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!status || status === "draft" || status === "blocked" || status === "needs_changes" || status === "rejected" ? (
          <button
            type="button"
            onClick={prepare}
            disabled={loading}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Preparing…" : "Prepare production"}
          </button>
        ) : null}

        {review?.id ? (
          <>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              className="rounded-md border border-border px-2 py-1 text-xs text-neutral-300 transition hover:border-accent/50 disabled:opacity-50"
            >
              {loading ? "Refreshing…" : "Refresh"}
            </button>

            {canApprove ? (
              <button
                type="button"
                onClick={approve}
                disabled={loading}
                className="rounded-md bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-50"
              >
                {loading ? "Approving…" : "Approve"}
              </button>
            ) : null}

            {status !== "approved" && status !== "rejected" ? (
              <button
                type="button"
                onClick={() => setRejectOpen((v) => !v)}
                disabled={loading}
                className="rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
              >
                Reject
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      {canApprove ? (
        <p className="mt-2 text-xs text-emerald-300/80">
          Aprobar solo marca la preparación como aprobada. No hace merge ni deploy.
        </p>
      ) : null}

      {review?.recommendation ? (
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-text-dim">Recommendation</dt>
            <dd className="text-neutral-200">
              {RECOMMENDATION_LABELS[review.recommendation] ?? review.recommendation}
            </dd>
          </div>
          {review.riskLevel ? (
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-text-dim">Risk</dt>
              <dd className="text-neutral-200">{review.riskLevel}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {review?.summary ? (
        <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-xs text-neutral-200">
          {review.summary}
        </pre>
      ) : null}

      {review?.blockingReasons && review.blockingReasons.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {review.blockingReasons.map((reason, i) => (
            <li key={i} className="rounded-md bg-red-500/5 px-2 py-1 text-xs text-red-300/90">
              {reason}
            </li>
          ))}
        </ul>
      ) : null}

      {review?.humanNotes ? (
        <p className="mt-2 text-xs text-neutral-300">
          <span className="text-text-dim">Nota humana: </span>
          {review.humanNotes}
        </p>
      ) : null}

      {status === "approved" && review?.approvedAt ? (
        <p className="mt-2 text-xs text-emerald-300">
          Aprobado por {review.approvedBy ?? "humano"} el{" "}
          {new Date(review.approvedAt).toLocaleString()}.
        </p>
      ) : null}

      {status === "rejected" && review?.rejectedAt ? (
        <p className="mt-2 text-xs text-red-300">
          Rechazado el {new Date(review.rejectedAt).toLocaleString()}.
        </p>
      ) : null}

      {rejectOpen ? (
        <div className="mt-3 rounded-lg border border-border bg-background p-3">
          <label className="text-xs font-semibold text-neutral-200">
            Motivo del rechazo
          </label>
          <textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="Explica por qué no está listo para producción…"
            rows={3}
            className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent/60 focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={reject}
              disabled={loading || !rejectNote.trim()}
              className="rounded-md bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/25 disabled:opacity-50"
            >
              {loading ? "Rejecting…" : "Confirm rejection"}
            </button>
            <button
              type="button"
              onClick={() => setRejectOpen(false)}
              className="rounded-md border border-border px-2 py-1 text-xs text-neutral-300"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
