export const WORK_SESSION_STATUSES = [
  "queued",
  "running",
  "waiting_for_user",
  "completed",
  "completed_with_warnings",
  "failed",
  "cancelled",
] as const;

export type WorkSessionStatus = (typeof WORK_SESSION_STATUSES)[number];

export const WORK_SESSION_MODES = [
  "dev",
  "fix",
  "iteration",
  "exploration",
] as const;

export type WorkSessionMode = (typeof WORK_SESSION_MODES)[number];

export const WORK_SESSION_STAGES = [
  "ensure_task",
  "ensure_issue",
  "ensure_branch",
  "ensure_scaffold",
  "ensure_plan_commit",
  "ensure_draft_pr",
  "ensure_builder_proposal",
  "run_builder_commit",
  "verify_spec_compliance",
  "run_session_checks",
  "analyze_pr",
  "ensure_dev_preview",
  "summarize_result",
  "refresh_context",
  "ensure_existing_task",
  "run_iteration_builder_proposal",
] as const;

export type WorkSessionStage = (typeof WORK_SESSION_STAGES)[number];

export interface WorkSessionResult {
  taskId?: string;
  issueUrl?: string | null;
  branchUrl?: string | null;
  planCommitUrl?: string | null;
  prUrl?: string | null;
  builderCommitUrl?: string | null;
  prReviewRecommendation?: string | null;
  filesChanged?: string[];
  summary?: string | null;
  warnings?: string[];
  isIteration?: boolean;
  requestedChanges?: string | null;
  iterationNumber?: number;
  checks?: {
    status: "passed" | "failed" | "skipped";
    summary?: string | null;
    count?: number;
  } | null;
}

export type StageOutcome =
  | { type: "continue" }
  | {
      type: "waiting_for_user";
      reason: string;
      /** Puntos de decisión conservadores que Forge puede resolver solo */
      autoContinuable?: boolean;
    }
  | { type: "completed_with_warnings"; reason: string }
  | { type: "failed"; error: string };
