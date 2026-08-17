"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BuilderCommitActions({
  taskId,
  repositoryLinked,
  hasBranch,
  hasPr,
  hasProposal,
  proposalSafe,
  commitSha,
  commitUrl,
  lastStatus,
}: {
  taskId: string;
  repositoryLinked: boolean;
  hasBranch: boolean;
  hasPr: boolean;
  hasProposal: boolean;
  proposalSafe: boolean | null;
  commitSha: string | null;
  commitUrl: string | null;
  lastStatus: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "commit" | "refresh") {
    if (loading) return;
    setLoading(true);
    setError(null);

    const path =
      action === "commit"
        ? `/api/tasks/${taskId}/builder/commit`
        : `/api/tasks/${taskId}/builder/commit/check`;

    try {
      const res = await fetch(path, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        router.refresh();
      } else {
        setError(data.error || "Builder commit request failed.");
      }
    } catch {
      setError("Network error while running Builder Commit.");
    } finally {
      setLoading(false);
    }
  }

  if (!repositoryLinked) {
    return (
      <p className="mt-2 text-xs text-text-dim">
        Link a repository to this project to run Builder Commit.
      </p>
    );
  }

  if (!hasProposal) {
    return (
      <p className="mt-2 text-xs text-text-dim">
        Run Builder Proposal before committing changes.
      </p>
    );
  }

  if (proposalSafe === false) {
    return (
      <p className="mt-2 text-xs text-amber-300">
        Builder Proposal says this is not safe to attempt yet.
      </p>
    );
  }

  if (!hasBranch) {
    return (
      <p className="mt-2 text-xs text-text-dim">
        Create a branch before running Builder Commit.
      </p>
    );
  }

  if (!hasPr) {
    return (
      <p className="mt-2 text-xs text-text-dim">
        Create a draft PR before running Builder Commit.
      </p>
    );
  }

  if (!commitSha) {
    return (
      <div className="mt-2 flex flex-col items-start gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => run("commit")}
            disabled={loading}
            className="rounded-md border border-accent/50 bg-accent/10 px-2 py-1 text-xs font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
          >
            {loading ? "Running…" : "Run Builder Commit"}
          </button>
          {lastStatus ? (
            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-text-dim">
              last run: {lastStatus}
            </span>
          ) : null}
        </div>
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-neutral-200">
          Builder commit: {commitSha.slice(0, 7)}
        </span>
        {commitUrl ? (
          <a
            href={commitUrl}
            target="_blank"
            rel="noreferrer"
            className="text-accent transition hover:underline"
          >
            Open Commit
          </a>
        ) : null}
        <button
          type="button"
          onClick={() => run("refresh")}
          disabled={loading}
          className="rounded-md border border-border px-2 py-1 text-xs text-neutral-300 transition hover:border-accent/50 disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh Commit"}
        </button>
      </div>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
