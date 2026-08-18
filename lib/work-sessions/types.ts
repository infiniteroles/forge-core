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
  "ensure_plan_commit",
  "ensure_draft_pr",
  "ensure_builder_proposal",
  "run_builder_commit",
  "analyze_pr",
  "summarize_result",
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
}

export type StageOutcome =
  | { type: "continue" }
  | { type: "waiting_for_user"; reason: string }
  | { type: "completed_with_warnings"; reason: string }
  | { type: "failed"; error: string };
