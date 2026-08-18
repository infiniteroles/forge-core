import { prisma } from "@/lib/db";
import {
  getCoolifyConfig,
  isCoolifyConfigured,
  coolifyFetch,
  checkCoolifyConnection,
} from "./client";
import {
  PreviewRunnerConfig,
  PreviewRunnerMode,
  PreviewDeploymentInput,
  PreviewStatus,
} from "./types";

export function getPreviewRunnerMode(): PreviewRunnerMode {
  const raw = (process.env.PREVIEW_RUNNER_MODE ?? "disabled").trim();
  if (raw === "manual") return "manual";
  if (raw === "coolify_api") return "coolify_api";
  return "disabled";
}

export function getPreviewRunnerConfig(): PreviewRunnerConfig {
  const cfg = getCoolifyConfig();
  return {
    mode: getPreviewRunnerMode(),
    baseUrl: cfg.baseUrl,
    apiToken: process.env.COOLIFY_API_TOKEN ?? "",
    hasToken: cfg.hasToken,
    serverUuid: cfg.serverUuid,
    projectUuid: cfg.projectUuid,
    environmentName: cfg.environmentName,
    domainSuffix: cfg.domainSuffix,
  };
}

export function buildPreviewDomain(taskId: string, workSessionId: string | null): string {
  const cfg = getCoolifyConfig();
  const short = workSessionId ? `ws-${workSessionId.slice(0, 6)}` : `preview-${taskId.slice(0, 6)}`;
  return `${short}${cfg.domainSuffix}`;
}

// ── Coolify API (provider = coolify) ────────────────────────────────────────

interface CoolifyApplication {
  uuid?: string;
  name?: string;
  domains?: string;
  git_branch?: string;
  status?: string;
}

/**
 * Best-effort: find an existing Coolify application whose domain matches the
 * preview domain, or create a new one for the task branch.
 */
export async function createOrReusePreviewApplication(input: {
  domain: string;
  repositoryFullName: string;
  branchName: string;
}): Promise<{ applicationUuid: string; created: boolean }> {
  if (!isCoolifyConfigured()) {
    throw new Error("Coolify API token is not configured");
  }

  // 1. Look for an existing application that already serves this domain.
  try {
    const apps = await coolifyFetch<CoolifyApplication[]>("/applications");
    if (Array.isArray(apps)) {
      const match = apps.find((a) =>
        a.domains ? a.domains.includes(input.domain) : false
      );
      if (match?.uuid) {
        return { applicationUuid: match.uuid, created: false };
      }
    }
  } catch {
    // fall through to create
  }

  // 2. Create a new application in the DEV environment (never production).
  const cfg = getCoolifyConfig();
  const body: Record<string, unknown> = {
    project_uuid: cfg.projectUuid ?? undefined,
    server_uuid: cfg.serverUuid ?? undefined,
    environment_name: cfg.environmentName,
    github_repository: input.repositoryFullName,
    git_branch: input.branchName,
    build_pack: "nixpacks",
    ports_exposes: "3000",
    domains: input.domain,
    instant_deploy: false,
  };

  const created = await coolifyFetch<{ uuid?: string }>("/applications", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!created?.uuid) {
    throw new Error("Coolify did not return an application UUID");
  }
  return { applicationUuid: created.uuid, created: true };
}

export async function triggerPreviewDeployment(
  applicationUuid: string
): Promise<{ deploymentUuid: string | null; status: string | null }> {
  const data = await coolifyFetch<{
    deployments?: { uuid?: string; status?: string }[];
    deployment_uuid?: string;
    status?: string;
  }>(`/applications/${encodeURIComponent(applicationUuid)}/deploy`, {
    method: "POST",
  });

  const deployment = data?.deployments?.[0];
  return {
    deploymentUuid: deployment?.uuid ?? data?.deployment_uuid ?? null,
    status: deployment?.status ?? data?.status ?? null,
  };
}

export async function getPreviewDeploymentStatus(
  deploymentUuid: string
): Promise<{ status: string | null; logUrl: string | null }> {
  const data = await coolifyFetch<{ status?: string; log_url?: string }>(
    `/deployments/${encodeURIComponent(deploymentUuid)}`
  );
  return { status: data?.status ?? null, logUrl: data?.log_url ?? null };
}

