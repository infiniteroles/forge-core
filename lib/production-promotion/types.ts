/**
 * Production promotion domain types.
 *
 * A production promotion is the controlled action of merging an APPROVED,
 * ready-for-production pull request into the main branch of a project's
 * repository. It never happens automatically: it requires a human who has
 * previously approved the production readiness review AND who types the
 * explicit confirmation word `PROMOTE`.
 */

export const PRODUCTION_PROMOTION_STATUSES = [
  "draft",
  "preflight_failed",
  "ready_to_promote",
  "promoting",
  "merged",
  "deploying",
  "verifying",
  "completed",
  "failed",
  "cancelled",
] as const;

export type ProductionPromotionStatus =
  (typeof PRODUCTION_PROMOTION_STATUSES)[number];

export const PRODUCTION_PROMOTION_STRATEGIES = [
  "github_pr_merge",
  "manual",
] as const;

export type ProductionPromotionStrategy =
  (typeof PRODUCTION_PROMOTION_STRATEGIES)[number];

export const PRODUCTION_MERGE_METHODS = ["squash", "merge", "rebase"] as const;

export type ProductionMergeMethod =
  (typeof PRODUCTION_MERGE_METHODS)[number];

export const PRODUCTION_PROMOTION_MODES = ["github_merge"] as const;

export type ProductionPromotionMode =
  (typeof PRODUCTION_PROMOTION_MODES)[number];

export type PreflightCheckStatus = "passed" | "failed" | "skipped";

export interface ProductionPreflightCheck {
  name: string;
  status: PreflightCheckStatus;
  reason?: string;
}

export interface ProductionPreflightResult {
  ok: boolean;
  status: "ready_to_promote" | "preflight_failed";
  checks: ProductionPreflightCheck[];
  blockingReasons: string[];
  warnings: string[];
}

export interface ProductionHealthProbe {
  url: string;
  status: number;
  ok: boolean;
}

export interface ProductionVerificationResult {
  ok: boolean;
  prMerged?: boolean;
  mergeCommitSha?: string | null;
  health?: ProductionHealthProbe;
  expectedEndpoint?: ProductionHealthProbe | null;
  message?: string;
}

export interface ProductionDeploymentSummary {
  mode: string;
  waitedMs?: number;
  pollCount?: number;
  health?: ProductionHealthProbe | null;
  expectedEndpoint?: ProductionHealthProbe | null;
  message?: string;
}

export interface ProductionPromotionSummaryData {
  preflightOk: boolean;
  status: ProductionPromotionStatus;
  completed?: boolean;
  failed?: boolean;
  prNumber?: number | null;
  prUrl?: string | null;
  mergeCommitSha?: string | null;
  healthOk?: boolean;
  endpointOk?: boolean;
  error?: string | null;
}
