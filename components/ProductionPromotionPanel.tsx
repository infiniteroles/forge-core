"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  JOB_STAGE_LABELS,
  JOB_STATUS_LABELS,
  isJobRecoverableStatus,
  type JobRunPublicData,
} from "@/lib/jobs/types";
import type { ProductionReadinessData } from "./ProductionReadinessPanel";

export interface PromotionPreflightSummaryData {
  ok: boolean;
  checks: { name: string; status: string; reason?: string }[];
  blockingReasons: string[];
  warnings: string[];
}

export interface ProductionPromotionData {
  id: string | null;
  status: string; // draft|preflight_failed|ready_to_promote|promoting|merged|deploying|verifying|completed|failed|cancelled
  strategy: string;
  summary: string | null;
  error: string | null;
  prNumber: number | null;
  prUrl: string | null;
  branchName: string | null;
  baseBranch: string | null;
  mergeCommitSha: string | null;
  mergeMethod: string | null;
  preflightSummary: PromotionPreflightSummaryData | null;
  verificationSummary: {
    ok: boolean;
    prMerged?: boolean;
    health?: { url: string; status: number; ok: boolean };
    expectedEndpoint?: { url: string; status: number; ok: boolean } | null;
  } | null;
  requestedBy: string | null;
  requestedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Sin preparar",
  preflight_failed: "Preflight fallido",
  ready_to_promote: "Listo para promover",
  promoting: "Promoviendo",
  merged: "Mergeado",
  deploying: "Desplegando",
  verifying: "Verificando",
  completed: "Completado",
  failed: "Fallido",
  cancelled: "Cancelado",
};

function toneFor(status: string): string {
  if (status === "completed") return "bg-emerald-500/10 text-emerald-300";
  if (status === "ready_to_promote") return "bg-emerald-500/10 text-emerald-300";
  if (status === "failed" || status === "preflight_failed") {
    return "bg-red-500/10 text-red-300";
  }
  if (
    status === "promoting" ||
    status === "merged" ||
    status === "deploying" ||
    status === "verifying"
  ) {
    return "bg-sky-500/10 text-sky-300";
  }
  return "bg-neutral-700/40 text-neutral-400";
}

function jobToneFor(status: string): string {
  if (status === "completed") return "bg-emerald-500/10 text-emerald-300";
  if (status === "failed" || status === "stale")
    return "bg-red-500/10 text-red-300";
  if (
    status === "queued" ||
    status === "running" ||
    status === "waiting" ||
    status === "recovered"
  ) {
    return "bg-sky-500/10 text-sky-300";
  }
  return "bg-neutral-700/40 text-neutral-400";
}

/**
 * Controlled Production Promotion panel (Fase 3.9).
 *
 * Unlike the readiness gate, promoting DOES merge the approved PR into main —
 * but ONLY after the readiness review is approved and a human types the
 * explicit confirmation word "PROMOTE". The merge is done via the GitHub API,
 * and afterwards the production endpoints are verified.
 */
