/**
 * Production promotion service (Fase 3.9).
 *
 * Orchestrates the controlled promotion of an approved pull request into main:
 *
 *  - `prepareProductionPromotion`  runs the preflight and records a
 *    ProductionPromotion in `ready_to_promote` or `preflight_failed`.
 *    It NEVER merges.
 *  - `executeProductionPromotion`  requires the literal confirmation "PROMOTE",
 *    re-runs the preflight, merges the PR via the GitHub API, waits for the
 *    production deploy to pick the merge up, verifies /api/health and the
 *    task's expected endpoint, and marks the promotion completed or failed.
 *    There is NO automatic rollback.
 *  - `refreshProductionPromotion`  re-reads the live PR merge state and probes
 *    production endpoints to bring the promotion up to date. It NEVER re-merges.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import {
  getPullRequest,
  mergePullRequest,
} from "@/lib/github/pull-requests";
import { getJobPolicy } from "@/lib/jobs/policy";
import { markJobStale } from "@/lib/jobs/service";
import { getProductionDeploymentStatus } from "@/lib/coolify/production";
import { getProductionPromotionPolicy } from "./policy";
import { runProductionPromotionPreflight } from "./preflight";
import { buildProductionPromotionSummary } from "./summary";
import type {
  ProductionDeploymentSummary,
  ProductionHealthProbe,
  ProductionPromotionStatus,
  ProductionVerificationResult,
} from "./types";

/** Maps a possibly-null value to a Prisma Json input (SQL NULL when absent). */
function jsonField(v: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (v === null || v === undefined) return Prisma.DbNull;
  return v as Prisma.InputJsonValue;
}

