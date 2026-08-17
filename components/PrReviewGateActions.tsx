"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export type PrReviewSummary = {
  status: string | null;
  recommendation: string | null;
  riskLevel: string | null;
  readyForReview: boolean | null;
  summary: string | null;
};

export function PrReviewGateActions({
  taskId,
  prNumber,
  prDraft,
  prState,
  review,
}: {
  taskId: string;
  prNumber: number | null;
  prDraft: boolean | null;
  prState: string | null;
  review: PrReviewSummary | null;
}) {
  const router = useRouter();
  const [analyzing, setAnalyzing] = useState(false);
  const [readyLoading, setReadyLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    if (analyzing) return;
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/github/pr/review`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        router.refresh();
      } else {
        setError(data.error || "PR analysis request failed.");
      }
    } catch {
      setError("Network error while analyzing the PR.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function markReady() {
    if (readyLoading) return;
    setReadyLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/github/pr/ready`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        router.refresh();
      } else {
        setError(data.error || "Mark ready request failed.");
      }
    } catch {
      setError("Network error while marking the PR ready.");
    } finally {
      setReadyLoading(false);
    }
  }

  if (!prNumber) {
    return (
      <p className="mt-2 text-xs text-text-dim">
        Create a draft PR before review.
      </p>
    );
  }

  const canMarkReady =
    prDraft === true &&
    review?.status === "completed" &&
    review.readyForReview === true;

  return (
    <div className="mt-2 flex flex-col items-start gap-1.5">
      {review ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-medium text-neutral-200">
            PR Review: {review.recommendation ?? "unknown"}
          </span>
          {review.riskLevel ? (
            <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-text-dim">
              risk {review.riskLevel}
            </span>
          ) : null}
          <span
            className={`rounded px-1.5 py-0.5 font-mono ${
              review.readyForReview
                ? "bg-emerald-500/10 text-emerald-300"
                : "bg-amber-500/10 text-amber-300"
            }`}
          >
            Ready for review: {review.readyForReview ? "Yes" : "No"}
          </span>
        </div>
      ) : null}

      {!prDraft ? (
        <p className="text-xs text-emerald-300">
          This PR is marked ready for review (no longer draft).
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={analyze}
          disabled={analyzing}
          className="rounded-md border border-accent/50 bg-accent/10 px-2 py-1 text-xs font-medium text-accent transition hover:bg-accent/20 disabled:opacity-50"
        >
          {analyzing ? "Analyzing…" : "Analyze PR"}
        </button>
        {review ? (
          <>
            <Link
              href={`/tasks/${taskId}/edit#pr-review`}
              className="rounded-md border border-border px-2 py-1 text-xs text-neutral-300 transition hover:border-accent/50"
            >
              View review
            </Link>
            {prDraft ? (
              <button
                type="button"
                onClick={markReady}
                disabled={readyLoading || !canMarkReady}
                className="rounded-md border border-emerald-500/40 px-2 py-1 text-xs text-emerald-300 transition hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {readyLoading ? "Marking…" : "Mark Ready for Review"}
              </button>
            ) : null}
          </>
        ) : null}
      </div>

      {review && prDraft && !canMarkReady ? (
        <p className="text-xs text-text-dim">
          {review.status !== "completed"
            ? "Latest review is not usable — analyze the PR again."
            : "Latest PR review does not recommend marking this PR ready for review."}
        </p>
      ) : null}

      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