export function ProductionPromotionPanel({
  workSessionId,
  review,
  promotion,
  job,
}: {
  workSessionId: string;
  review?: ProductionReadinessData | null;
  promotion?: ProductionPromotionData | null;
  job?: JobRunPublicData | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [executeOpen, setExecuteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [jobState, setJobState] = useState<JobRunPublicData | null>(job ?? null);
  const [jobRunId, setJobRunId] = useState<string | null>(job?.id ?? null);
  const [syncedJobKey, setSyncedJobKey] = useState<string | null>(
    job ? `${job.id}:${job.updatedAt}` : null
  );

  // Poll the job while it is active (queued/running/waiting).
  useEffect(() => {
    if (!jobRunId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    async function poll() {
      try {
        const res = await fetch(`/api/jobs/${jobRunId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const next: JobRunPublicData | null = data.job ?? null;
        if (next) setJobState(next);
        const active =
          next !== null &&
          (next.status === "queued" ||
            next.status === "running" ||
            next.status === "waiting");
        if (!active) {
          if (timer) clearInterval(timer);
          setJobRunId(null);
          router.refresh();
        }
      } catch {
        /* keep polling on transient errors */
      }
    }
    poll();
    timer = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [jobRunId, router]);

  // Sync from the server prop after a refresh (server data wins once idle).
  useEffect(() => {
    if (job) {
      const key = `${job.id}:${job.updatedAt}`;
      if (key !== syncedJobKey) {
        setSyncedJobKey(key);
        setJobState(job);
      }
    }
  }, [job, syncedJobKey]);

  const readinessApproved =
    review?.status === "approved" &&
    review.recommendation === "ready_for_production";

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
        setError(data.error || data.message || "Production promotion request failed.");
      }
    } catch {
      setError("Network error while handling production promotion.");
    } finally {
      setLoading(false);
    }
  }

  async function prepare() {
    if (!review?.id) return;
    await post(`/api/production-readiness/${review.id}/promotion/prepare`, {
      workSessionId,
    });
  }

  async function execute() {
    if (!promotion?.id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/production-promotions/${promotion.id}/execute`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: confirmText }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        if (data.jobRunId) {
          setJobRunId(data.jobRunId);
          setJobState({
            id: data.jobRunId,
            type: "production_promotion",
            status: "queued",
            resourceType: "production_promotion",
            resourceId: promotion.id,
            projectId: null,
            taskId: null,
            workSessionId,
            currentStage: "preflight",
            progressPercent: 0,
            summary: "Promotion job started — encolado.",
            error: null,
            result: null,
            startedAt: null,
            finishedAt: null,
            failedAt: null,
            cancelledAt: null,
            lastHeartbeatAt: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
        router.refresh();
      } else {
        setError(data.error || data.message || "Production promotion failed.");
      }
    } catch {
      setError("Network error while executing production promotion.");
    } finally {
      setLoading(false);
    }
    setExecuteOpen(false);
    setConfirmText("");
  }

  async function refresh() {
    if (!promotion?.id) return;
    await post(`/api/production-promotions/${promotion.id}/refresh`);
    if (jobState?.id) setJobRunId(jobState.id);
  }

  async function recover() {
    if (!jobState?.id) return;
    await post(`/api/jobs/${jobState.id}/recover`);
    setJobRunId(jobState.id);
  }

  const status = promotion?.status ?? null;
  const canPrepare = readinessApproved && (status === null || status === "draft" || status === "preflight_failed" || status === "failed");
  const canExecute = status === "ready_to_promote";

  return (
    <div className="mt-4 rounded-xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-dim">
          Production promotion
        </h2>
        {status ? (
          <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${toneFor(status)}`}>
            {STATUS_LABELS[status] ?? status}
          </span>
        ) : (
          <span className="rounded bg-neutral-700/40 px-1.5 py-0.5 font-mono text-[11px] text-neutral-400">
            No preparada
          </span>
        )}
      </div>

      <p className="mt-1 text-xs text-text-dim">
        Esto <span className="font-semibold text-red-300">sí mergea la PR aprobada en main</span>,
        pero solo tras la aprobación de readiness y una confirmación humana explícita.
        Esto puede lanzar el despliegue del entorno de producción.
      </p>

      {!readinessApproved ? (
        <p className="mt-2 rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-300/90">
          La promoción solo está disponible cuando la revisión de readiness está
          aprobada (recommendation: ready_for_production).
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {canPrepare ? (
          <button
            type="button"
            onClick={prepare}
            disabled={loading}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Preparing…" : "Prepare promotion"}
          </button>
        ) : null}

        {canExecute ? (
          <button
            type="button"
            onClick={() => setExecuteOpen(true)}
            disabled={loading}
            className="rounded-md bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/25 disabled:opacity-50"
          >
            Execute promotion
          </button>
        ) : null}

        {promotion?.id ? (
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="rounded-md border border-border px-2 py-1 text-xs text-neutral-300 transition hover:border-accent/50 disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh promotion"}
          </button>
        ) : null}
      </div>

      {promotion?.prNumber ? (
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-text-dim">PR</dt>
            <dd className="text-neutral-200">
              {promotion.prUrl ? (
                <a
                  href={promotion.prUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  #{promotion.prNumber}
                </a>
              ) : (
                `#${promotion.prNumber}`
              )}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-text-dim">Merge method</dt>
            <dd className="font-mono text-neutral-200">
              {promotion.mergeMethod ?? promotion.strategy}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <dt className="text-text-dim">Base</dt>
            <dd className="font-mono text-neutral-200">{promotion.baseBranch ?? "main"}</dd>
          </div>
          {promotion.mergeCommitSha ? (
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-text-dim">Merge commit</dt>
              <dd className="font-mono text-neutral-200">
                {promotion.mergeCommitSha.slice(0, 12)}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {promotion?.summary ? (
        <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-xs text-neutral-200">
          {promotion.summary}
        </pre>
      ) : null}

      {promotion?.preflightSummary ? (
        <div className="mt-3 rounded-lg border border-border bg-background p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-dim">
            Preflight
          </h3>
          <ul className="mt-1 flex flex-col gap-1">
            {promotion.preflightSummary.checks.map((c, i) => (
              <li
                key={i}
                className={`flex items-start justify-between gap-2 rounded px-2 py-1 text-xs ${
                  c.status === "passed"
                    ? "bg-emerald-500/5 text-emerald-300/90"
                    : c.status === "failed"
                      ? "bg-red-500/5 text-red-300/90"
                      : "bg-neutral-700/20 text-neutral-300"
                }`}
              >
                <span>{c.name}</span>
                <span className="font-mono">{c.status}</span>
              </li>
            ))}
          </ul>
          {promotion.preflightSummary.blockingReasons.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1">
              {promotion.preflightSummary.blockingReasons.map((r, i) => (
                <li key={i} className="rounded bg-red-500/5 px-2 py-1 text-xs text-red-300/90">
                  {r}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {promotion?.verificationSummary ? (
        <div className="mt-3 rounded-lg border border-border bg-background p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-dim">
            Verificación post-merge
          </h3>
          <dl className="mt-1 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-text-dim">PR merged</dt>
              <dd className={`font-mono ${promotion.verificationSummary.prMerged ? "text-emerald-300" : "text-red-300"}`}>
                {promotion.verificationSummary.prMerged ? "yes" : "no"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-text-dim">Health</dt>
              <dd className={`font-mono ${promotion.verificationSummary.health?.ok ? "text-emerald-300" : "text-red-300"}`}>
                {promotion.verificationSummary.health
                  ? `${promotion.verificationSummary.health.status}`
                  : "—"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-text-dim">Endpoint</dt>
              <dd className={`font-mono ${promotion.verificationSummary.expectedEndpoint?.ok ? "text-emerald-300" : "text-red-300"}`}>
                {promotion.verificationSummary.expectedEndpoint
                  ? `${promotion.verificationSummary.expectedEndpoint.status}`
                  : "—"}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      {jobState ? (
        <div className="mt-3 rounded-lg border border-border bg-background p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-text-dim">
              Job de promoción
            </h3>
            <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${jobToneFor(jobState.status)}`}>
              {JOB_STATUS_LABELS[jobState.status] ?? jobState.status}
            </span>
          </div>
          <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-text-dim">Stage</dt>
              <dd className="font-mono text-neutral-200">
                {jobState.currentStage
                  ? (JOB_STAGE_LABELS[jobState.currentStage] ?? jobState.currentStage)
                  : "—"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-text-dim">Progress</dt>
              <dd className="font-mono text-neutral-200">
                {jobState.progressPercent ?? 0}%
              </dd>
            </div>
          </dl>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-neutral-700/40">
            <div
              className="h-full bg-accent transition-all duration-500"
              style={{ width: `${Math.min(100, jobState.progressPercent ?? 0)}%` }}
            />
          </div>
          {jobState.summary ? (
            <p className="mt-2 text-xs text-neutral-300">{jobState.summary}</p>
          ) : null}
          {jobState.error ? (
            <p className="mt-2 text-xs text-red-300">{jobState.error}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {isJobRecoverableStatus(jobState.status) ? (
              <button
                type="button"
                onClick={recover}
                disabled={loading}
                className="rounded-md border border-accent/50 px-2 py-1 text-xs text-accent transition hover:bg-accent/10 disabled:opacity-50"
              >
                {loading ? "Recovering…" : "Recover job"}
              </button>
            ) : null}
            <span className="text-[10px] text-text-dim">
              Job {jobState.id.slice(0, 8)} · Last update:{" "}
              {new Date(jobState.updatedAt).toLocaleString()}
            </span>
          </div>
        </div>
      ) : null}

      {promotion?.error ? (
        <p className="mt-2 text-xs text-red-300">{promotion.error}</p>
      ) : null}

      {executeOpen ? (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-background p-3">
          <p className="text-xs font-semibold text-red-200">
            ¿Seguro que quieres promover a producción?
          </p>
          <p className="mt-1 text-xs text-text-dim">
            Esto <span className="font-semibold text-red-300">mergeará el PR en main</span>{" "}
            vía GitHub API y puede lanzar el despliegue del entorno de producción.
            Escribe <span className="font-mono text-red-200">PROMOTE</span> para confirmar.
          </p>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="PROMOTE"
            className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-red-400/60 focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={execute}
              disabled={loading || confirmText !== "PROMOTE"}
              className="rounded-md bg-red-500/20 px-3 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/30 disabled:opacity-40"
            >
              {loading ? "Executing…" : "Confirm & merge to main"}
            </button>
            <button
              type="button"
              onClick={() => {
                setExecuteOpen(false);
                setConfirmText("");
              }}
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
