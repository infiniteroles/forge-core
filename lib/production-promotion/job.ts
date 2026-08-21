/**
 * Production promotion — async job execution & recovery (Fase 4.0).
 *
 * Fase 3.9 executed the whole promotion (merge + deploy wait + verify)
 * synchronously inside the HTTP request, which could exceed the proxy timeout
 * and return a 502 even though the merge succeeded. Fase 4.0 moves that work
 * into a JobRun executed by the inline background runner:
 *
 *   POST /execute  ->  creates JobRun, marks promotion "promoting", returns fast
 *   JobRun         ->  preflight -> merge -> deploy_wait -> verify -> complete
 *   GET /jobs/[id] ->  live job progress (stage, percent, error)
 *   POST /jobs/[id]/recover -> resumes from the correct stage
 *
 * Central idempotency rule: once the PR is merged, recovery NEVER repeats the
 * merge — it resumes from deploy_wait / verify.
 */

import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { getPullRequest, mergePullRequest } from "@/lib/github/pull-requests";
import {
  loadPromotion,
  updateSummary,
  waitForProductionDeploy,
  verifyProductionPromotion,
  type ProductionPromotionRecord,
} from "./service";
import { getProductionPromotionPolicy } from "./policy";
import { runProductionPromotionPreflight } from "./preflight";
import { buildProductionPromotionSummary } from "./summary";
import {
  getProductionDeployConfig,
  isProductionDeployViaCoolify,
  resolveProductionApplication,
  triggerProductionDeployment,
} from "@/lib/coolify/production";
import { isCoolifyConfigured } from "@/lib/coolify/client";
import {
  createJobRun,
  startJobRun,
  updateJobStage,
  completeJobRun,
  failJobRun,
  markJobRecovered,
  getJobRun,
  touchJobHeartbeat,
  type JobRunRow,
} from "@/lib/jobs/service";
import { runJobInBackground } from "@/lib/jobs/runner";

const STAGE_PROGRESS: Record<string, number> = {
  preflight: 10,
  merge: 35,
  trigger_deploy: 50,
  deploy_wait: 70,
  verify: 90,
  complete: 100,
};

const STAGE_ORDER = [
  "preflight",
  "merge",
  "trigger_deploy",
  "deploy_wait",
  "verify",
  "complete",
];

function jobField(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object") return null;
  return v as Record<string, unknown>;
}

/** Logs a job.* event with safe metadata (no secrets). */
async function logJobEvent(
  job: Pick<JobRunRow, "id" | "type" | "projectId" | "resourceType" | "resourceId" | "status">,
  type: string,
  extra: {
    stage?: string | null;
    progressPercent?: number | null;
    status?: string;
    message?: string;
    error?: string;
  } = {}
): Promise<void> {
  await logActivity({
    projectId: job.projectId,
    type,
    message:
      extra.message ??
      `Job ${job.type} (${job.id}): ${type.replace("job.", "")}${extra.stage ? ` — etapa ${extra.stage}` : ""}.`,
    metadata: {
      jobRunId: job.id,
      type: job.type,
      resourceType: job.resourceType ?? undefined,
      resourceId: job.resourceId ?? undefined,
      stage: extra.stage ?? undefined,
      status: extra.status ?? job.status,
      progressPercent: extra.progressPercent ?? undefined,
      error: extra.error ?? undefined,
    },
  });
}

/**
 * Creates a JobRun for a promotion execution and returns immediately.
 *
 * The full pipeline (preflight -> merge -> deploy_wait -> verify -> complete)
 * runs in the background via `runJobInBackground`. This never blocks the HTTP
 * request on the deploy wait.
 */
