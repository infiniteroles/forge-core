/**
 * Async jobs — domain types (Fase 4.0).
 *
 * A JobRun is a simple, auditable unit of background work. For Fase 4.0 the
 * runner is an inline background continuation (the request returns fast and the
 * job keeps running on the same Node process). The model and helpers are
 * deliberately shaped so the execution can later move to a real queue without
 * changing the domain.
 */

export const JOB_TYPES = [
  "production_promotion",
  "preview_deployment",
  "session_checks",
  "work_session",
] as const;

export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = [
  "queued",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled",
  "stale",
  "recovered",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STAGES = [
  "preflight",
  "merge",
  "trigger_deploy",
  "deploy_wait",
  "verify",
  "complete",
] as const;

export type JobStage = (typeof JOB_STAGES)[number];

/** Statuses that mean the job may still be recovered / resumed. */
export const JOB_RECOVERABLE_STATUSES = [
  "running",
  "waiting",
  "stale",
  "failed",
] as const;

/** Statuses that mean the job is actively in progress. */
export const JOB_ACTIVE_STATUSES = ["queued", "running", "waiting"] as const;

export function isJobRecoverableStatus(status: string): boolean {
  return (JOB_RECOVERABLE_STATUSES as readonly string[]).includes(status);
}

export function isJobActiveStatus(status: string): boolean {
  return (JOB_ACTIVE_STATUSES as readonly string[]).includes(status);
}

/**
 * Public, safe shape of a JobRun sent to the UI / API responses.
 * Never includes tokens or secrets — only the structured progress fields.
 */
export interface JobRunPublicData {
  id: string;
  type: string;
  status: string;
  resourceType: string | null;
  resourceId: string | null;
  projectId: string | null;
  taskId: string | null;
  workSessionId: string | null;
  currentStage: string | null;
  progressPercent: number | null;
  summary: string | null;
  error: string | null;
  result: Record<string, unknown> | null;
  startedAt: string | null;
  finishedAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  lastHeartbeatAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const JOB_STAGE_LABELS: Record<string, string> = {
  queued: "Encolado",
  preflight: "Running preflight",
  merge: "Merging PR",
  trigger_deploy: "Triggering production deploy",
  deploy_wait: "Waiting for deployment",
  verify: "Verifying production",
  complete: "Completed",
};

export const JOB_STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  waiting: "Waiting",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  stale: "Stale",
  recovered: "Recovered",
};
