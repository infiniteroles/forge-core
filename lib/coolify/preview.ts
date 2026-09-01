import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import {
  getCoolifyConfig,
  isCoolifyConfigured,
  coolifyFetch,
  checkCoolifyConnection,
  listCoolifyApplications,
  CoolifyError,
} from "./client";
import { buildPreviewAppName, buildPreviewDomain } from "./preview-domain";
import { checkRepository } from "@/lib/github/repository";
import { setPreviewApplicationEnvironment } from "./environment";
import {
  PreviewRunnerConfig,
  PreviewRunnerMode,
  PreviewDeploymentInput,
  PreviewStatus,
} from "./types";

export {
  buildPreviewDomain,
  buildFreePreviewDomain,
  buildPreviewAppName,
} from "./preview-domain";

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
    defaultPort: cfg.defaultPort,
    buildPack: cfg.buildPack,
    appNamePrefix: cfg.appNamePrefix,
    deployTimeoutMs: cfg.deployTimeoutMs,
  };
}

interface CoolifyApplication {
  uuid?: string;
  name?: string;
  domains?: string;
  git_branch?: string;
  status?: string;
}

/**
 * Creates or reuses a Coolify application for a preview domain + branch.
 *
 * Priority:
 *  1. an existing Forge PreviewDeployment already carrying coolifyApplicationUuid;
 *  2. an existing Coolify application already serving the same domain;
 *  3. create a new application (name forge-preview-<taskShort>, DEV env only).
 *
 * Never touches production. Never deletes resources.
 */
