"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface DevPreviewData {
  id: string;
  status: string;
  provider: string | null;
  previewUrl: string | null;
  domain: string | null;
  branchName: string | null;
  commitSha: string | null;
  lastDeploymentStatus: string | null;
  lastCheckedAt: string | null;
  error: string | null;
}

/**
 * DEV Preview panel for a work session. Handles all states:
 * not_configured / creating / queued / deploying / ready / failed / stopped,
 * plus the manual URL registration form. Never deploys to production.
 */
export function DevPreviewPanel({
  workSessionId,
  preview,
}: {
  workSessionId: string;
  preview?: DevPreviewData | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualUrl, setManualUrl] = useState("");
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
        setError(data.error || data.message || "DEV Preview request failed.");
      }
    } catch {
      setError("Network error while handling DEV Preview.");
    } finally {
      setLoading(false);
    }
  }

  async function prepare() {
    await post(`/api/work-sessions/${workSessionId}/preview/prepare`);
  }

  async function refreshStatus() {
    if (!preview) return;
    await post(`/api/preview-deployments/${preview.id}/refresh`);
  }

  async function registerManual() {
    const trimmed = manualUrl.trim();
    if (!trimmed) return;
    await post(`/api/work-sessions/${workSessionId}/preview/manual`, {
      previewUrl: trimmed,
    });
    setManualOpen(false);
    setManualUrl("");
  }

  const status = preview?.status ?? null;

  const tone =
    status === "ready"
      ? "bg-emerald-500/10 text-emerald-300"
      : status === "deploying" || status === "queued" || status === "creating"
        ? "bg-sky-500/10 text-sky-300"
        : status === "failed"
          ? "bg-red-500/10 text-red-300"
          : status === "stopped"
            ? "bg-neutral-700/40 text-neutral-300"
            : "bg-neutral-700/40 text-neutral-400";

  const active = status === "deploying" || status === "queued" || status === "creating";

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-dim">
          DEV Preview
        </h2>
        {status ? (
          <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${tone}`}>
            {status}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!status || status === "not_configured" || status === "failed" || status === "stopped" ? (
          <button
            type="button"
            onClick={prepare}
            disabled={loading}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Preparing…" : status === "failed" ? "Retry" : "Prepare DEV Preview"}
          </button>
        ) : null}

        {active ? (
          <button
            type="button"
            onClick={refreshStatus}
            disabled={loading}
            className="rounded-md border border-accent/50 px-2 py-1 text-xs text-accent transition hover:bg-accent/10 disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh status"}
          </button>
        ) : null}

        {status === "ready" && preview?.previewUrl ? (
          <>
            <a
              href={preview.previewUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/25"
            >
              Open DEV Preview
            </a>
            <button
              type="button"
              onClick={refreshStatus}
              disabled={loading}
              className="rounded-md border border-border px-2 py-1 text-xs text-neutral-300 transition hover:border-accent/50 disabled:opacity-50"
            >
              Refresh status
            </button>
          </>
        ) : null}

        <button
          type="button"
          onClick={() => setManualOpen((v) => !v)}
          className="rounded-md border border-border px-2 py-1 text-xs text-neutral-300 transition hover:border-accent/50"
        >
          Register manual preview URL
        </button>
      </div>

      {status === "not_configured" ? (
        <p className="mt-2 text-xs text-amber-300">
          DEV Preview is not configured yet.
        </p>
      ) : null}

      {active ? (
        <p className="mt-2 text-xs text-neutral-300">
          Deploying preview… You can refresh the status in a moment.
        </p>
      ) : null}

      {status === "failed" ? (
        <p className="mt-2 text-xs text-red-300">
          Preview failed{preview?.error ? `: ${preview.error}` : "."}
        </p>
      ) : null}

      {status === "stopped" ? (
        <p className="mt-2 text-xs text-neutral-300">Preview stopped/cancelled.</p>
      ) : null}

      {preview &&
      (preview.domain ||
        preview.branchName ||
        preview.commitSha ||
        preview.lastDeploymentStatus) ? (
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
          {preview.domain ? <Detail label="Domain" value={preview.domain} /> : null}
          {preview.previewUrl ? (
            <Detail label="URL" value={preview.previewUrl} mono breakAll />
          ) : null}
          {preview.branchName ? (
            <Detail label="Branch" value={preview.branchName} mono />
          ) : null}
          {preview.commitSha ? (
            <Detail label="Commit" value={preview.commitSha.slice(0, 12)} mono />
          ) : null}
          {preview.lastDeploymentStatus ? (
            <Detail label="Deployment status" value={preview.lastDeploymentStatus} mono />
          ) : null}
          {preview.lastCheckedAt ? (
            <Detail
              label="Last checked"
              value={new Date(preview.lastCheckedAt).toLocaleString()}
            />
          ) : null}
        </dl>
      ) : null}

      {manualOpen ? (
        <div className="mt-3 rounded-lg border border-border bg-background p-3">
          <label className="text-xs font-semibold text-neutral-200">
            Manual preview URL
          </label>
          <input
            type="url"
            value={manualUrl}
            onChange={(e) => setManualUrl(e.target.value)}
            placeholder="https://preview-xxxx.dev.core01.io"
            className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-accent/60 focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={registerManual}
              disabled={loading || !manualUrl.trim()}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Saving…" : "Register"}
            </button>
            <button
              type="button"
              onClick={() => setManualOpen(false)}
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

function Detail({
  label,
  value,
  mono,
  breakAll,
}: {
  label: string;
  value: string;
  mono?: boolean;
  breakAll?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-text-dim">{label}</dt>
      <dd className={`text-neutral-200 ${mono ? "font-mono" : ""} ${breakAll ? "break-all" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
