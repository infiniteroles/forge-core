"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Compact DEV Preview status for a task card. Not the protagonist — a small
 * chip plus "Open Preview" / "Prepare Preview" actions when relevant.
 */
export function TaskDevPreview({
  workSessionId,
  status,
  previewUrl,
}: {
  workSessionId: string;
  status?: string | null;
  previewUrl?: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function prepare() {
    if (loading) return;
    setLoading(true);
    try {
      await fetch(`/api/work-sessions/${workSessionId}/preview/prepare`, {
        method: "POST",
      });
      router.refresh();
    } catch {
      // silent — the full panel on the session page shows errors
    } finally {
      setLoading(false);
    }
  }

  if (!status) {
    return (
      <button
        type="button"
        onClick={prepare}
        disabled={loading}
        className="rounded px-1.5 py-0.5 text-[11px] text-text-dim transition hover:border-accent/50 disabled:opacity-50"
      >
        {loading ? "Preparing preview…" : "Prepare DEV Preview"}
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span
        className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
          status === "ready"
            ? "bg-emerald-500/10 text-emerald-300"
            : status === "deploying" || status === "queued" || status === "creating"
              ? "bg-sky-500/10 text-sky-300"
              : status === "failed"
                ? "bg-red-500/10 text-red-300"
                : "bg-neutral-700/40 text-neutral-400"
        }`}
      >
        DEV Preview: {status}
      </span>
      {status === "ready" && previewUrl ? (
        <a
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-accent transition hover:underline"
        >
          Open Preview
        </a>
      ) : null}
      {status === "failed" || status === "not_configured" ? (
        <button
          type="button"
          onClick={prepare}
          disabled={loading}
          className="text-[11px] text-accent transition hover:underline disabled:opacity-50"
        >
          {loading ? "Preparing…" : "Prepare Preview"}
        </button>
      ) : null}
    </span>
  );
}