export async function enqueueProductionPromotionExecution(input: {
  promotionId: string;
  humanEmail: string;
  confirm: string;
}): Promise<{
  ok: true;
  promotionId: string;
  jobRunId: string;
  status: "queued";
}> {
  if (input.confirm !== "PROMOTE") {
    throw new Error(
      'Se requiere la confirmación explícita "PROMOTE" para ejecutar la promoción a producción.'
    );
  }

  const promotion = await loadPromotion(input.promotionId);
  if (!promotion) {
    throw new Error("No existe la promoción indicada.");
  }

  if (promotion.status === "completed") {
    throw new Error("La promoción ya está completada; no se puede volver a ejecutar.");
  }

  // Quick preflight (gate only): readiness must still be approved. The full
  // preflight re-runs inside the job right before the merge.
  const review = promotion.productionReadinessReview;
  const readinessOk =
    review !== null &&
    review.status === "approved" &&
    review.recommendation === "ready_for_production";
  if (!readinessOk) {
    const error =
      "La revisión de readiness no está aprobada (se requiere approved + ready_for_production). No se ejecuta la promoción.";
    await updateSummary(promotion.id, {
      status: "preflight_failed",
      summary: buildProductionPromotionSummary({
        preflightOk: false,
        status: "preflight_failed",
        prNumber: promotion.prNumber,
        prUrl: promotion.prUrl,
        error,
      }),
      error,
    });
    await logActivity({
      projectId: promotion.projectId,
      type: "promotion.preflight_failed",
      message: "El preflight de promoción falló al ejecutar: readiness no aprobada. No se mergea nada.",
      metadata: {
        productionPromotionId: promotion.id,
        productionReadinessReviewId: promotion.productionReadinessReviewId ?? undefined,
        workSessionId: promotion.workSessionId ?? undefined,
        taskId: promotion.taskId ?? undefined,
        prNumber: promotion.prNumber ?? undefined,
        status: "preflight_failed",
      },
    });
    throw new Error(error);
  }

  if (!promotion.prNumber) {
    throw new Error("La promoción no tiene un PR asociado; no se puede ejecutar el merge.");
  }

  await logActivity({
    projectId: promotion.projectId,
    type: "promotion.execute_requested",
    message: `Ejecución de promoción a producción solicitada (PR #${promotion.prNumber}) por ${input.humanEmail}.`,
    metadata: {
      productionPromotionId: promotion.id,
      productionReadinessReviewId: promotion.productionReadinessReviewId ?? undefined,
      workSessionId: promotion.workSessionId ?? undefined,
      taskId: promotion.taskId ?? undefined,
      prNumber: promotion.prNumber ?? undefined,
      requestedBy: input.humanEmail,
    },
  });

  // Create the JobRun and link it to the promotion.
  const job = await createJobRun({
    type: "production_promotion",
    resourceType: "production_promotion",
    resourceId: promotion.id,
    projectId: promotion.projectId,
    taskId: promotion.taskId,
    workSessionId: promotion.workSessionId,
    input: {
      promotionId: promotion.id,
      requestedBy: input.humanEmail,
    },
    metadata: {
      prNumber: promotion.prNumber,
      strategy: "github_pr_merge",
    },
  });

  await logJobEvent(job, "job.created", {
    stage: "preflight",
    progressPercent: 0,
    status: "queued",
    message: `Job de promoción creado (PR #${promotion.prNumber}) y encolado.`,
  });

  await prisma.productionPromotion.update({
    where: { id: promotion.id },
    data: {
      jobRunId: job.id,
      status: "promoting",
      startedAt: new Date(),
    },
  });

  // Kick off the background pipeline. The request returns right away.
  runJobInBackground(job, ({ jobRunId }) =>
    runProductionPromotionJob(jobRunId)
  );

  return {
    ok: true,
    promotionId: promotion.id,
    jobRunId: job.id,
    status: "queued",
  };
}

/**
 * The promotion job pipeline. Runs stages sequentially, updating JobRun +
 * ProductionPromotion + ActivityLog at each step. Resumable: `fromStage`
 * skips earlier stages (used by recovery after a merge already happened).
 */
