"use client";

import { useState } from "react";

interface DiagnosticsData {
  ok: boolean;
  configured: boolean;
  baseUrl: string;
  hasToken: boolean;
  runnerMode: string;
  connection?: string;
  version?: string;
  connectionError?: string;
  serverUuid?: string | null;
  serverUuidSource?: string;
  projectUuid?: string | null;
  projectUuidSource?: string;
  environmentName?: string;
  domainSuffix?: string;
  defaultPort?: string;
  buildPack?: string;
  discoveryError?: string;
  error?: string;
}

/**
 * "Check Coolify connection" panel for /settings. Calls the diagnostics
 * endpoint; never renders tokens.
 */
export function CoolifyDiagnostics() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/coolify/diagnostics", {
        method: "GET",
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setData(json as DiagnosticsData);
      } else {
        setError(json.error || "Diagnostics request failed.");
      }
    } catch {
      setError("Network error while checking Coolify connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-black transition hover:opacity-90 disabled:opacity-50"
      >
        {loading ? "Checking…" : "Check Coolify connection"}
      </button>

      {data ? (
        <div className="w-full rounded-lg border border-border bg-background p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-1.5 py-0.5 font-mono ${
                data.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"
              }`}
            >
              {data.ok ? "connected" : "failed"}
            </span>
            <span className="text-neutral-300">
              {data.configured ? "Configured" : "Not configured"}
            </span>
            {data.version ? (
              <span className="text-text-dim">Coolify {data.version}</span>
            ) : null}
          </div>
          <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            <Row label="Runner mode" value={data.runnerMode ?? "—"} />
            <Row label="Base URL" value={data.baseUrl ?? "—"} />
            <Row label="Token" value={data.hasToken ? "Hidden (set)" : "Not set"} />
            <Row label="Server UUID" value={sourceLabel(data.serverUuid, data.serverUuidSource)} />
            <Row label="Project UUID" value={sourceLabel(data.projectUuid, data.projectUuidSource)} />
            <Row label="Environment" value={data.environmentName ?? "dev"} />
            <Row label="Domain suffix" value={data.domainSuffix ?? ".dev.core01.io"} />
            <Row label="Port / build pack" value={`${data.defaultPort ?? "3000"} / ${data.buildPack ?? "dockerfile"}`} />
          </dl>
          {data.connectionError ? (
            <p className="mt-2 text-red-300">Connection error: {data.connectionError}</p>
          ) : null}
          {data.error ? <p className="mt-2 text-amber-300">{data.error}</p> : null}
          {data.discoveryError ? (
            <p className="mt-2 text-amber-300">Discovery: {data.discoveryError}</p>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}

function sourceLabel(uuid: string | null | undefined, source?: string): string {
  if (!uuid) return "missing";
  const short = uuid.length > 12 ? `${uuid.slice(0, 8)}…${uuid.slice(-4)}` : uuid;
  if (source === "env") return `${short} (env)`;
  if (source === "discovered") return `${short} (discovered)`;
  return short;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-text-dim">{label}</dt>
      <dd className="font-mono text-neutral-200">{value}</dd>
    </div>
  );
}
