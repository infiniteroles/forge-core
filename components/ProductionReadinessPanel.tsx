"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface ReadinessDiagnosticItem {
  source: string;
  reason: string;
  details?: string;
  severity: string;
}

export interface ReadinessDiagnosticsData {
  blocking: ReadinessDiagnosticItem[];
  needsChanges: ReadinessDiagnosticItem[];
  warnings: ReadinessDiagnosticItem[];
  positiveSignals: string[];
}

export interface ProductionReadinessData {
  id: string | null;
  status: string | null; // draft|ready|blocked|needs_changes|approved|rejected
  recommendation: string | null;
  riskLevel: string | null;
  summary: string | null;
  blockingReasons: string[];
  diagnostics: ReadinessDiagnosticsData | null;
  humanNotes: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  prNumber: number | null;
  prReviewRecommendation: string | null;
  lastEvaluatedAt: string | null;
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
 * Human Approval gate — Production readiness panel (Fase 3.8 / 3.8B).
 * PREPARES a readiness summary, explains WHY it is not ready, and lets a human
 * re-run the PR review, apply a corrective iteration, refresh and approve/
 * reject. It NEVER merges, NEVER deploys and NEVER touches main/production.
 */
export function ProductionReadinessPanel({
  workSessionId,
  taskId,
  review,
}: {
  workSessionId: string;
  taskId: string | null;
  review?: ProductionReadinessData | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [fixOpen, setFixOpen] = useState(false);
  const [fixInstruction, setFixInstruction] = useState("");
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

  async function rerunReview() {
    if (!taskId) {
      setError("Esta sesión no tiene tarea vinculada para re-ejecutar la PR Review.");
      return;
    }
    await post(`/api/tasks/${taskId}/github/pr/review`);
  }

  async function fixIssues() {
    if (!taskId) return;
    await post(`/api/tasks/${taskId}/work-session/iterate`, {
      instruction: fixInstruction.trim(),
    });
    setFixOpen(false);
    setFixInstruction("");
  }

  function defaultFixInstruction(): string {
    const diag = review?.diagnostics;
    const reasons = [
      ...(diag?.blocking ?? []),
      ...(diag?.needsChanges ?? []),
    ]
      .map((d) => d.reason)
      .join("; ");
    const base =
      "Revisa la PR y corrige únicamente lo necesario para que la revisión automática deje de marcar needs_changes. Mantén el cambio limitado a /api/ping y no toques infraestructura ni secretos.";
    return reasons ? `${base}\n\nMotivos detectados: ${reasons}` : base;
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
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="rounded-md border border-border px-2 py-1 text-xs text-neutral-300 transition hover:border-accent/50 disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh readiness"}
          </button>
        ) : null}

        {taskId && (status === "needs_changes" || status === "blocked" || status === "draft" || !status) ? (
          <>
            <button
              type="button"
              onClick={rerunReview}
              disabled={loading}
              className="rounded-md border border-accent/50 px-2 py-1 text-xs text-accent transition hover:bg-accent/10 disabled:opacity-50"
            >
              {loading ? "Reviewing…" : "Re-run PR review"}
            </button>
            <button
              type="button"
              onClick={() => {
                setFixInstruction(defaultFixInstruction());
                setFixOpen((v) => !v);
              }}
              disabled={loading}
              className="rounded-md border border-amber-500/40 px-2 py-1 text-xs text-amber-300 transition hover:bg-amber-500/10 disabled:opacity-50"
            >
              Fix readiness issues
            </button>
          </>
        ) : null}

        {review?.id ? (
          <>
            {canApprove ? (
              <button
                type="button"
                onClick={approve}
                disabled={loading}
                className="rounded-md bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25 disabled:opacity-50"
              >
                {loading ? "Approving…" : "Approve readiness"}
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

      {review?.diagnostics ? (
        <div className="mt-3 rounded-lg border border-border bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-dim">
              Why not ready?
            </h3>
            {review.lastEvaluatedAt ? (
              <span className="text-[11px] text-text-dim">
                Evaluado {new Date(review.lastEvaluatedAt).toLocaleString()}
              </span>
            ) : null}
          </div>

          {review.prNumber ? (
            <p className="mt-1 text-[11px] text-text-dim">
              PR #{review.prNumber}
              {review.prReviewRecommendation
                ? ` · Última PR Review: ${review.prReviewRecommendation}`
                : ""}
            </p>
          ) : null}

          <DiagnosticsList
            title="Bloqueos"
            items={review.diagnostics.blocking}
            className="bg-red-500/5 text-red-300/90"
          />
          <DiagnosticsList
            title="Cambios requeridos"
            items={review.diagnostics.needsChanges}
            className="bg-amber-500/5 text-amber-300/90"
          />
          <DiagnosticsList
            title="Avisos"
            items={review.diagnostics.warnings}
            className="bg-neutral-700/20 text-neutral-300"
          />

          {review.diagnostics.positiveSignals.length > 0 ? (
            <div className="mt-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300/80">
                Señales positivas
              </h4>
              <ul className="mt-1 flex flex-col gap-1">
                {review.diagnostics.positiveSignals.map((s, i) => (
                  <li key={i} className="text-xs text-emerald-300/90">
                    ✓ {s}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
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

      {fixOpen ? (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-background p-3">
          <label className="text-xs font-semibold text-neutral-200">
            Iteración correctiva (misma task, branch y PR — no duplica artefactos)
          </label>
          <textarea
            value={fixInstruction}
            onChange={(e) => setFixInstruction(e.target.value)}
            rows={4}
            className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent/60 focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={fixIssues}
              disabled={loading || !fixInstruction.trim()}
              className="rounded-md bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/25 disabled:opacity-50"
            >
              {loading ? "Starting…" : "Run corrective iteration"}
            </button>
            <button
              type="button"
              onClick={() => setFixOpen(false)}
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

function DiagnosticsList({
  title,
  items,
  className,
}: {
  title: string;
  items: ReadinessDiagnosticItem[];
  className: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">
        {title}
      </h4>
      <ul className="mt-1 flex flex-col gap-1">
        {items.map((d, i) => (
          <li key={i} className={`rounded px-2 py-1 text-xs ${className}`}>
            {d.reason}
            {d.details ? <span className="opacity-70"> — {d.details}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