export async function createOrReusePreviewApplication(input: {
  projectId: string;
  taskId: string;
  workSessionId: string | null;
  repositoryFullName: string;
  branchName: string;
  domain: string;
  commitSha?: string | null;
}): Promise<{ applicationUuid: string; created: boolean; reused: boolean }> {
  if (!isCoolifyConfigured()) {
    throw new Error("Coolify API token is not configured");
  }

  // 1. Reuse a Forge preview that already has a Coolify app for this session.
  const existingForgePreview = await prisma.previewDeployment.findFirst({
    where: {
      workSessionId: input.workSessionId ?? undefined,
      projectId: input.projectId,
      coolifyApplicationUuid: { not: null },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existingForgePreview?.coolifyApplicationUuid) {
    return {
      applicationUuid: existingForgePreview.coolifyApplicationUuid,
      created: false,
      reused: true,
    };
  }

  // 2. Reuse an existing Coolify app that already serves this domain.
  try {
    const apps = await listCoolifyApplications();
    const match = apps.find((a) =>
      a.domains
        ? a.domains
            .split(",")
            .map((d) => d.trim())
            .includes(input.domain)
        : false
    );
    if (match?.uuid) {
      return { applicationUuid: match.uuid, created: false, reused: true };
    }
  } catch {
    // fall through to create
  }

  // 3. Create a new app in the DEV environment (never production).
  // Public repos use POST /applications/public (proven). Private repos use the
  // GitHub App source via POST /applications/github so Coolify can clone them.
  const cfg = getCoolifyConfig();
  const common: Record<string, unknown> = {
    project_uuid: cfg.projectUuid ?? undefined,
    server_uuid: cfg.serverUuid ?? undefined,
    environment_name: cfg.environmentName,
    git_branch: input.branchName,
    build_pack: cfg.buildPack,
    ports_exposes: cfg.defaultPort,
    domains: `https://${input.domain}`,
    instant_deploy: false,
    name: buildPreviewAppName(input.taskId),
  };

  let repoIsPrivate = false;
  try {
    const repo = await checkRepository(input.repositoryFullName);
    repoIsPrivate = repo.visibility === "private";
  } catch {
    repoIsPrivate = false; // best-effort; if we can't tell, let Coolify try
  }

  let endpoint = "/applications/public";
  let body: Record<string, unknown>;
  if (repoIsPrivate) {
    if (!cfg.githubAppUuid) {
      throw new Error(
        `El repositorio «${input.repositoryFullName}» es privado y no hay GitHub App configurada en Forge (COOLIFY_GITHUB_APP_UUID).`
      );
    }
    // Coolify v4: creating an app from a private repo through a GitHub App uses
    // POST /applications/private-github-app (github_app_uuid + owner/repo).
    endpoint = "/applications/private-github-app";
    body = {
      ...common,
      github_app_uuid: cfg.githubAppUuid,
      git_repository: input.repositoryFullName, // full name owner/repo for GitHub App sources
    };
  } else {
    body = {
      ...common,
      git_repository: `https://github.com/${input.repositoryFullName}`,
    };
  }

  // Coolify sometimes returns a transient 404 right after creating a resource
  // (a race where the app isn't immediately queryable). Retry a few times on
  // not_found before giving up so previews don't fail randomly.
  let created: { uuid?: string } | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      created = await coolifyFetch<{ uuid?: string }>(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      });
      break;
    } catch (error) {
      lastError = error;
      const transient =
        error instanceof CoolifyError && error.code === "not_found";
      if (!transient) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  if (!created?.uuid) {
    throw lastError instanceof Error
      ? lastError
      : new Error("Coolify did not return an application UUID");
  }
  return { applicationUuid: created.uuid, created: true, reused: false };
}

/**
 * Triggers a deployment for a preview's Coolify application and records it on
 * the PreviewDeployment row. Returns the updated preview.
 */
export async function triggerPreviewDeployment(previewDeploymentId: string) {
  const preview = await prisma.previewDeployment.findUnique({
    where: { id: previewDeploymentId },
  });
  if (!preview) throw new Error("Preview deployment not found");
  if (!preview.coolifyApplicationUuid) {
    throw new Error("Preview has no Coolify application UUID");
  }
  if (!isCoolifyConfigured()) {
    throw new Error("Coolify API token is not configured");
  }

  // Coolify API triggers a deployment via POST /applications/{uuid}/start
  // (action_deploy). There is no /applications/{uuid}/deploy endpoint.
  const data = await coolifyFetch<{
    deployments?: { uuid?: string; status?: string }[];
    deployment_uuid?: string;
    status?: string;
  }>(`/applications/${encodeURIComponent(preview.coolifyApplicationUuid)}/start`, {
    method: "POST",
  });

  const deployment = data?.deployments?.[0];
  const deploymentUuid = deployment?.uuid ?? data?.deployment_uuid ?? null;
  const rawStatus = deployment?.status ?? data?.status ?? "triggered";

  const updated = await prisma.previewDeployment.update({
    where: { id: preview.id },
    data: {
      status: "deploying",
      coolifyDeploymentUuid: deploymentUuid,
      lastDeploymentStatus: rawStatus,
      lastCheckedAt: new Date(),
      error: null,
    },
  });

  await logActivity({
    projectId: preview.projectId,
    type: "preview.deployment_started",
    message: "DEV Preview deployment started on Coolify.",
    metadata: {
      previewDeploymentId: preview.id,
      workSessionId: preview.workSessionId ?? undefined,
      taskId: preview.taskId ?? undefined,
      provider: "coolify",
      status: "deploying",
      previewUrl: preview.previewUrl ?? undefined,
      domain: preview.domain ?? undefined,
      branchName: preview.branchName ?? undefined,
      deploymentUuid,
    },
  });

  return updated;
}

/**
 * Maps a Coolify deployment status string to our PreviewStatus.
 */
function mapCoolifyStatus(raw: string | null | undefined): PreviewStatus {
  const s = (raw ?? "").toLowerCase();
  if (!s) return "deploying";
  if (
    s.includes("finished") ||
    s.includes("success") ||
    s.includes("completed") ||
    s === "ready"
  ) {
    return "ready";
  }
  if (
    s.includes("failed") ||
    s.includes("error") ||
    s.includes("cancelled") ||
    s.includes("canceled")
  ) {
    return s.includes("cancelled") || s.includes("canceled") ? "stopped" : "failed";
  }
  if (s.includes("queued")) return "queued";
  if (s.includes("progress") || s.includes("running") || s.includes("deploy")) {
    return "deploying";
  }
  return "deploying";
}

/**
 * Queries the live deployment status from Coolify and updates the
 * PreviewDeployment row. Returns the updated preview.
 */
export async function getPreviewDeploymentStatus(previewDeploymentId: string) {
  const preview = await prisma.previewDeployment.findUnique({
    where: { id: previewDeploymentId },
  });
  if (!preview) throw new Error("Preview deployment not found");

  if (preview.provider !== "coolify" || !preview.coolifyDeploymentUuid) {
    return prisma.previewDeployment.update({
      where: { id: preview.id },
      data: { lastCheckedAt: new Date() },
    });
  }

  if (!isCoolifyConfigured()) {
    return prisma.previewDeployment.update({
      where: { id: preview.id },
      data: {
        lastCheckedAt: new Date(),
        error: "Coolify API token is not configured",
      },
    });
  }

  try {
    const data = await coolifyFetch<{ status?: string; log_url?: string }>(
      `/deployments/${encodeURIComponent(preview.coolifyDeploymentUuid)}`
    );

    const rawStatus = data?.status ?? null;
    const mapped = mapCoolifyStatus(rawStatus);
    const now = new Date();

    const updated = await prisma.previewDeployment.update({
      where: { id: preview.id },
      data: {
        status: mapped,
        lastDeploymentStatus: rawStatus,
        lastDeploymentLogUrl: data?.log_url ?? preview.lastDeploymentLogUrl,
        deployedAt: mapped === "ready" ? (preview.deployedAt ?? now) : preview.deployedAt,
        lastCheckedAt: now,
        error: mapped === "failed" ? "Preview deployment failed" : preview.error,
      },
    });

    await logActivity({
      projectId: preview.projectId,
      type: "preview.refreshed",
      message: `DEV Preview refreshed (${mapped}).`,
      metadata: {
        previewDeploymentId: preview.id,
        workSessionId: preview.workSessionId ?? undefined,
        taskId: preview.taskId ?? undefined,
        provider: "coolify",
        status: mapped,
        previewUrl: preview.previewUrl ?? undefined,
        domain: preview.domain ?? undefined,
        lastDeploymentStatus: rawStatus ?? undefined,
      },
    });

    if (mapped === "ready") {
      await logActivity({
        projectId: preview.projectId,
        type: "preview.ready",
        message: "DEV Preview is ready.",
        metadata: {
          previewDeploymentId: preview.id,
          workSessionId: preview.workSessionId ?? undefined,
          taskId: preview.taskId ?? undefined,
          provider: "coolify",
          status: "ready",
          previewUrl: preview.previewUrl ?? undefined,
          domain: preview.domain ?? undefined,
        },
      });
    } else if (mapped === "failed") {
      await logActivity({
        projectId: preview.projectId,
        type: "preview.failed",
        message: "DEV Preview deployment failed.",
        metadata: {
          previewDeploymentId: preview.id,
          workSessionId: preview.workSessionId ?? undefined,
          taskId: preview.taskId ?? undefined,
          provider: "coolify",
          status: "failed",
          previewUrl: preview.previewUrl ?? undefined,
          lastDeploymentStatus: rawStatus ?? undefined,
        },
      });
    }

    return updated;
  } catch (error) {
    // A 404 on a just-created deployment is a transient Coolify race: keep the
    // current status and avoid surfacing a scary error that flips the preview.
    const transient =
      error instanceof CoolifyError && error.code === "not_found";
    return prisma.previewDeployment.update({
      where: { id: preview.id },
      data: {
        lastCheckedAt: new Date(),
        ...(transient
          ? { error: null }
          : {
              error:
                error instanceof Error
                  ? error.message
                  : "Could not refresh preview",
            }),
      },
    });
  }
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
  const { projectId, taskId, workSessionId, repositoryFullName, branchName, pullRequestNumber, commitSha } =
    input;

  const requestedAt = new Date();

  const existing = workSessionId
    ? await prisma.previewDeployment.findFirst({
        where: { workSessionId, projectId },
        orderBy: { createdAt: "desc" },
      })
    : null;

  const base = {
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
    const row = existing
      ? await prisma.previewDeployment.update({
          where: { id: existing.id },
          data: { status: "not_configured", provider: existing.provider || "coolify", error, requestedAt },
        })
      : await prisma.previewDeployment.create({
          data: { ...base, provider: "coolify", status: "not_configured", error },
        });
    return { id: row.id, status: "not_configured", provider: row.provider, previewUrl: row.previewUrl, error };
  }

  // ── manual ──
  if (mode === "manual") {
    const error = "Register a manual preview URL using the manual endpoint.";
    const row = existing
      ? await prisma.previewDeployment.update({
          where: { id: existing.id },
          data: { status: "not_configured", provider: "manual", error, requestedAt },
        })
      : await prisma.previewDeployment.create({
          data: { ...base, provider: "manual", status: "not_configured", error },
        });
    return { id: row.id, status: "not_configured", provider: "manual", previewUrl: row.previewUrl, error };
  }

  // ── coolify_api ──
  if (!isCoolifyConfigured()) {
    const error = "Coolify API token is not configured (COOLIFY_API_TOKEN).";
    const row = existing
      ? await prisma.previewDeployment.update({
          where: { id: existing.id },
          data: { status: "not_configured", provider: "coolify", error, requestedAt },
        })
      : await prisma.previewDeployment.create({
          data: { ...base, provider: "coolify", status: "not_configured", error },
        });
    return { id: row.id, status: "not_configured", provider: "coolify", previewUrl: row.previewUrl, error };
  }

  const connection = await checkCoolifyConnection();
  if (!connection.ok) {
    const error = `Could not reach Coolify API: ${connection.error ?? "unknown error"}`;
    const row = existing
      ? await prisma.previewDeployment.update({
          where: { id: existing.id },
          data: { status: "failed", provider: "coolify", error, requestedAt },
        })
      : await prisma.previewDeployment.create({
          data: { ...base, provider: "coolify", status: "failed", error },
        });
    return { id: row.id, status: "failed", provider: "coolify", previewUrl: row.previewUrl, error };
  }

  if (!repositoryFullName || !branchName) {
    const error = "Task has no repository/branch to preview.";
    const row = existing
      ? await prisma.previewDeployment.update({
          where: { id: existing.id },
          data: { status: "failed", provider: "coolify", error, requestedAt },
        })
      : await prisma.previewDeployment.create({
          data: { ...base, provider: "coolify", status: "failed", error },
        });
    return { id: row.id, status: "failed", provider: "coolify", previewUrl: row.previewUrl, error };
  }

  const domain = existing?.domain ?? buildPreviewDomain(taskId ?? "task", workSessionId);

  // Create (or reuse) the Forge PreviewDeployment row first.
  const row = existing
    ? await prisma.previewDeployment.update({
        where: { id: existing.id },
        data: {
          ...base,
          provider: "coolify",
          status: "creating",
          domain,
          previewUrl: `https://${domain}`,
          coolifyProjectUuid: cfg.projectUuid,
          coolifyServerUuid: cfg.serverUuid,
          error: null,
        },
      })
    : await prisma.previewDeployment.create({
        data: {
          ...base,
          provider: "coolify",
          status: "creating",
          domain,
          previewUrl: `https://${domain}`,
          coolifyProjectUuid: cfg.projectUuid,
          coolifyServerUuid: cfg.serverUuid,
        },
      });

  await logActivity({
    projectId: row.projectId,
    type: "preview.created",
    message: "DEV Preview record created.",
    metadata: {
      previewDeploymentId: row.id,
      workSessionId: row.workSessionId ?? undefined,
      taskId: row.taskId ?? undefined,
      provider: "coolify",
      status: "creating",
      previewUrl: row.previewUrl ?? undefined,
      domain: row.domain ?? undefined,
      branchName: row.branchName ?? undefined,
    },
  });

  // Private repositories need a GitHub App source in Coolify (a "Public GitHub"
  // source cannot clone them). If no GitHub App is configured, fail fast with a
  // clear, actionable error instead of leaving the preview stuck "deploying".
  if (repositoryFullName) {
    try {
      const repo = await checkRepository(repositoryFullName);
      if (repo.visibility === "private" && !cfg.githubAppUuid) {
        const error =
          `El repositorio «${repositoryFullName}» es privado y no hay ninguna GitHub App conectada en Coolify. ` +
          `Conecta una GitHub App (Sources) con acceso a tus repositorios para poder previsualizar repos privados.`;
        await prisma.previewDeployment.update({
          where: { id: row.id },
          data: { status: "failed", error },
        });
        await logActivity({
          projectId: row.projectId,
          type: "preview.failed",
          message: `DEV Preview failed: repositorio privado (${repositoryFullName}).`,
          metadata: {
            previewDeploymentId: row.id,
            workSessionId: row.workSessionId ?? undefined,
            taskId: row.taskId ?? undefined,
            provider: "coolify",
            status: "failed",
            previewUrl: row.previewUrl ?? undefined,
            domain: row.domain ?? undefined,
            branchName: row.branchName ?? undefined,
            repository: repositoryFullName,
          },
        });
        return {
          id: row.id,
          status: "failed" as PreviewStatus,
          provider: "coolify",
          previewUrl: row.previewUrl,
          error,
        };
      }
    } catch {
      // Best-effort: si no podemos consultar la visibilidad (red, permisos),
      // dejamos que Coolify intente el despliegue y el refresco posterior
      // reportará el fallo real.
    }
  }

  try {
    const { applicationUuid, created, reused } = await createOrReusePreviewApplication({
      projectId: row.projectId,
      taskId: taskId ?? "task",
      workSessionId,
      repositoryFullName,
      branchName,
      domain,
      commitSha: commitSha ?? null,
    });

    await prisma.previewDeployment.update({
      where: { id: row.id },
      data: { coolifyApplicationUuid: applicationUuid },
    });

    await logActivity({
      projectId: row.projectId,
      type: created ? "preview.application_created" : "preview.application_reused",
      message: created
        ? "Coolify preview application created."
        : "Coolify preview application reused.",
      metadata: {
        previewDeploymentId: row.id,
        workSessionId: row.workSessionId ?? undefined,
        taskId: row.taskId ?? undefined,
        provider: "coolify",
        status: "creating",
        previewUrl: row.previewUrl ?? undefined,
        domain: row.domain ?? undefined,
        branchName: row.branchName ?? undefined,
      },
    });

    // Configure the preview runtime environment BEFORE triggering the deploy so
    // the container boots with the required runtime vars. Never copies secrets
    // (denylist enforced in preview-env-policy). On a real API failure this
    // throws and the outer catch marks the preview as failed with a clear error
    // (manual fallback is documented). Intentionally skipped modes (disabled /
    // no variables) do not throw and do not block the deploy.
    const envResult = await setPreviewApplicationEnvironment({
      applicationUuid,
      domain: row.domain ?? domain,
    });

    const existingMeta =
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {};
    const envMeta = {
      mode: envResult.mode,
      configured: envResult.configured,
      keys: envResult.keys,
      skipped: [...envResult.skipped, ...envResult.unavailable],
      error: envResult.error ?? null,
      configuredAt: envResult.configuredAt ?? null,
    };
    await prisma.previewDeployment.update({
      where: { id: row.id },
      data: { metadata: { ...existingMeta, env: envMeta } },
    });

    const envActivityMeta = {
      previewDeploymentId: row.id,
      workSessionId: row.workSessionId ?? undefined,
      taskId: row.taskId ?? undefined,
      mode: envResult.mode,
      keys: envResult.keys,
      skipped: [...envResult.skipped, ...envResult.unavailable],
    };

    if (envResult.error) {
      await logActivity({
        projectId: row.projectId,
        type: "preview.env_failed",
        message: `Preview runtime environment failed: ${envResult.error}`,
        metadata: envActivityMeta,
      });
    } else if (envResult.mode === "disabled") {
      await logActivity({
        projectId: row.projectId,
        type: "preview.env_skipped",
        message: "Preview runtime environment injection is disabled (PREVIEW_ENV_MODE=disabled).",
        metadata: envActivityMeta,
      });
    } else if (envResult.configured) {
      await logActivity({
        projectId: row.projectId,
        type: "preview.env_configured",
        message: "Preview runtime environment configured.",
        metadata: envActivityMeta,
      });
    } else {
      await logActivity({
        projectId: row.projectId,
        type: "preview.env_skipped",
        message: "Preview runtime environment skipped (no variables to set).",
        metadata: envActivityMeta,
      });
    }

    // Trigger the deployment.
    await triggerPreviewDeployment(row.id);

    const updated = await prisma.previewDeployment.findUnique({ where: { id: row.id } });
    return {
      id: row.id,
      status: (updated?.status as PreviewStatus) ?? "deploying",
      provider: "coolify",
      previewUrl: updated?.previewUrl ?? null,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown preview error";
    await prisma.previewDeployment.update({
      where: { id: row.id },
      data: { status: "failed", provider: "coolify", error: message },
    });
    await logActivity({
      projectId: row.projectId,
      type: "preview.failed",
      message: `DEV Preview failed: ${message}`,
      metadata: {
        previewDeploymentId: row.id,
        workSessionId: row.workSessionId ?? undefined,
        taskId: row.taskId ?? undefined,
        provider: "coolify",
        status: "failed",
        previewUrl: row.previewUrl ?? undefined,
        domain: row.domain ?? undefined,
      },
    });
    return {
      id: row.id,
      status: "failed",
      provider: "coolify",
      previewUrl: row.previewUrl,
      error: message,
    };
  }
}

/**
 * Refreshes a preview deployment. For provider "coolify" it queries the live
 * deployment status from Coolify; for "manual" it only bumps lastCheckedAt.
 */
export async function refreshPreviewDeployment(previewDeploymentId: string) {
  const preview = await prisma.previewDeployment.findUnique({
    where: { id: previewDeploymentId },
  });
  if (!preview) throw new Error("Preview deployment not found");

  if (preview.provider === "coolify" && preview.coolifyDeploymentUuid) {
    return getPreviewDeploymentStatus(preview.id);
  }

  // Manual (or coolify without a deployment uuid yet): just touch lastCheckedAt.
  return prisma.previewDeployment.update({
    where: { id: preview.id },
    data: { lastCheckedAt: new Date() },
  });
}
