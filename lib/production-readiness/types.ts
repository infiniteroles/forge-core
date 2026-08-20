/**
 * Production Readiness Review — types and constants (Fase 3.8).
 *
 * The gate PREPARES a human-approval readiness summary for a work session /
 * task. It NEVER merges, NEVER deploys and NEVER touches `main` or production.
 * Only a human can approve. See policy.ts for the guardrail flags.
 */

export const PRODUCTION_REVIEW_STATUSES = [
  "draft",
  "ready",
  "blocked",
  "needs_changes",
  "approved",
  "rejected",
  "cancelled",
] as const;

export type ProductionReviewStatus = (typeof PRODUCTION_REVIEW_STATUSES)[number];

export const PRODUCTION_RECOMMENDATIONS = [
  "ready_for_production",
  "needs_changes",
  "blocked",
  "manual_review_required",
] as const;

export type ProductionRecommendation =
  (typeof PRODUCTION_RECOMMENDATIONS)[number];

export const PRODUCTION_RISK_LEVELS = [
  "low",
  "medium",
  "high",
  "critical",
  "unknown",
] as const;

export type ProductionRiskLevel = (typeof PRODUCTION_RISK_LEVELS)[number];

/** Session checks aggregate. */
export interface ProductionChecksSummary {
  status: string; // "passed" | "skipped" | "failed" | "timeout"
  summary: string | null;
  count: number;
  details: { name: string; status: string }[];
}

/** DEV preview summary. */
export interface ProductionPreviewSummary {
  status: string; // "ready" | "deploying" | "queued" | "failed" | "not_configured" | "stopped" | "none"
  previewUrl: string | null;
  domain: string | null;
  branchName: string | null;
  commitSha: string | null;
  lastDeploymentStatus: string | null;
  error: string | null;
  envConfigured: boolean | null;
}

/** Pull request + PR review summary. */
export interface ProductionPrSummary {
  prNumber: number | null;
  prUrl: string | null;
  state: string | null;
  draft: boolean | null;
  baseBranch: string | null;
  headBranch: string | null;
  mergedAt: string | null;
  builderCommitSha: string | null;
  reviewStatus: string | null;
  reviewRecommendation: string | null;
  reviewRiskLevel: string | null;
  reviewReadyForReview: boolean | null;
  reviewSummary: string | null;
  reviewCheckedAt: string | null;
  markedReadyAt: string | null;
}

/** Changed-files / safe-file-policy summary. */
export interface ProductionFilesSummary {
  total: number;
  paths: string[];
  blockedPaths: string[];
  sensitivePaths: string[];
  infraPaths: string[];
  workflowPaths: string[];
  touchesBlockedPaths: boolean;
  touchesSecrets: boolean;
  touchesInfra: boolean;
  touchesWorkflow: boolean;
}

/** Full evaluation result — what gets persisted on the review. */
export interface ProductionEvaluationResult {
  status: ProductionReviewStatus;
  recommendation: ProductionRecommendation;
  riskLevel: ProductionRiskLevel;
  summary: string;
  blockingReasons: string[];
  checksSummary: ProductionChecksSummary | null;
  previewSummary: ProductionPreviewSummary | null;
  prSummary: ProductionPrSummary | null;
  filesSummary: ProductionFilesSummary | null;
}

/** Safe metadata stored on ActivityLog for production.* events. */
export interface ProductionActivityMetadata {
  productionReadinessReviewId?: string;
  workSessionId?: string;
  taskId?: string;
  recommendation?: string;
  riskLevel?: string;
  previewStatus?: string;
  prNumber?: number | null;
}
