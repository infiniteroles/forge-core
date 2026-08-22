/**
 * PR Review reuse (Fase 4.5).
 *
 * Avoids re-running the (expensive) PR Review LLM call when nothing changed:
 * if the latest `pr-review` AgentRun was produced for the same PR head SHA and
 * no new commits exist, the existing review can be reused instead of asking
 * the model again. A forced re-run always bypasses the cache.
 */

import { prisma } from "@/lib/db";
import { getPullRequest } from "@/lib/github/pull-requests";

export interface PrReviewCacheDecision {
  reuse: boolean;
  reason: string;
  prHeadSha: string | null;
  storedHeadSha: string | null;
}

interface AgentRunMeta {
  prHeadSha?: string;
  prNumber?: number;
}

/**
 * Returns whether the last stored PR review can be reused for the task's PR.
 * `force` bypasses the cache entirely (returns reuse=false).
 */
export async function shouldReusePrReview(opts: {
  repositoryFullName: string;
  prNumber: number;
  taskId: string;
  force?: boolean;
}): Promise<PrReviewCacheDecision> {
  if (opts.force) {
    return { reuse: false, reason: "forced", prHeadSha: null, storedHeadSha: null };
  }

  const pr = await getPullRequest({
    repositoryFullName: opts.repositoryFullName,
    prNumber: opts.prNumber,
  }).catch(() => null);
  const prHeadSha = pr?.headSha ?? null;

  const lastRun = await prisma.agentRun.findFirst({
    where: { taskId: opts.taskId, agentName: "pr-review" },
    orderBy: { createdAt: "desc" },
  });

  if (!lastRun) {
    return { reuse: false, reason: "no previous review", prHeadSha, storedHeadSha: null };
  }

  const meta = (lastRun.metadata ?? {}) as AgentRunMeta;
  const storedHeadSha = meta.prHeadSha ?? null;

  if (!prHeadSha || !storedHeadSha) {
    return {
      reuse: false,
      reason: "missing head sha",
      prHeadSha,
      storedHeadSha,
    };
  }

  if (storedHeadSha === prHeadSha) {
    return {
      reuse: true,
      reason: "PR head unchanged since last review",
      prHeadSha,
      storedHeadSha,
    };
  }

  return {
    reuse: false,
    reason: "PR head changed",
    prHeadSha,
    storedHeadSha,
  };
}