export async function runProductionPromotionJob(
  jobRunId: string,
  opts?: { fromStage?: string }
): Promise<void> {
  const job = await getJobRun(jobRunId);
  if (!job) throw new Error("No existe el job de promoción.");
  if (job.type !== "production_promotion") {
    throw new Error(`El job ${jobRunId} no es de tipo production_promotion.`);
  }
  if (job.status === "completed") return;

  await startJobRun(jobRunId, { lockedBy: "production_promotion" });
  await logJobEvent(job, "job.started", {
    stage: "preflight",
    progressPercent: 0,
    status: "running",
    message: "Job de promoción iniciado.",
  });

  const promotion = await loadPromotion(job.resourceId ?? "");
  if (!promotion) throw new Error("No existe la promoción asociada al job.");

  const policy = getProductionPromotionPolicy();
  const repositoryFullName =
    promotion.productionReadinessReview?.project?.repositoryFullName ??
    promotion.project.repositoryFullName;
  const meta = jobField(promotion.metadata);
  const expectedEndpoint =
    typeof meta?.expectedEndpoint === "string" && meta.expectedEndpoint.length > 0
      ? meta.expectedEndpoint
      : null;

  const fromStage = opts?.fromStage ?? "preflight";
  const startIdx = STAGE_ORDER.indexOf(fromStage);
  const begin = startIdx === -1 ? 0 : startIdx;

  for (let i = begin; i < STAGE_ORDER.length; i++) {
    const stage = STAGE_ORDER[i];
    const progress = STAGE_PROGRESS[stage];
    await updateJobStage(jobRunId, stage, { progressPercent: progress });
    await logJobEvent(job, "job.stage_started", { stage, progressPercent: progress });
    await touchJobHeartbeat(jobRunId);

    try {
      if (stage === "preflight") {
        await runPreflightStage(promotion, job);
      } else if (stage === "merge") {
        await runMergeStage(promotion, job, repositoryFullName, policy.mergeMethod);
      } else if (stage === "trigger_deploy") {
        await runTriggerDeployStage(promotion, job);
      } else if (stage === "deploy_wait") {
        await runDeployWaitStage(promotion, job, expectedEndpoint);
      } else if (stage === "verify") {
        await runVerifyStage(promotion, job, repositoryFullName, expectedEndpoint);
      } else if (stage === "complete") {
        await runCompleteStage(promotion, job);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error en la etapa del job";
      await failJobRun(jobRunId, message, { stage });
      await logJobEvent(job, "job.failed", {
        stage,
        status: "failed",
        error: message,
        message: `Job de promoción fallido en la etapa ${stage}: ${message}`,
      });
      // The failing stage already set the promotion to a failed/preflight_failed
      // state when applicable. Do not rethrow: the runner is a safety net only.
      return;
    }

    await logJobEvent(job, "job.stage_completed", { stage, progressPercent: progress });
  }
}

async function runPreflightStage(
  promotion: NonNullable<Awaited<ReturnType<typeof loadPromotion>>>,
  job: JobRunRow
): Promise<void> {
  if (!promotion.productionReadinessReviewId) {
    const error = "La promoción no tiene una revisión de readiness asociada.";
    await markPromotionFailed(promotion, "failed", error);
    throw new Error(error);
  }
  const preflight = await runProductionPromotionPreflight({
    reviewId: promotion.productionReadinessReviewId,
    workSessionId: promotion.workSessionId,
  });
  if (!preflight.ok) {
    const error = preflight.blockingReasons.join(" | ");
    await prisma.productionPromotion.update({
      where: { id: promotion.id },
      data: { status: "preflight_failed", error, failedAt: new Date() },
    });
    const summary = buildProductionPromotionSummary({
      preflightOk: false,
      status: "preflight_failed",
      prNumber: promotion.prNumber,
      prUrl: promotion.prUrl,
      error,
    });
    await updateSummary(promotion.id, { status: "preflight_failed", summary, error });
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
    throw new Error(error);
  }
  await updateSummary(promotion.id, { status: "promoting", startedAt: new Date() });
}

async function runMergeStage(
  promotion: NonNullable<Awaited<ReturnType<typeof loadPromotion>>>,
  job: JobRunRow,
  repositoryFullName: string | null,
  mergeMethod: string
): Promise<void> {
  await updateSummary(promotion.id, { status: "promoting", startedAt: new Date() });

  // Idempotency: if the PR is already merged, do NOT merge again.
  let alreadyMerged = false;
  let liveSha: string | null = null;
  if (repositoryFullName && promotion.prNumber) {
    try {
      const pr = await getPullRequest({
        repositoryFullName,
        prNumber: promotion.prNumber,
      });
      alreadyMerged = Boolean(pr.merged_at);
      liveSha = pr.mergeCommitSha ?? null;
    } catch {
      alreadyMerged = false;
    }
  }

  if (alreadyMerged) {
    const sha = liveSha ?? promotion.mergeCommitSha ?? null;
    await updateSummary(promotion.id, { status: "merged", mergeCommitSha: sha });
    await logActivity({
      projectId: promotion.projectId,
      type: "promotion.merged",
      message: `PR #${promotion.prNumber} ya estaba mergeado a main${sha ? ` (commit ${sha.slice(0, 12)})` : ""}; no se repite el merge.`,
      metadata: {
        productionPromotionId: promotion.id,
        productionReadinessReviewId: promotion.productionReadinessReviewId ?? undefined,
        workSessionId: promotion.workSessionId ?? undefined,
        taskId: promotion.taskId ?? undefined,
        prNumber: promotion.prNumber ?? undefined,
        mergeCommitSha: sha ?? undefined,
        status: "merged",
      },
    });
    return;
  }

  if (!repositoryFullName || !promotion.prNumber) {
    const error = "No hay repositorio o PR para ejecutar el merge.";
    await markPromotionFailed(promotion, "failed", error);
    throw new Error(error);
  }

  await logActivity({
    projectId: promotion.projectId,
    type: "promotion.merge_started",
    message: `Iniciando el merge del PR #${promotion.prNumber} a main (método ${mergeMethod}).`,
    metadata: {
      productionPromotionId: promotion.id,
      productionReadinessReviewId: promotion.productionReadinessReviewId ?? undefined,
      workSessionId: promotion.workSessionId ?? undefined,
      taskId: promotion.taskId ?? undefined,
      prNumber: promotion.prNumber ?? undefined,
      mergeMethod,
    },
  });

  let mergeResult;
  try {
    mergeResult = await mergePullRequest({
      repositoryFullName,
      pullRequestNumber: promotion.prNumber,
      method: mergeMethod as "squash" | "merge" | "rebase",
      commitTitle: `Promote task ${promotion.taskId ?? "unknown"}: ${promotion.task?.githubPrTitle ?? promotion.task?.title ?? ""}`.slice(0, 200),
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error al mergear el pull request.";
    await markPromotionFailed(promotion, "failed", error);
    throw new Error(error);
  }

  const mergeCommitSha = mergeResult.sha || null;
  await updateSummary(promotion.id, { status: "merged", mergeCommitSha });
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
}

async function runTriggerDeployStage(
  promotion: NonNullable<Awaited<ReturnType<typeof loadPromotion>>>,
  job: JobRunRow
): Promise<void> {
  const policy = getProductionPromotionPolicy();
  const mode = policy.deployMode;

  // manual_wait: no Coolify call; deploy_wait will poll the endpoints.
  if (mode !== "coolify_api" || !isCoolifyConfigured()) {
    await updateSummary(promotion.id, {
      status: "deploying",
      deploymentSummary: { mode: "manual_wait", triggered: false },
    });
    return;
  }

  // coolify_api: resolve the app + trigger the deploy.
  await logActivity({
    projectId: promotion.projectId,
    type: "promotion.deploy_trigger_started",
    message: "Iniciando el disparo del despliegue de producción vía Coolify API...",
    metadata: {
      productionPromotionId: promotion.id,
      jobRunId: job.id,
      productionReadinessReviewId: promotion.productionReadinessReviewId ?? undefined,
      workSessionId: promotion.workSessionId ?? undefined,
      taskId: promotion.taskId ?? undefined,
      prNumber: promotion.prNumber ?? undefined,
      mode: "coolify_api",
      status: "deploying",
    },
  });

  let resolved;
  try {
    resolved = await resolveProductionApplication();
  } catch (err) {
    const error =
      err instanceof Error ? err.message : "No se pudo resolver la app principal de producción.";
    await logActivity({
      projectId: promotion.projectId,
      type: "promotion.deploy_trigger_failed",
      message: `No se pudo resolver la app de producción: ${error}`,
      metadata: {
        productionPromotionId: promotion.id,
        jobRunId: job.id,
        productionReadinessReviewId: promotion.productionReadinessReviewId ?? undefined,
        workSessionId: promotion.workSessionId ?? undefined,
        taskId: promotion.taskId ?? undefined,
        prNumber: promotion.prNumber ?? undefined,
        mode: "coolify_api",
        status: "failed",
      },
    });
    await markPromotionFailed(promotion, "failed", error);
    throw new Error(error);
  }

  await updateSummary(promotion.id, {
    status: "deploying",
    deploymentSummary: {
      mode: "coolify_api",
      applicationUuid: resolved.applicationUuid,
      resolvedBy: resolved.method,
      triggered: false,
    },
  });

  let trigger;
  try {
    trigger = await triggerProductionDeployment();
  } catch (err) {
    const error =
      err instanceof Error
        ? err.message
        : "El disparo del despliegue de producción vía Coolify falló.";
    await logActivity({
      projectId: promotion.projectId,
      type: "promotion.deploy_trigger_failed",
      message: `El disparo del deploy vía Coolify falló: ${error}`,
      metadata: {
        productionPromotionId: promotion.id,
        jobRunId: job.id,
        productionReadinessReviewId: promotion.productionReadinessReviewId ?? undefined,
        workSessionId: promotion.workSessionId ?? undefined,
        taskId: promotion.taskId ?? undefined,
        prNumber: promotion.prNumber ?? undefined,
        applicationUuid: resolved.applicationUuid,
        mode: "coolify_api",
        status: "failed",
      },
    });
    await markPromotionFailed(promotion, "failed", error);
    throw new Error(error);
  }

  await updateSummary(promotion.id, {
    status: "deploying",
    deploymentSummary: {
      mode: "coolify_api",
      applicationUuid: trigger.applicationUuid,
      triggered: true,
      deploymentUuid: trigger.deploymentUuid ?? undefined,
      status: trigger.status ?? undefined,
      triggeredAt: trigger.triggeredAt,
    },
  });

  await logActivity({
    projectId: promotion.projectId,
    type: "promotion.deploy_triggered",
    message: `Despliegue de producción lanzado vía Coolify API${trigger.deploymentUuid ? ` (deployment ${trigger.deploymentUuid.slice(0, 8)})` : ""}.`,
    metadata: {
      productionPromotionId: promotion.id,
      jobRunId: job.id,
      productionReadinessReviewId: promotion.productionReadinessReviewId ?? undefined,
      workSessionId: promotion.workSessionId ?? undefined,
      taskId: promotion.taskId ?? undefined,
      prNumber: promotion.prNumber ?? undefined,
      applicationUuid: trigger.applicationUuid,
      deploymentUuid: trigger.deploymentUuid ?? undefined,
      mode: "coolify_api",
      status: "deploying",
    },
  });
}

async function runDeployWaitStage(
  promotion: NonNullable<Awaited<ReturnType<typeof loadPromotion>>>,
  job: JobRunRow,
  expectedEndpoint: string | null
): Promise<void> {
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

  const { live, deploymentSummary } = await waitForProductionDeploy(expectedEndpoint);
  // Persist the deploy outcome (including `live` and the mode) so recovery can
  // resume and the complete stage can decide without re-running the wait.
  // NOTE: re-load the promotion so `deploymentSummary` reflects what the
  // trigger_deploy stage persisted (the in-memory `promotion` object is stale).
  const fresh = await loadPromotion(promotion.id);
  const prevDeployment = fresh ? jobField(fresh.deploymentSummary) ?? {} : {};
  await updateSummary(promotion.id, {
    status: "verifying",
    deploymentSummary: {
      ...deploymentSummary,
      live,
      mode: prevDeployment.mode ?? "manual_wait",
      triggered: prevDeployment.triggered === true,
      deploymentUuid:
        typeof prevDeployment.deploymentUuid === "string"
          ? prevDeployment.deploymentUuid
          : undefined,
    },
  });
}

async function runVerifyStage(
  promotion: NonNullable<Awaited<ReturnType<typeof loadPromotion>>>,
  job: JobRunRow,
  repositoryFullName: string | null,
  expectedEndpoint: string | null
): Promise<void> {
  await updateSummary(promotion.id, { status: "verifying" });
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
    mergeCommitSha: promotion.mergeCommitSha,
    expectedEndpoint,
  });

  // Persist verificationSummary via the shared jsonField-aware helper.
  await updateSummary(promotion.id, { verificationSummary: verification });
}

async function runCompleteStage(
  promotion: NonNullable<Awaited<ReturnType<typeof loadPromotion>>>,
  job: JobRunRow
): Promise<void> {
  // Re-load the promotion so the decision uses the persisted deploy/verify
  // outcomes (the in-memory `promotion` object is stale: later stages only
  // write to the DB). Without this, a recovery run would wrongly fail even
  // when the deploy is live and the verification passed.
  const fresh = await loadPromotion(promotion.id);
  const deploymentSummary = fresh ? jobField(fresh.deploymentSummary) ?? {} : {};
  const verification = fresh ? jobField(fresh.verificationSummary) ?? {} : {};
  const live = deploymentSummary.live === true;
  const verifyOk = verification.ok === true;

  const finalOk = live && verifyOk;
  if (finalOk) {
    await prisma.productionPromotion.update({
      where: { id: promotion.id },
      data: {
        status: "completed",
        error: null,
        completedAt: new Date(),
        failedAt: null,
      },
    });
    const summary = buildProductionPromotionSummary({
      preflightOk: true,
      status: "completed",
      prNumber: promotion.prNumber,
      prUrl: promotion.prUrl,
      mergeCommitSha: promotion.mergeCommitSha,
      completed: true,
      healthOk: jobField(verification.health)?.ok === true,
      endpointOk: verification.expectedEndpoint
        ? jobField(verification.expectedEndpoint)?.ok === true
        : undefined,
      deployMode:
        typeof deploymentSummary.mode === "string"
          ? deploymentSummary.mode
          : undefined,
      deployTriggered: deploymentSummary.triggered === true,
    });
    await updateSummary(promotion.id, { status: "completed", summary });
    await completeJobRun(job.id, {
      verification,
      deploymentSummary,
      mergeCommitSha: promotion.mergeCommitSha,
    });
    await logActivity({
      projectId: promotion.projectId,
      type: "promotion.completed",
      message: `Promoción a producción completada: PR #${promotion.prNumber} en main y verificación OK.`,
      metadata: {
        productionPromotionId: promotion.id,
        productionReadinessReviewId: promotion.productionReadinessReviewId ?? undefined,
        workSessionId: promotion.workSessionId ?? undefined,
        taskId: promotion.taskId ?? undefined,
        prNumber: promotion.prNumber ?? undefined,
        mergeCommitSha: promotion.mergeCommitSha ?? undefined,
        healthStatus: "ok",
        status: "completed",
      },
    });
    await logJobEvent(job, "job.completed", {
      stage: "complete",
      progressPercent: 100,
      status: "completed",
      message: "Job de promoción completado: promoción a producción finalizada.",
    });
    return;
  }

  // Failed (endpoint didn't appear, health down, etc.). No automatic rollback.
  const reasons: string[] = [];
  const health = jobField(verification.health);
  if (health && health.ok !== true) {
    reasons.push(`Salud de producción no responde (${String(health.url ?? "?")}).`);
  }
  const endpoint = jobField(verification.expectedEndpoint);
  if (endpoint && endpoint.ok !== true) {
    reasons.push(`Endpoint esperado no responde (${String(endpoint.url ?? "?")}).`);
  }
  if (!live) {
    reasons.push("El despliegue de producción no respondió dentro de la ventana de espera.");
  }
  const finalError =
    reasons.join(" | ") ||
    "La verificación posterior al merge no pudo confirmar el despliegue. No se revierte nada automáticamente.";

  await markPromotionFailed(promotion, "failed", finalError);
  await failJobRun(job.id, finalError, { stage: "complete" });
  await logJobEvent(job, "job.failed", {
    stage: "complete",
    status: "failed",
    error: finalError,
    message: `Job de promoción fallido en la verificación: ${finalError}`,
  });
}

async function markPromotionFailed(
  promotion: NonNullable<Awaited<ReturnType<typeof loadPromotion>>>,
  status: "failed",
  error: string
): Promise<void> {
  await prisma.productionPromotion.update({
    where: { id: promotion.id },
    data: { status, error, failedAt: new Date() },
  });
  const summary = buildProductionPromotionSummary({
    preflightOk: true,
    status,
    prNumber: promotion.prNumber,
    prUrl: promotion.prUrl,
    mergeCommitSha: promotion.mergeCommitSha,
    failed: true,
    error,
  });
  await updateSummary(promotion.id, { status, summary, error });
  await logActivity({
    projectId: promotion.projectId,
    type: "promotion.failed",
    message: `La promoción a producción no pudo completarse: ${error}`,
    metadata: {
      productionPromotionId: promotion.id,
      productionReadinessReviewId: promotion.productionReadinessReviewId ?? undefined,
      workSessionId: promotion.workSessionId ?? undefined,
      taskId: promotion.taskId ?? undefined,
      prNumber: promotion.prNumber ?? undefined,
      mergeCommitSha: promotion.mergeCommitSha ?? undefined,
      status: "failed",
    },
  });
}

/**
 * Recovers a promotion job by checking the real PR state:
 *  - PR already merged  -> resume from deploy_wait (NEVER re-merge)
 *  - PR not merged      -> resume from preflight (guardrails re-checked)
 * Returns immediately; the resumed job runs in the background.
 */
export async function recoverProductionPromotionJob(
  jobRunId: string,
  opts?: { humanEmail?: string }
): Promise<{ recovered: boolean; jobRunId: string; message: string }> {
  const job = await getJobRun(jobRunId);
  if (!job) throw new Error("No existe el job de promoción.");
  if (job.type !== "production_promotion") {
    throw new Error(`El job ${jobRunId} no es de tipo production_promotion.`);
  }

  const promotion = await loadPromotion(job.resourceId ?? "");
  if (!promotion) throw new Error("No existe la promoción asociada al job.");

  const repositoryFullName =
    promotion.productionReadinessReview?.project?.repositoryFullName ??
    promotion.project.repositoryFullName;

  let prMerged = false;
  if (repositoryFullName && promotion.prNumber) {
    try {
      const pr = await getPullRequest({
        repositoryFullName,
        prNumber: promotion.prNumber,
      });
      prMerged = Boolean(pr.merged_at);
      if (pr.mergeCommitSha && !promotion.mergeCommitSha) {
        await updateSummary(promotion.id, { mergeCommitSha: pr.mergeCommitSha });
      }
    } catch {
      prMerged = false;
    }
  }

  await markJobRecovered(jobRunId);

  // Already completed → nothing to recover (never re-merge, never re-trigger).
  if (promotion.status === "completed") {
    await logActivity({
      projectId: promotion.projectId,
      type: "job.recovered",
      message: `Recuperación del job de promoción (${jobRunId}): la promoción ya está completada; no se requiere ninguna acción.`,
      metadata: {
        jobRunId: job.id,
        type: job.type,
        resourceType: job.resourceType ?? undefined,
        resourceId: job.resourceId ?? undefined,
        stage: "complete",
        status: "recovered",
        requestedBy: opts?.humanEmail ?? undefined,
      },
    });
    return {
      recovered: false,
      jobRunId,
      message: "La promoción ya está completada. No se requiere recuperación.",
    };
  }

  if (prMerged) {
    // Decide where to resume. If the deploy was not triggered yet in
    // coolify_api mode, resume from trigger_deploy; otherwise from
    // deploy_wait. NEVER repeat the merge.
    const prevDeployment = jobField(promotion.deploymentSummary) ?? {};
    const deployTriggered = prevDeployment.triggered === true;
    const resumeStage =
      prevDeployment.mode === "coolify_api" && !deployTriggered
        ? "trigger_deploy"
        : "deploy_wait";

    await logActivity({
      projectId: promotion.projectId,
      type: "job.recovered",
      message: `Recuperación del job de promoción (${jobRunId}): la PR #${promotion.prNumber} ya está mergeada; se reanuda desde ${resumeStage} sin repetir el merge.`,
      metadata: {
        jobRunId: job.id,
        type: job.type,
        resourceType: job.resourceType ?? undefined,
        resourceId: job.resourceId ?? undefined,
        stage: resumeStage,
        status: "recovered",
        requestedBy: opts?.humanEmail ?? undefined,
      },
    });
    runJobInBackground(job, ({ jobRunId: jid }) =>
      runProductionPromotionJob(jid, { fromStage: resumeStage })
    );
    await logActivity({
      projectId: promotion.projectId,
      type: "job.recovery_completed",
      message: `Job de promoción (${jobRunId}) reanudado desde ${resumeStage} (PR ya mergeada).`,
      metadata: {
        jobRunId: job.id,
        type: job.type,
        resourceType: job.resourceType ?? undefined,
        resourceId: job.resourceId ?? undefined,
        stage: resumeStage,
        status: "running",
      },
    });
    return {
      recovered: true,
      jobRunId,
      message:
        resumeStage === "trigger_deploy"
          ? "La PR ya está mergeada y el deploy no se había lanzado. El job se ha reanudado para disparar el deploy (no se repite el merge)."
          : "La PR ya está mergeada. El job se ha reanudado desde la espera de despliegue (no se repite el merge).",
    };
  }

  await logActivity({
    projectId: promotion.projectId,
    type: "job.recovered",
    message: `Recuperación del job de promoción (${jobRunId}): la PR #${promotion.prNumber} sigue abierta sin mergear; se reanuda desde preflight.`,
    metadata: {
      jobRunId: job.id,
      type: job.type,
      resourceType: job.resourceType ?? undefined,
      resourceId: job.resourceId ?? undefined,
      stage: "preflight",
      status: "recovered",
      requestedBy: opts?.humanEmail ?? undefined,
    },
  });
  runJobInBackground(job, ({ jobRunId: jid }) =>
    runProductionPromotionJob(jid, { fromStage: "preflight" })
  );
  await logActivity({
    projectId: promotion.projectId,
    type: "job.recovery_completed",
    message: `Job de promoción (${jobRunId}) reanudado desde preflight.`,
    metadata: {
      jobRunId: job.id,
      type: job.type,
      resourceType: job.resourceType ?? undefined,
      resourceId: job.resourceId ?? undefined,
      stage: "preflight",
      status: "running",
    },
  });
  return {
    recovered: true,
    jobRunId,
    message:
      "La PR no está mergeada. El job se ha reanudado desde preflight (los guardrails se re-evalúan antes del merge).",
  };
}

export type { ProductionPromotionRecord };
