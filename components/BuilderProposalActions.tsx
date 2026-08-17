"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export type BuilderProposalSummary = {
  agentRunId: string;
  status: string;
  summary: string | null;
  recommendedApproach: string | null;
  complexity: string | null;
  safeToAttempt: boolean | null;
  createdAt: string | null;
};

export function BuilderProposalActions({
  taskId,
  repositoryLinked,
  proposal,
}: {
  taskId: string;
  repositoryLinked: boolean;
  proposal: BuilderProposalSummary | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/tasks/${taskId}/builder/proposal`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        router.refresh();
      } else {
        setError(data.error || "Builder request failed.");
      }
    } catch {
      setError("Network error while requesting the proposal.");
    } finally {
      setLoading(false);
    }
  }

  if (!repositoryLinked) {
    return (
      <p className="mt-2 text-xs text-text-dim">
        Link a repository to this project to request a builder proposal.
      </p>
    );
  }

  if (!proposal) {
    return (
      <div className="mt-2 flex flex-col items-start gap-1.5">
        <button
          type="button"
          onClick={ask}
          disabled={loading}
          className="rounded-md border border-accent/50 bg-accent/10 px-2 py-1 text-xs font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
        >
          {loading ? "Asking…" : "Ask Builder Proposal"}
        </button>
        {error ? <p className="text-xs text-red-300">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col items-start gap-1.5">
      <p className="text-xs font-medium text-neutral-200">
        Latest Builder Proposal
        <span
          className={`ml-2 rounded px-1.5 py-0.5 font-mono text-[11px] ${
            proposal.status === "completed"
              ? "bg-emerald-500/10 text-emerald-300"
              : "bg-amber-500/10 text-amber-300"
          }`}
        >
          {proposal.status === "completed" ? "ready" : "warnings"}
        </span>
      </p>
      {proposal.summary ? (
        <p className="line-clamp-2 text-xs text-neutral-300">
          {proposal.summary}
        </p>
      ) : null}
      {proposal.recommendedApproach ? (
        <p className="line-clamp-2 text-xs text-text-dim">
          <span className="font-medium text-neutral-300">Approach: </span>
          {proposal.recommendedApproach}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-text-dim">
        {proposal.complexity ? (
          <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">
            complexity: {proposal.complexity}
          </span>
        ) : null}
        {proposal.safeToAttempt != null ? (
          <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">
            safe to attempt next: {proposal.safeToAttempt ? "Yes" : "No"}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`/tasks/${taskId}/edit#builder-proposal`}
          className="rounded-md border border-border px-2 py-1 text-xs text-neutral-300 transition hover:border-accent/50"
        >
          View full proposal
        </Link>
        <button
          type="button"
          onClick={ask}
          disabled={loading}
          className="rounded-md border border-border px-2 py-1 text-xs text-neutral-300 transition hover:border-accent/50 disabled:opacity-50"
        >
          {loading ? "Asking…" : "Ask again"}
        </button>
      </div>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