export interface ProductionPromotionRecord {
  id: string;
  status: string;
  strategy: string;
  summary: string | null;
  error: string | null;
  prNumber: number | null;
  prUrl: string | null;
  branchName: string | null;
  baseBranch: string | null;
  mergeCommitSha: string | null;
  mergeMethod: string | null;
  jobRunId: string | null;
  preflightSummary: unknown;
  deploymentSummary: unknown;
  verificationSummary: unknown;
  requestedBy: string | null;
  requestedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Probes a URL with a timeout. Never throws. */
export async function probeUrl(
  url: string,
  timeoutMs: number
): Promise<ProductionHealthProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    return { url, status: res.status, ok: res.status >= 200 && res.status < 300 };
  } catch {
    return { url, status: 0, ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Derives the expected production endpoint for a task from the paths it
 * changed. For a file `app/api/ping/route.ts` it returns `/api/ping`.
 */
export function expectedEndpointFromFiles(paths: unknown): string | null {
  if (!Array.isArray(paths)) return null;
  for (const p of paths) {
    if (typeof p !== "string") continue;
    const m = /^app\/api\/([^/]+)\/route\.ts$/.exec(p);
    if (m) return `/api/${m[1]}`;
  }
  return null;
}

/**
 * Verifies the promotion result: PR merged (live), production health, and the
 * task's expected endpoint on the production base URL.
 */
export async function verifyProductionPromotion(
  promotion: {
    prNumber: number | null;
    repositoryFullName: string | null;
    mergeCommitSha: string | null;
    expectedEndpoint: string | null;
  }
): Promise<ProductionVerificationResult> {
  const policy = getProductionPromotionPolicy();
  const baseUrl = policy.productionBaseUrl.replace(/\/$/, "");

  let prMerged: boolean | undefined;
  let liveMergeSha: string | null = promotion.mergeCommitSha;
  if (promotion.repositoryFullName && promotion.prNumber) {
    try {
      const pr = await getPullRequest({
        repositoryFullName: promotion.repositoryFullName,
        prNumber: promotion.prNumber,
      });
      prMerged = Boolean(pr.merged_at);
      if (pr.mergeCommitSha) liveMergeSha = pr.mergeCommitSha;
    } catch {
      prMerged = undefined;
    }
  }

  const health = await probeUrl(`${baseUrl}/api/health`, 8000);
  const expectedEndpoint = promotion.expectedEndpoint
    ? await probeUrl(`${baseUrl}${promotion.expectedEndpoint}`, 8000)
    : null;

  const ok =
    (prMerged !== false) &&
    health.ok &&
    (expectedEndpoint ? expectedEndpoint.ok : true);

  return {
    ok,
    prMerged,
    mergeCommitSha: liveMergeSha,
    health,
    expectedEndpoint,
  };
}

/**
 * Waits for the production deploy to pick up the merge by polling the
 * expected endpoint (and health). When a Coolify `deploymentUuid` is
 * available, the Coolify deployment status is checked first on each poll;
 * a deployment still queued/running does NOT fail the wait (it is within
 * the window), but a Coolify-reported failure fails fast with a clear error.
 * Returns the deploy summary and whether the deploy looks live.
 */
export async function waitForProductionDeploy(
  expectedEndpoint: string | null,
  opts?: { deploymentUuid?: string | null }
): Promise<{ live: boolean; deploymentSummary: ProductionDeploymentSummary }> {
  const policy = getProductionPromotionPolicy();
  const baseUrl = policy.productionBaseUrl.replace(/\/$/, "");
  const deadline = Date.now() + policy.deployWaitMs;
  const probeTimeout = Math.min(policy.deployPollIntervalMs, 8000);

  let pollCount = 0;
  let coolifyStatus: string | null = null;
  let lastHealth: ProductionHealthProbe | null = null;
  let lastEndpoint: ProductionHealthProbe | null = null;

  while (Date.now() < deadline) {
    pollCount += 1;

    // 1. Coolify deployment status (if we know the deployment UUID).
    if (opts?.deploymentUuid) {
      try {
        const st = await getProductionDeploymentStatus(opts.deploymentUuid);
        coolifyStatus = st.status;
      } catch {
        coolifyStatus = coolifyStatus ?? "unknown";
      }
      // A deploy that Coolify reports as failed is not going to pick the
      // merge up; fail fast with a clear message instead of waiting out the
      // whole window.
      if (coolifyStatus === "failed" || coolifyStatus === "error") {
        return {
          live: false,
          deploymentSummary: {
            mode: policy.deployMode,
            waitedMs: policy.deployWaitMs - Math.max(0, deadline - Date.now()),
            pollCount,
            deploymentUuid: opts.deploymentUuid,
            coolifyStatus,
            health: lastHealth,
            expectedEndpoint: lastEndpoint ?? null,
            healthOk: lastHealth?.ok === true,
            endpointOk: lastEndpoint?.ok === true,
            message:
              "El despliegue de producción falló en Coolify (estado " +
              `${coolifyStatus}). No se revierte nada automáticamente.`,
          },
        };
      }
    }

    // 2. Production health.
    lastHealth = await probeUrl(`${baseUrl}/api/health`, probeTimeout);
    // 3. Expected endpoint (task micro-feature).
    if (expectedEndpoint) {
      lastEndpoint = await probeUrl(
        `${baseUrl}${expectedEndpoint}`,
        probeTimeout
      );
    }
    const live =
      lastHealth.ok && (expectedEndpoint ? Boolean(lastEndpoint?.ok) : true);
    if (live) {
      return {
        live: true,
        deploymentSummary: {
          mode: policy.deployMode,
          waitedMs: policy.deployWaitMs - Math.max(0, deadline - Date.now()),
          pollCount,
          deploymentUuid: opts?.deploymentUuid ?? undefined,
          coolifyStatus,
          health: lastHealth,
          expectedEndpoint: lastEndpoint ?? null,
          healthOk: lastHealth.ok,
          endpointOk: lastEndpoint?.ok ?? undefined,
          message: "El despliegue de producción responde correctamente.",
        },
      };
    }
    await sleep(policy.deployPollIntervalMs);
  }

  return {
    live: false,
    deploymentSummary: {
      mode: policy.deployMode,
      waitedMs: policy.deployWaitMs,
      pollCount,
      deploymentUuid: opts?.deploymentUuid ?? undefined,
      coolifyStatus,
      health: lastHealth,
      expectedEndpoint: lastEndpoint ?? null,
      healthOk: lastHealth?.ok === true,
      endpointOk: lastEndpoint?.ok === true,
      message:
        "El despliegue de producción no respondió dentro de la ventana de espera. No se revierte nada automáticamente.",
    },
  };
}

/**
 * Loads a ProductionPromotion with its review/task/project for the service.
 */
export async function loadPromotion(promotionId: string) {
  return prisma.productionPromotion.findUnique({
    where: { id: promotionId },
    include: {
      project: true,
      task: true,
      workSession: true,
      productionReadinessReview: {
        include: { task: true, project: true },
      },
    },
  });
}

export async function updateSummary(
  id: string,
  data: {
    status?: string;
    summary?: string;
    error?: string | null;
    mergeCommitSha?: string | null;
    prUrl?: string | null;
    verificationSummary?: unknown;
    deploymentSummary?: unknown;
    metadata?: unknown;
    startedAt?: Date;
    completedAt?: Date | null;
    failedAt?: Date | null;
  }
): Promise<void> {
  const { summary, metadata, ...rest } = data;
  const payload: Record<string, unknown> = { ...rest };
  if (summary !== undefined) payload.summary = summary;
  if (data.verificationSummary !== undefined) {
    payload.verificationSummary = jsonField(data.verificationSummary);
  }
  if (data.deploymentSummary !== undefined) {
    payload.deploymentSummary = jsonField(data.deploymentSummary);
  }
  if (metadata !== undefined) payload.metadata = jsonField(metadata);
  await prisma.productionPromotion.update({
    where: { id },
    data: payload as Prisma.ProductionPromotionUpdateInput,
  });
}

/**
 * Prepares a promotion for an approved readiness review.
 * Runs the preflight, persists the ProductionPromotion, but NEVER merges.
 */
export async function prepareProductionPromotion(input: {
  reviewId: string;
  workSessionId: string | null;
  humanEmail: string;
}): Promise<ProductionPromotionRecord | null> {
  const review = await prisma.productionReadinessReview.findUnique({
    where: { id: input.reviewId },
    include: { task: true, project: true, workSession: true },
  });
  if (!review) {
    throw new Error("No existe la revisión de readiness indicada.");
  }

  await logActivity({
    projectId: review.projectId,
    type: "promotion.prepare_requested",
    message: `Preparación de promoción a producción solicitada para la tarea "${review.task?.title?.slice(0, 80) ?? "—"}"`,
    metadata: {
      productionReadinessReviewId: review.id,
      workSessionId: review.workSessionId ?? input.workSessionId ?? undefined,
      taskId: review.taskId ?? undefined,
      prNumber: review.task?.githubPrNumber ?? null,
      requestedBy: input.humanEmail,
    },
  });

  const preflight = await runProductionPromotionPreflight({
    reviewId: review.id,
    workSessionId: input.workSessionId ?? review.workSessionId,
  });

  const prSummary = (review.prSummary ?? {}) as Record<string, unknown>;
  const prNumber =
    typeof prSummary.prNumber === "number"
      ? prSummary.prNumber
      : review.task?.githubPrNumber ?? null;
  const prUrl =
    typeof prSummary.prUrl === "string"
      ? prSummary.prUrl
      : review.task?.githubPrUrl ?? null;
  const filesSummary = (review.filesSummary ?? {}) as Record<string, unknown>;
  const expectedEndpoint = expectedEndpointFromFiles(filesSummary.paths);

  const status = preflight.ok ? "ready_to_promote" : "preflight_failed";
  const error = preflight.ok ? null : preflight.blockingReasons.join(" | ");

  const promotion = await prisma.productionPromotion.create({
    data: {
      projectId: review.projectId,
      taskId: review.taskId,
      workSessionId: review.workSessionId ?? input.workSessionId,
      productionReadinessReviewId: review.id,
      previewDeploymentId: review.previewDeploymentId,
      status,
      strategy: "github_pr_merge",
      prNumber,
      prUrl,
      branchName: review.task?.githubBranchName ?? review.task?.githubPrHeadBranch ?? null,
      baseBranch: review.task?.githubPrBaseBranch ?? "main",
      mergeMethod: getProductionPromotionPolicy().mergeMethod,
      preflightSummary: jsonField({
        ok: preflight.ok,
        checks: preflight.checks,
        blockingReasons: preflight.blockingReasons,
        warnings: preflight.warnings,
      }),
      metadata: jsonField({
        expectedEndpoint,
        productionBaseUrl: getProductionPromotionPolicy().productionBaseUrl,
      }),
      error,
      requestedBy: input.humanEmail,
      requestedAt: new Date(),
    },
  });

  await logActivity({
    projectId: review.projectId,
    type: preflight.ok ? "promotion.preflight_passed" : "promotion.preflight_failed",
    message: preflight.ok
      ? "Preflight de promoción superado: listo para promover a producción."
      : "Preflight de promoción fallido: hay guardrails sin cumplir.",
    metadata: {
      productionPromotionId: promotion.id,
      productionReadinessReviewId: review.id,
      workSessionId: review.workSessionId ?? input.workSessionId ?? undefined,
      taskId: review.taskId ?? undefined,
      prNumber,
      status: preflight.status,
    },
  });

  await logActivity({
    projectId: review.projectId,
    type: preflight.ok ? "promotion.ready" : "promotion.preflight_failed",
    message: preflight.ok
      ? `Promoción a producción lista (${prNumber ? `PR #${prNumber}` : "sin PR"}).`
      : "La promoción a producción quedó bloqueada por el preflight.",
    metadata: {
      productionPromotionId: promotion.id,
      productionReadinessReviewId: review.id,
      workSessionId: review.workSessionId ?? input.workSessionId ?? undefined,
      taskId: review.taskId ?? undefined,
      prNumber,
      status: preflight.status,
    },
  });

  const summary = buildProductionPromotionSummary({
    preflightOk: preflight.ok,
    status,
    prNumber,
    prUrl,
    error: promotion.error,
  });
  await updateSummary(promotion.id, { status, summary, error });

  return {
    ...promotion,
    summary,
    error: promotion.error,
  };
}

/**
 * Executes a promotion. Requires the literal confirmation "PROMOTE".
 * Re-runs the preflight, merges, waits for deploy and verifies.
 * No automatic rollback.
 */
export async function executeProductionPromotion(input: {
  promotionId: string;
  humanEmail: string;
  confirm: string;
}): Promise<ProductionPromotionRecord> {
  if (input.confirm !== "PROMOTE") {
    throw new Error(
      'Se requiere la confirmación explícita "PROMOTE" para ejecutar la promoción a producción.'
    );
  }

  const promotion = await loadPromotion(input.promotionId);
  if (!promotion) {
    throw new Error("No existe la promoción indicada.");
  }
  const review = promotion.productionReadinessReview;
  const policy = getProductionPromotionPolicy();

  await logActivity({
    projectId: promotion.projectId,
    type: "promotion.execute_requested",
    message: `Ejecución de promoción a producción solicitada (${promotion.prNumber ? `PR #${promotion.prNumber}` : "sin PR"}) por ${input.humanEmail}.`,
    metadata: {
      productionPromotionId: promotion.id,
      productionReadinessReviewId: promotion.productionReadinessReviewId ?? undefined,
      workSessionId: promotion.workSessionId ?? undefined,
      taskId: promotion.taskId ?? undefined,
      prNumber: promotion.prNumber ?? undefined,
      requestedBy: input.humanEmail,
    },
  });

  // 1. Re-run preflight at execution time.
  if (!promotion.productionReadinessReviewId) {
    const error = "La promoción no tiene una revisión de readiness asociada.";
    const failedPromotion = await prisma.productionPromotion.update({
      where: { id: promotion.id },
      data: { status: "failed", error, failedAt: new Date() },
    });
    const summary = buildProductionPromotionSummary({
      preflightOk: false,
      status: "failed",
      prNumber: promotion.prNumber,
      prUrl: promotion.prUrl,
      error,
    });
    await updateSummary(failedPromotion.id, {
      status: "failed",
      summary,
      error,
    });
    await logActivity({
      projectId: promotion.projectId,
      type: "promotion.failed",
      message: error,
      metadata: {
        productionPromotionId: promotion.id,
        taskId: promotion.taskId ?? undefined,
        workSessionId: promotion.workSessionId ?? undefined,
        prNumber: promotion.prNumber ?? undefined,
        status: "failed",
      },
    });
    return { ...failedPromotion, summary, error };
  }

  const preflight = await runProductionPromotionPreflight({
    reviewId: promotion.productionReadinessReviewId,
    workSessionId: promotion.workSessionId,
  });

  if (!preflight.ok) {
    const error = preflight.blockingReasons.join(" | ");
    const failedPromotion = await prisma.productionPromotion.update({
      where: { id: promotion.id },
      data: {
        status: "preflight_failed",
        error,
        failedAt: new Date(),
      },
    });
    await logActivity({
      projectId: promotion.projectId,
      type: "promotion.preflight_failed",
      message: "El preflight de promoción falló al ejecutar: no se mergea nada.",
      metadata: {
        productionPromotionId: promotion.id,
        productionReadinessReviewId: promotion.productionReadinessReviewId ?? undefined,
        workSessionId: promotion.workSessionId ?? undefined,
        taskId: promotion.taskId ?? undefined,
        prNumber: promotion.prNumber ?? undefined,
        status: "preflight_failed",
      },
    });
    const summary = buildProductionPromotionSummary({
      preflightOk: false,
      status: "preflight_failed",
      prNumber: promotion.prNumber,
      prUrl: promotion.prUrl,
      error,
    });
    await updateSummary(failedPromotion.id, {
      status: "preflight_failed",
      summary,
      error,
      failedAt: failedPromotion.failedAt ?? undefined,
    });
    return { ...failedPromotion, summary, error };
  }

  // 2. Mark promoting + merge via GitHub API.
  await updateSummary(promotion.id, { status: "promoting", startedAt: new Date() });
  await logActivity({
    projectId: promotion.projectId,
    type: "promotion.merge_started",
    message: `Iniciando el merge del ${promotion.prNumber ? `PR #${promotion.prNumber}` : "PR"} a main (método ${policy.mergeMethod}).`,
    metadata: {
      productionPromotionId: promotion.id,
      productionReadinessReviewId: promotion.productionReadinessReviewId ?? undefined,
      workSessionId: promotion.workSessionId ?? undefined,
      taskId: promotion.taskId ?? undefined,
      prNumber: promotion.prNumber ?? undefined,
      mergeMethod: policy.mergeMethod,
    },
  });

  const repositoryFullName =
    review?.project?.repositoryFullName ?? promotion.project.repositoryFullName;

  if (!repositoryFullName || !promotion.prNumber) {
    const error = "No hay repositorio o PR para ejecutar el merge.";
    const failedPromotion = await prisma.productionPromotion.update({
      where: { id: promotion.id },
      data: { status: "failed", error, failedAt: new Date() },
    });
    const summary = buildProductionPromotionSummary({
      preflightOk: true,
      status: "failed",
      prNumber: promotion.prNumber,
      prUrl: promotion.prUrl,
      error,
    });
    await updateSummary(failedPromotion.id, { status: "failed", summary, error, failedAt: failedPromotion.failedAt ?? undefined });
    await logActivity({
      projectId: promotion.projectId,
      type: "promotion.failed",
      message: error,
      metadata: {
        productionPromotionId: promotion.id,
        productionReadinessReviewId: promotion.productionReadinessReviewId ?? undefined,
        workSessionId: promotion.workSessionId ?? undefined,
        taskId: promotion.taskId ?? undefined,
        prNumber: promotion.prNumber ?? undefined,
        status: "failed",
      },
    });
    return { ...failedPromotion, summary, error };
  }

  let mergeResult;
  try {
    mergeResult = await mergePullRequest({
      repositoryFullName,
      pullRequestNumber: promotion.prNumber,
      method: policy.mergeMethod,
      commitTitle: `Promote task ${promotion.taskId ?? "unknown"}: ${promotion.task?.githubPrTitle ?? promotion.task?.title ?? ""}`.slice(0, 200),
    });
  } catch (err) {
    const error =
      err instanceof Error ? err.message : "Error al mergear el pull request.";
    const failedPromotion = await prisma.productionPromotion.update({
      where: { id: promotion.id },
      data: { status: "failed", error, failedAt: new Date() },
    });
    const summary = buildProductionPromotionSummary({
      preflightOk: true,
      status: "failed",
      prNumber: promotion.prNumber,
      prUrl: promotion.prUrl,
      error,
    });
    await updateSummary(failedPromotion.id, { status: "failed", summary, error, failedAt: failedPromotion.failedAt ?? undefined });
    await logActivity({
      projectId: promotion.projectId,
      type: "promotion.failed",
      message: `El merge del PR #${promotion.prNumber} falló: ${error}`,
      metadata: {
        productionPromotionId: promotion.id,
        productionReadinessReviewId: promotion.productionReadinessReviewId ?? undefined,
        workSessionId: promotion.workSessionId ?? undefined,
        taskId: promotion.taskId ?? undefined,
        prNumber: promotion.prNumber ?? undefined,
        status: "failed",
      },
    });
    return { ...failedPromotion, summary, error };
  }

  const mergeCommitSha = mergeResult.sha || null;
  await prisma.productionPromotion.update({
    where: { id: promotion.id },
    data: {
      status: "merged",
      mergeCommitSha,
      prUrl: promotion.prUrl ?? (review?.task?.githubPrUrl ?? null),
    },
  });
  await logActivity({
    projectId: promotion.projectId,
    type: "promotion.merged",
    message: `PR #${promotion.prNumber} mergeado a main${mergeCommitSha ? ` (commit ${mergeCommitSha.slice(0, 12)})` : ""}.`,
    metadata: {
      productionPromotionId: promotion.id,
      productionReadinessReviewId: promotion.productionReadinessReviewId ?? undefined,
      workSessionId: promotion.workSessionId ?? undefined,
      taskId: promotion.taskId ?? undefined,
      prNumber: promotion.prNumber ?? undefined,
      mergeCommitSha: mergeCommitSha ?? undefined,
      status: "merged",
    },
  });

  // 3. Wait for the production deploy to pick the merge up.
  const metadata = (promotion.metadata ?? {}) as Record<string, unknown>;
  const expectedEndpoint =
    typeof metadata.expectedEndpoint === "string" &&
    metadata.expectedEndpoint.length > 0
      ? metadata.expectedEndpoint
      : null;

  await updateSummary(promotion.id, { status: "deploying" });
  await logActivity({
    projectId: promotion.projectId,
    type: "promotion.deploy_wait_started",
    message: "Esperando a que el despliegue de producción recoja el merge...",
    metadata: {
      productionPromotionId: promotion.id,
      productionReadinessReviewId: promotion.productionReadinessReviewId ?? undefined,
      workSessionId: promotion.workSessionId ?? undefined,
      taskId: promotion.taskId ?? undefined,
      prNumber: promotion.prNumber ?? undefined,
      status: "deploying",
    },
  });

  const { live, deploymentSummary } = await waitForProductionDeploy(
    expectedEndpoint
  );

  // 4. Verify.
  await updateSummary(promotion.id, { status: "verifying", deploymentSummary });
  await logActivity({
    projectId: promotion.projectId,
    type: "promotion.verification_started",
    message: "Verificando salud y endpoint del entorno de producción...",
    metadata: {
      productionPromotionId: promotion.id,
      productionReadinessReviewId: promotion.productionReadinessReviewId ?? undefined,
      workSessionId: promotion.workSessionId ?? undefined,
      taskId: promotion.taskId ?? undefined,
      prNumber: promotion.prNumber ?? undefined,
      status: "verifying",
    },
  });

  const verification = await verifyProductionPromotion({
    prNumber: promotion.prNumber,
    repositoryFullName,
    mergeCommitSha,
    expectedEndpoint,
  });

  const finalOk = live && verification.ok;
  const finalStatus = finalOk ? "completed" : "failed";
  const finalError = finalOk
    ? null
    : [
        !live ? deploymentSummary.message : null,
        verification.health && !verification.health.ok
          ? `Salud de producción no responde (${verification.health.url}).`
          : null,
        verification.expectedEndpoint && !verification.expectedEndpoint.ok
          ? `Endpoint esperado no responde (${verification.expectedEndpoint.url}).`
          : null,
        verification.prMerged === false
          ? "El PR no aparece como mergeado."
          : null,
      ]
        .filter(Boolean)
        .join(" | ") ||
      "La verificación posterior al merge no pudo confirmar el despliegue. No se revierte nada automáticamente.";

  const finalPromotion = await prisma.productionPromotion.update({
    where: { id: promotion.id },
    data: {
      status: finalStatus,
      mergeCommitSha: verification.mergeCommitSha ?? mergeCommitSha,
      verificationSummary: jsonField(verification),
      deploymentSummary: jsonField(deploymentSummary),
      error: finalError,
      completedAt: finalOk ? new Date() : null,
      failedAt: finalOk ? null : new Date(),
    },
  });

  const summary = buildProductionPromotionSummary({
    preflightOk: true,
    status: finalStatus,
    prNumber: promotion.prNumber,
    prUrl: promotion.prUrl,
    mergeCommitSha: finalPromotion.mergeCommitSha,
    completed: finalOk,
    failed: !finalOk,
    healthOk: verification.health?.ok,
    endpointOk: verification.expectedEndpoint
      ? verification.expectedEndpoint.ok
      : undefined,
    error: finalError,
  });
  await updateSummary(finalPromotion.id, { status: finalStatus, summary, error: finalError });

  await logActivity({
    projectId: promotion.projectId,
    type: finalOk ? "promotion.completed" : "promotion.failed",
    message: finalOk
      ? `Promoción a producción completada: ${promotion.prNumber ? `PR #${promotion.prNumber}` : "PR"} en main y verificación OK.`
      : `Promoción a producción fallida: ${promotion.prNumber ? `PR #${promotion.prNumber}` : "PR"} mergeado pero la verificación no pasó.`,
    metadata: {
      productionPromotionId: promotion.id,
      productionReadinessReviewId: promotion.productionReadinessReviewId ?? undefined,
      workSessionId: promotion.workSessionId ?? undefined,
      taskId: promotion.taskId ?? undefined,
      prNumber: promotion.prNumber ?? undefined,
      mergeCommitSha: finalPromotion.mergeCommitSha ?? undefined,
      healthStatus: verification.health?.ok ? "ok" : "error",
      status: finalStatus,
    },
  });

  return { ...finalPromotion, summary, error: finalError };
}

/**
 * Refreshes a promotion from the live PR state + production probes.
 * NEVER re-merges, NEVER auto-rolls back.
 */
export async function refreshProductionPromotion(
  promotionId: string
): Promise<ProductionPromotionRecord> {
  const promotion = await loadPromotion(promotionId);
  if (!promotion) {
    throw new Error("No existe la promoción indicada.");
  }

  // --- Fase 4.0: sync the linked JobRun (if any) ---
  let jobSnapshot: Record<string, unknown> | null = null;
  if (promotion.jobRunId) {
    const job = await prisma.jobRun.findUnique({
      where: { id: promotion.jobRunId },
    });
    if (job) {
      const isActive =
        job.status === "running" || job.status === "waiting";
      if (
        isActive &&
        job.lastHeartbeatAt &&
        Date.now() - job.lastHeartbeatAt.getTime() >
          getJobPolicy().heartbeatStaleMs
      ) {
        await markJobStale(job.id);
        await logActivity({
          projectId: promotion.projectId,
          type: "job.stale",
          message: `El job de promoción (${job.id}) no reportó actividad dentro de la ventana esperada y se marcó como stale; requiere recuperación manual.`,
          metadata: {
            jobRunId: job.id,
            type: job.type,
            resourceType: job.resourceType ?? undefined,
            resourceId: job.resourceId ?? undefined,
            stage: job.currentStage ?? undefined,
            status: "stale",
          },
        });
        job.status = "stale";
      }
      jobSnapshot = {
        jobRunId: job.id,
        status: job.status,
        currentStage: job.currentStage,
        progressPercent: job.progressPercent,
        summary: job.summary,
        error: job.error,
        updatedAt: job.updatedAt.toISOString(),
      };
    }
  }

  const repositoryFullName =
    promotion.productionReadinessReview?.project?.repositoryFullName ??
    promotion.project.repositoryFullName;

  const metadata = (promotion.metadata ?? {}) as Record<string, unknown>;
  const expectedEndpoint =
    typeof metadata.expectedEndpoint === "string" &&
    metadata.expectedEndpoint.length > 0
      ? metadata.expectedEndpoint
      : null;

  const verification = await verifyProductionPromotion({
    prNumber: promotion.prNumber,
    repositoryFullName,
    mergeCommitSha: promotion.mergeCommitSha,
    expectedEndpoint,
  });

  let status: ProductionPromotionStatus = promotion.status as ProductionPromotionStatus;
  if (verification.prMerged && verification.ok) {
    status = "completed";
  } else if (verification.prMerged) {
    status = "failed";
  }

  const mergedMetadata = jobSnapshot
    ? { ...metadata, job: jobSnapshot }
    : metadata;
  const updated = await prisma.productionPromotion.update({
    where: { id: promotion.id },
    data: {
      status,
      mergeCommitSha: verification.mergeCommitSha ?? promotion.mergeCommitSha,
      verificationSummary: jsonField(verification),
      metadata: jsonField(mergedMetadata),
      error: verification.ok ? null : promotion.error,
      completedAt: status === "completed" ? new Date() : promotion.completedAt,
      failedAt: status === "failed" ? new Date() : promotion.failedAt,
    },
  });

  const summary = buildProductionPromotionSummary({
    preflightOk: status !== "preflight_failed",
    status,
    prNumber: promotion.prNumber,
    prUrl: promotion.prUrl,
    mergeCommitSha: updated.mergeCommitSha,
    completed: status === "completed",
    failed: status === "failed",
    healthOk: verification.health?.ok,
    endpointOk: verification.expectedEndpoint
      ? verification.expectedEndpoint.ok
      : undefined,
    error: updated.error,
  });
  await updateSummary(updated.id, { status, summary });

  await logActivity({
    projectId: promotion.projectId,
    type: "promotion.refreshed",
    message: `Promoción a producción actualizada (estado: ${status}).`,
    metadata: {
      productionPromotionId: promotion.id,
      productionReadinessReviewId: promotion.productionReadinessReviewId ?? undefined,
      workSessionId: promotion.workSessionId ?? undefined,
      taskId: promotion.taskId ?? undefined,
      prNumber: promotion.prNumber ?? undefined,
      mergeCommitSha: updated.mergeCommitSha ?? undefined,
      healthStatus: verification.health?.ok ? "ok" : "error",
      status,
    },
  });

  // When refresh transitions the promotion to a terminal state, also record the
  // terminal event (covers the case where the execute request was interrupted
  // by a proxy timeout during the deploy wait).
  const wasTerminal =
    promotion.status === "completed" || promotion.status === "failed";
  if (status === "completed" && !wasTerminal) {
    await logActivity({
      projectId: promotion.projectId,
      type: "promotion.completed",
      message: `Promoción a producción completada: ${promotion.prNumber ? `PR #${promotion.prNumber}` : "PR"} en main y verificación OK.`,
      metadata: {
        productionPromotionId: promotion.id,
        productionReadinessReviewId: promotion.productionReadinessReviewId ?? undefined,
        workSessionId: promotion.workSessionId ?? undefined,
        taskId: promotion.taskId ?? undefined,
        prNumber: promotion.prNumber ?? undefined,
        mergeCommitSha: updated.mergeCommitSha ?? undefined,
        healthStatus: "ok",
        status: "completed",
      },
    });
  } else if (status === "failed" && !wasTerminal) {
    await logActivity({
      projectId: promotion.projectId,
      type: "promotion.failed",
      message: `La promoción a producción no pudo completarse: ${promotion.prNumber ? `PR #${promotion.prNumber}` : "PR"} mergeado pero la verificación no pasó.`,
      metadata: {
        productionPromotionId: promotion.id,
        productionReadinessReviewId: promotion.productionReadinessReviewId ?? undefined,
        workSessionId: promotion.workSessionId ?? undefined,
        taskId: promotion.taskId ?? undefined,
        prNumber: promotion.prNumber ?? undefined,
        mergeCommitSha: updated.mergeCommitSha ?? undefined,
        healthStatus: verification.health?.ok ? "ok" : "error",
        status: "failed",
      },
    });
  }

  return { ...updated, summary };
}
