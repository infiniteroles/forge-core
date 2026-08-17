"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GithubIssueActions({
  taskId,
  issueNumber,
  issueState,
  issueUrl,
}: {
  taskId: string;
  issueNumber: number | null;
  issueState: string | null;
  issueUrl: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "create" | "refresh") {
    if (loading) return;
    setLoading(true);
    setError(null);

    const path =
      action === "create"
        ? `/api/tasks/${taskId}/github/issue`
        : `/api/tasks/${taskId}/github/issue/check`;

    try {
      const res = await fetch(path, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        router.refresh();
      } else {
        setError(data.error || "GitHub request failed.");
      }
    } catch {
      setError("Network error while contacting GitHub.");
    } finally {
      setLoading(false);
    }
  }

  if (!issueNumber) {
    return (
      <div className="mt-3 flex flex-col items-start gap-2 border-t border-border pt-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => run("create")}
            disabled={loading}
            className="rounded-md border border-accent/50 bg-accent/10 px-2 py-1 text-xs font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create GitHub Issue"}
          </button>
        </div>
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col items-start gap-2 border-t border-border pt-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-neutral-200">
          Issue #{issueNumber}
        </span>
        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-text-dim">
          {issueState ?? "unknown"}
        </span>
        {issueUrl ? (
          <a
            href={issueUrl}
            target="_blank"
            rel="noreferrer"
            className="text-accent transition hover:underline"
          >
            Open Issue
          </a>
        ) : null}
        <button
          type="button"
          onClick={() => run("refresh")}
          disabled={loading}
          className="rounded-md border border-border px-2 py-1 text-xs text-neutral-300 transition hover:border-accent/50 disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh Issue"}
        </button>
      </div>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
