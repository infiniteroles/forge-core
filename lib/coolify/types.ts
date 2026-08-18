export const PREVIEW_PROVIDERS = ["manual", "coolify"] as const;
export type PreviewProvider = (typeof PREVIEW_PROVIDERS)[number];

export const PREVIEW_STATUSES = [
  "not_configured",
  "queued",
  "creating",
  "deploying",
  "ready",
  "failed",
  "stopped",
  "skipped",
] as const;
export type PreviewStatus = (typeof PREVIEW_STATUSES)[number];

export const PREVIEW_RUNNER_MODES = ["disabled", "manual", "coolify_api"] as const;
export type PreviewRunnerMode = (typeof PREVIEW_RUNNER_MODES)[number];

export interface PreviewRunnerConfig {
  mode: PreviewRunnerMode;
  baseUrl: string;
  apiToken: string;
  hasToken: boolean;
  serverUuid: string | null;
  projectUuid: string | null;
  environmentName: string;
  domainSuffix: string;
}

export interface CoolifyConnectionStatus {
  ok: boolean;
  version?: string;
  error?: string;
}

export interface PreviewDeploymentInput {
  projectId: string;
  taskId: string | null;
  workSessionId: string | null;
  repositoryFullName: string | null;
  branchName: string | null;
  pullRequestNumber: number | null;
  commitSha: string | null;
}
