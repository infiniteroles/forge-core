"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GithubBranchActions({
  taskId,
  branchName,
  branchUrl,
}: {
  taskId: string;
  branchName: string | null;
  branchUrl: string | null;
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
        ? `/api/tasks/${taskId}/github/branch`
        : `/api/tasks/${taskId}/github/branch/check`;

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

  if (!branchName) {
    return (
      <div className="mt-2 flex flex-col items-start gap-1.5">
        <button
          type="button"
          onClick={() => run("create")}
          disabled={loading}
          className="rounded-md border border-accent/50 bg-accent/10 px-2 py-1 text-xs font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create Branch"}
        </button>
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-text-dim">Branch:</span>
        <span className="font-mono text-neutral-200">{branchName}</span>
        {branchUrl ? (
          <a
            href={branchUrl}
            target="_blank"
            rel="noreferrer"
            className="text-accent transition hover:underline"
          >
            Open Branch
          </a>
        ) : null}
        <button
          type="button"
          onClick={() => run("refresh")}
          disabled={loading}
          className="rounded-md border border-border px-2 py-1 text-xs text-neutral-300 transition hover:border-accent/50 disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh Branch"}
        </button>
      </div>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