// ── Orchestration ────────────────────────────────────────────────────────────

export interface PreparedPreview {
  id: string;
  status: PreviewStatus;
  provider: string;
  previewUrl: string | null;
  error: string | null;
}

/**
 * Prepares (or reuses) a DEV preview for a work session according to the
 * configured runner mode. Never deploys to production, never touches main,
 * never merges. Returns a readable status even when not configured.
 */
export async function prepareDevPreview(
  input: PreviewDeploymentInput & { workSessionId: string | null }
): Promise<PreparedPreview> {
  const mode = getPreviewRunnerMode();
  const cfg = getCoolifyConfig();
  const { projectId, taskId, workSessionId, repositoryFullName, branchName, pullRequestNumber, commitSha } = input;

  // Reuse an existing preview for this session if there is one.
  const existing = workSessionId
    ? await prisma.previewDeployment.findFirst({
        where: { workSessionId, projectId },
        orderBy: { createdAt: "desc" },
      })
    : null;

  const requestedAt = new Date();

  const upsertData = {
    projectId,
    taskId: taskId ?? null,
    workSessionId,
    branchName: branchName ?? null,
    repositoryFullName: repositoryFullName ?? null,
    pullRequestNumber: pullRequestNumber ?? null,
    commitSha: commitSha ?? null,
    requestedAt,
  };

  // ── disabled ──
  if (mode === "disabled") {
    const error = "DEV Preview runner is not configured (PREVIEW_RUNNER_MODE=disabled).";
    if (existing) {
      await prisma.previewDeployment.update({
        where: { id: existing.id },
        data: {
          status: "not_configured",
          provider: existing.provider || "coolify",
          error,
          requestedAt,
        },
      });
      return { id: existing.id, status: "not_configured", provider: existing.provider || "coolify", previewUrl: existing.previewUrl, error };
    }
    const created = await prisma.previewDeployment.create({
      data: { ...upsertData, provider: "coolify", status: "not_configured", error },
    });
    return { id: created.id, status: "not_configured", provider: "coolify", previewUrl: null, error };
  }

  // ── manual ──
  if (mode === "manual") {
    const error = "Register a manual preview URL using the manual endpoint.";
    if (existing) {
      await prisma.previewDeployment.update({
        where: { id: existing.id },
        data: { status: "not_configured", provider: "manual", error, requestedAt },
      });
      return { id: existing.id, status: "not_configured", provider: "manual", previewUrl: existing.previewUrl, error };
    }
    const created = await prisma.previewDeployment.create({
      data: { ...upsertData, provider: "manual", status: "not_configured", error },
    });
    return { id: created.id, status: "not_configured", provider: "manual", previewUrl: null, error };
  }

  // ── coolify_api ──
  if (!isCoolifyConfigured()) {
    const error = "Coolify API token is not configured.";
    if (existing) {
      await prisma.previewDeployment.update({
        where: { id: existing.id },
        data: { status: "not_configured", provider: "coolify", error, requestedAt },
      });
      return { id: existing.id, status: "not_configured", provider: "coolify", previewUrl: existing.previewUrl, error };
    }
    const created = await prisma.previewDeployment.create({
      data: { ...upsertData, provider: "coolify", status: "not_configured", error },
    });
    return { id: created.id, status: "not_configured", provider: "coolify", previewUrl: null, error };
  }

  const connection = await checkCoolifyConnection();
  if (!connection.ok) {
    const error = `Could not reach Coolify API: ${connection.error ?? "unknown error"}`;
    if (existing) {
      await prisma.previewDeployment.update({
        where: { id: existing.id },
        data: { status: "failed", provider: "coolify", error, requestedAt },
      });
      return { id: existing.id, status: "failed", provider: "coolify", previewUrl: existing.previewUrl, error };
    }
    const created = await prisma.previewDeployment.create({
      data: { ...upsertData, provider: "coolify", status: "failed", error },
    });
    return { id: created.id, status: "failed", provider: "coolify", previewUrl: null, error };
  }

  if (!repositoryFullName || !branchName) {
    const error = "Task has no repository/branch to preview.";
    if (existing) {
      await prisma.previewDeployment.update({
        where: { id: existing.id },
        data: { status: "failed", provider: "coolify", error, requestedAt },
      });
      return { id: existing.id, status: "failed", provider: "coolify", previewUrl: existing.previewUrl, error };
    }
    const created = await prisma.previewDeployment.create({
      data: { ...upsertData, provider: "coolify", status: "failed", error },
    });
    return { id: created.id, status: "failed", provider: "coolify", previewUrl: null, error };
  }

  const domain = buildPreviewDomain(taskId ?? "task", workSessionId);

  try {
    const { applicationUuid, created } = await createOrReusePreviewApplication({
      domain,
      repositoryFullName,
      branchName,
    });

    const row = existing
      ? await prisma.previewDeployment.update({
          where: { id: existing.id },
          data: {
            ...upsertData,
            provider: "coolify",
            status: "deploying",
            domain,
            previewUrl: `https://${domain}`,
            coolifyApplicationUuid: applicationUuid,
            coolifyProjectUuid: cfg.projectUuid,
            coolifyServerUuid: cfg.serverUuid,
            error: null,
            lastDeploymentStatus: null,
            requestedAt,
          },
        })
      : await prisma.previewDeployment.create({
          data: {
            ...upsertData,
            provider: "coolify",
            status: "deploying",
            domain,
            previewUrl: `https://${domain}`,
            coolifyApplicationUuid: applicationUuid,
            coolifyProjectUuid: cfg.projectUuid,
            coolifyServerUuid: cfg.serverUuid,
          },
        });

    const deployment = await triggerPreviewDeployment(applicationUuid);

    const updated = await prisma.previewDeployment.update({
      where: { id: row.id },
      data: {
        coolifyDeploymentUuid: deployment.deploymentUuid,
        lastDeploymentStatus: deployment.status,
        status: "deploying",
      },
    });

    return {
      id: updated.id,
      status: "deploying",
      provider: "coolify",
      previewUrl: updated.previewUrl,
      error: null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown preview error";
    if (existing) {
      await prisma.previewDeployment.update({
        where: { id: existing.id },
        data: { status: "failed", provider: "coolify", error: message, requestedAt },
      });
      return { id: existing.id, status: "failed", provider: "coolify", previewUrl: existing.previewUrl, error: message };
    }
    const created = await prisma.previewDeployment.create({
      data: { ...upsertData, provider: "coolify", status: "failed", error: message },
    });
    return { id: created.id, status: "failed", provider: "coolify", previewUrl: null, error: message };
  }
}

/**
 * Refreshes a preview deployment. For provider "coolify" it queries the
 * deployment status from Coolify; for "manual" it only bumps lastCheckedAt.
 */
export async function refreshPreviewDeployment(
  previewDeploymentId: string
) {
  const preview = await prisma.previewDeployment.findUnique({
    where: { id: previewDeploymentId },
  });
  if (!preview) throw new Error("Preview deployment not found");

  const now = new Date();

  if (preview.provider === "coolify" && preview.coolifyDeploymentUuid && isCoolifyConfigured()) {
    try {
      const status = await getPreviewDeploymentStatus(preview.coolifyDeploymentUuid);
      let newStatus: PreviewStatus = preview.status as PreviewStatus;
      if (status.status === "finished" || status.status === "success") {
        newStatus = "ready";
      } else if (status.status === "failed" || status.status === "error" || status.status === "cancelled") {
        newStatus = "failed";
      } else if (status.status === "in_progress" || status.status === "queued" || status.status === "running") {
        newStatus = "deploying";
      }
      return prisma.previewDeployment.update({
        where: { id: preview.id },
        data: {
          status: newStatus,
          lastDeploymentStatus: status.status,
          lastDeploymentLogUrl: status.logUrl,
          lastCheckedAt: now,
          deployedAt: newStatus === "ready" ? (preview.deployedAt ?? now) : preview.deployedAt,
          error: newStatus === "failed" ? "Preview deployment failed" : preview.error,
        },
      });
    } catch (error) {
      return prisma.previewDeployment.update({
        where: { id: preview.id },
        data: {
          lastCheckedAt: now,
          error: error instanceof Error ? error.message : "Could not refresh preview",
        },
      });
    }
  }

  return prisma.previewDeployment.update({
    where: { id: preview.id },
    data: { lastCheckedAt: now },
  });
}
