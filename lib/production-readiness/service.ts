/**
 * Production Readiness service (Fase 3.8).
 *
 * Loads a work session + task + PR + preview + checks + changed files from the
 * DB, builds the evaluation input, runs the evaluator and persists the review.
 * NEVER merges, NEVER deploys, NEVER touches main.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { assessPrPaths } from "@/lib/github/safe-file-policy";
import { getPrFiles } from "@/lib/github/pr-context";
import { evaluateProductionReadiness, type ProductionEvaluationInput } from "./evaluator";
import { buildProductionReadinessSummary } from "./summary";
import {
  findCurrentSessionPreview,
  resolveReadyPreviewForTask,
  type ResolvedPreview,
} from "./preview-resolver";
import type { ProductionEvaluationResult, ProductionRecommendation } from "./types";

/** Maps a possibly-null value to a Prisma Json input (SQL NULL when absent). */
function jsonField(v: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (v === null || v === undefined) return Prisma.DbNull;
  return v as Prisma.InputJsonValue;
}

export interface ProductionReviewRecord {
  id: string;
  status: string;
  recommendation: string | null;
  riskLevel: string | null;
  summary: string | null;
  blockingReasons: unknown;
  checksSummary: unknown;
  previewSummary: unknown;
  prSummary: unknown;
  filesSummary: unknown;
  humanNotes: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Loads the session with everything the evaluator needs.
 */
async function loadSessionContext(sessionId: string) {
  const session = await prisma.workSession.findUnique({
    where: { id: sessionId },
    include: {
      task: true,
      project: true,
      sessionChecks: { orderBy: { createdAt: "asc" } },
      previewDeployments: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!session) return null;
  return session;
}

function previewToSummary(preview: ResolvedPreview | null) {
  if (!preview) return null;
  return {
    status: preview.status,
    previewUrl: preview.previewUrl,
    domain: preview.domain,
    branchName: preview.branchName,
    commitSha: null,
    lastDeploymentStatus: preview.lastDeploymentStatus,
    error: preview.error,
    envConfigured: preview.envConfigured,
    source: preview.source,
    sourceWorkSessionId: preview.sourceWorkSessionId,
  };
}

async function buildEvaluationInput(ctx: NonNullable<Awaited<ReturnType<typeof loadSessionContext>>>): Promise<ProductionEvaluationInput> {
  const task = ctx.task;
  const result =
    typeof ctx.result === "object" && ctx.result !== null
      ? (ctx.result as Record<string, unknown>)
      : {};

  // ── checks aggregate ──────────────────────────────────────────────────────
  const checksRecord = (result.checks ?? null) as
    | { status?: string; summary?: string | null; count?: number }
    | null;
  const checks = checksRecord
    ? {
        status: checksRecord.status ?? "skipped",
        summary: checksRecord.summary ?? null,
        count: checksRecord.count ?? ctx.sessionChecks.length,
        details: ctx.sessionChecks.map((c) => ({ name: c.name, status: c.status })),
      }
    : ctx.sessionChecks.length > 0
      ? {
          status: "skipped",
          summary: "Sin agregado de checks (runner no configurado).",
          count: ctx.sessionChecks.length,
          details: ctx.sessionChecks.map((c) => ({ name: c.name, status: c.status })),
        }
      : null;

  // ── changed files / safe-file policy / tests ─────────────────────────────
  const sessionFiles = Array.isArray(result.filesChanged)
    ? result.filesChanged.filter((f): f is string => typeof f === "string")
    : [];

  // Merge with the actual PR changed files so the readiness reflects the real
  // PR state (e.g. a test added directly to the branch without a work session).
  let prFilePaths: string[] = [];
  if (ctx.task?.githubPrNumber && ctx.project?.repositoryFullName) {
    try {
      const prFiles = await getPrFiles({
        repositoryFullName: ctx.project.repositoryFullName,
        prNumber: ctx.task.githubPrNumber,
      });
      prFilePaths = prFiles
        .map((f) => f.filename)
        .filter((f): f is string => Boolean(f));
    } catch {
      prFilePaths = [];
    }
  }

  const filesChanged = Array.from(new Set([...sessionFiles, ...prFilePaths]));
  const filesAssessment = assessPrPaths(filesChanged);
  const files = {
    total: filesChanged.length,
    paths: filesChanged,
    blockedPaths: filesAssessment.blockedPaths,
    sensitivePaths: filesAssessment.sensitivePaths,
    infraPaths: filesAssessment.infraPaths,
    workflowPaths: filesAssessment.workflowPaths,
    touchesBlockedPaths: filesAssessment.touchesBlockedPaths,
    touchesSecrets: filesAssessment.touchesSecrets,
    touchesInfra: filesAssessment.touchesInfra,
    touchesWorkflow: filesAssessment.touchesWorkflow,
  };

  const testsPresent = filesChanged.some(
    (p) =>
      /(^|\/)(__tests__|test|tests)(\/|$)/.test(p) ||
      /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(p)
  );

  // ── preview (with inheritance) ────────────────────────────────────────────
  const resolved = await resolveReadyPreviewForTask({
    projectId: ctx.projectId,
    taskId: ctx.taskId,
    workSessionId: ctx.id,
    branchName: task?.githubBranchName ?? null,
    pullRequestNumber: task?.githubPrNumber ?? null,
    repositoryFullName: ctx.project?.repositoryFullName ?? null,
  });
  const current = await findCurrentSessionPreview(ctx.id);
  // Prefer the ready resolved preview; otherwise report the session's own
  // preview (found but not ready) so diagnostics can explain it.
  const preview = previewToSummary(resolved ?? current);

  // ── PR summary ────────────────────────────────────────────────────────────
  const prSummary = {
    prNumber: task?.githubPrNumber ?? null,
    prUrl: task?.githubPrUrl ?? null,
    state: task?.githubPrState ?? null,
    draft: task?.githubPrDraft ?? null,
    baseBranch: task?.githubPrBaseBranch ?? null,
    headBranch: task?.githubPrHeadBranch ?? null,
    mergedAt: task?.githubPrMergedAt ? task.githubPrMergedAt.toISOString() : null,
    builderCommitSha: task?.githubBuilderCommitSha ?? null,
    reviewStatus: task?.githubPrReviewStatus ?? null,
    reviewRecommendation: task?.githubPrReviewRecommendation ?? null,
    reviewRiskLevel: task?.githubPrReviewRiskLevel ?? null,
    reviewReadyForReview: task?.githubPrReviewReadyForReview ?? null,
    reviewSummary: task?.githubPrReviewSummary ?? null,
    reviewCheckedAt: task?.githubPrReviewLastCheckedAt
      ? task.githubPrReviewLastCheckedAt.toISOString()
      : null,
    markedReadyAt: task?.githubPrMarkedReadyAt
      ? task.githubPrMarkedReadyAt.toISOString()
      : null,
  };

  return {
    prNumber: task?.githubPrNumber ?? null,
    prUrl: task?.githubPrUrl ?? null,
    prState: task?.githubPrState ?? null,
    prDraft: task?.githubPrDraft ?? null,
    prBaseBranch: task?.githubPrBaseBranch ?? null,
    prHeadBranch: task?.githubPrHeadBranch ?? null,
    prMergedAt: task?.githubPrMergedAt ?? null,
    prReviewStatus: task?.githubPrReviewStatus ?? null,
    prReviewRecommendation: task?.githubPrReviewRecommendation ?? null,
    prReviewRiskLevel: task?.githubPrReviewRiskLevel ?? null,
    prReviewReadyForReview: task?.githubPrReviewReadyForReview ?? null,
    prReviewSummary: task?.githubPrReviewSummary ?? null,
    prReviewLastCheckedAt: task?.githubPrReviewLastCheckedAt ?? null,
    prMarkedReadyAt: task?.githubPrMarkedReadyAt ?? null,
    builderCommitSha: task?.githubBuilderCommitSha ?? null,
    testsPresent,
    checks,
    preview,
    files,
    prSummary,
  };
}

function activityTypeForResult(
  recommendation: ProductionRecommendation
): "production.ready" | "production.needs_changes" | "production.blocked" {
  if (recommendation === "ready_for_production") return "production.ready";
  if (recommendation === "blocked") return "production.blocked";
  return "production.needs_changes";
}

/**
 * Evaluates and persists a ProductionReadinessReview for a work session.
 * Returns null when the session does not exist.
 */
export async function prepareProductionReadiness(sessionId: string): Promise<ProductionReviewRecord | null> {
  const ctx = await loadSessionContext(sessionId);
  if (!ctx) return null;
  if (!ctx.task) {
    throw new Error("La sesión de trabajo no tiene una tarea vinculada.");
  }

  const evaluation = evaluateProductionReadiness(
    await buildEvaluationInput(ctx)
  );

  // Reuse the existing review when present (never create duplicates per session).
  const existing = await prisma.productionReadinessReview.findFirst({
    where: { workSessionId: sessionId },
    orderBy: { createdAt: "desc" },
  });

  const data = {
    projectId: ctx.projectId,
    taskId: ctx.taskId,
    previewDeploymentId: ctx.previewDeployments[0]?.id ?? null,
    status: evaluation.status,
    recommendation: evaluation.recommendation,
    riskLevel: evaluation.riskLevel,
    summary: evaluation.summary,
    blockingReasons: jsonField(evaluation.blockingReasons),
    diagnostics: jsonField(evaluation.diagnostics),
    checksSummary: jsonField(evaluation.checksSummary),
    previewSummary: jsonField(evaluation.previewSummary),
    prSummary: jsonField(evaluation.prSummary),
    filesSummary: jsonField(evaluation.filesSummary),
    // Preserve human decisions on refresh/prepare.
    approvedBy: existing?.approvedBy ?? null,
    approvedAt: existing?.approvedAt ?? null,
    rejectedAt: existing?.rejectedAt ?? null,
    humanNotes: existing?.humanNotes ?? null,
  };

  const review = existing
    ? await prisma.productionReadinessReview.update({
        where: { id: existing.id },
        data,
      })
    : await prisma.productionReadinessReview.create({
        data: { workSessionId: sessionId, ...data },
      });

  const summaryText = buildProductionReadinessSummary(review);
  await prisma.productionReadinessReview.update({
    where: { id: review.id },
    data: { summary: summaryText },
  });

  await logActivity({
    projectId: ctx.projectId,
    type: existing ? "production.refreshed" : "production.review_created",
    message: existing
      ? `Preparación de producción actualizada para "${ctx.objective.slice(0, 80)}"`
      : `Preparación de producción creada para "${ctx.objective.slice(0, 80)}"`,
    metadata: {
      productionReadinessReviewId: review.id,
      workSessionId: sessionId,
      taskId: ctx.taskId ?? undefined,
      recommendation: evaluation.recommendation,
      riskLevel: evaluation.riskLevel,
      previewStatus: evaluation.previewSummary?.status ?? undefined,
      prNumber: ctx.task?.githubPrNumber ?? null,
    },
  });

  await logActivity({
    projectId: ctx.projectId,
    type: activityTypeForResult(evaluation.recommendation),
    message: `Preparación de producción: ${evaluation.recommendation} para "${ctx.objective.slice(0, 80)}"`,
    metadata: {
      productionReadinessReviewId: review.id,
      workSessionId: sessionId,
      taskId: ctx.taskId ?? undefined,
      recommendation: evaluation.recommendation,
      riskLevel: evaluation.riskLevel,
      previewStatus: evaluation.previewSummary?.status ?? undefined,
      prNumber: ctx.task?.githubPrNumber ?? null,
    },
  });

  return review;
}

/**
 * Re-evaluates an existing review, preserving human decisions. If the review
 * was approved and a critical blocker appears, it falls back to needs_changes.
 */
export async function refreshProductionReadiness(
  reviewId: string
): Promise<ProductionReviewRecord | null> {
  const review = await prisma.productionReadinessReview.findUnique({
    where: { id: reviewId },
  });
  if (!review) return null;
  if (!review.workSessionId) {
    throw new Error("La revisión de producción no tiene sesión vinculada.");
  }

  const ctx = await loadSessionContext(review.workSessionId);
  if (!ctx) throw new Error("La sesión de trabajo ya no existe.");

  const evaluation = evaluateProductionReadiness(
    await buildEvaluationInput(ctx)
  );

  let status = evaluation.status;
  let recommendation = evaluation.recommendation;

  // Guardrail: if the review was approved and a critical blocker appears now,
  // fall back to needs_changes (never keep "approved" over a blocker).
  // If it is still ready, keep the human approval.
  if (review.status === "approved") {
    if (
      evaluation.recommendation === "blocked" ||
      evaluation.recommendation === "needs_changes" ||
      evaluation.recommendation === "manual_review_required"
    ) {
      status = "needs_changes";
      recommendation = "needs_changes";
    } else {
      status = "approved";
      recommendation = "ready_for_production";
    }
  }

  const data = {
    status,
    recommendation,
    riskLevel: evaluation.riskLevel,
    blockingReasons: jsonField(evaluation.blockingReasons),
    diagnostics: jsonField(evaluation.diagnostics),
    checksSummary: jsonField(evaluation.checksSummary),
    previewSummary: jsonField(evaluation.previewSummary),
    prSummary: jsonField(evaluation.prSummary),
    filesSummary: jsonField(evaluation.filesSummary),
    // Preserve the human decision timestamps/notes.
    approvedBy: review.approvedBy,
    approvedAt: review.approvedAt,
    rejectedAt: review.rejectedAt,
    humanNotes: review.humanNotes,
  };

  const updated = await prisma.productionReadinessReview.update({
    where: { id: reviewId },
    data: { ...data, summary: evaluation.summary },
  });
  const summaryText = buildProductionReadinessSummary(updated);
  await prisma.productionReadinessReview.update({
    where: { id: reviewId },
    data: { summary: summaryText },
  });

  await logActivity({
    projectId: ctx.projectId,
    type: "production.refreshed",
    message: `Revisión de producción recalculada para "${ctx.objective.slice(0, 80)}" → ${recommendation}`,
    metadata: {
      productionReadinessReviewId: reviewId,
      workSessionId: ctx.id,
      taskId: ctx.taskId ?? undefined,
      recommendation,
      riskLevel: evaluation.riskLevel,
      previewStatus: evaluation.previewSummary?.status ?? undefined,
      prNumber: ctx.task?.githubPrNumber ?? null,
    },
  });

  return updated;
}

/**
 * Marks a review as approved by a human. Only possible when the current
 * recommendation is ready_for_production. NEVER merges or deploys.
 */
export async function approveProductionReadiness(
  reviewId: string,
  humanEmail: string,
  notes?: string
): Promise<ProductionReviewRecord | null> {
  const review = await prisma.productionReadinessReview.findUnique({
    where: { id: reviewId },
    include: { workSession: true },
  });
  if (!review) return null;

  if (review.recommendation !== "ready_for_production") {
    throw new Error(
      "Solo se puede aprobar cuando la recomendación es ready_for_production."
    );
  }

  const updated = await prisma.productionReadinessReview.update({
    where: { id: reviewId },
    data: {
      status: "approved",
      approvedBy: humanEmail,
      approvedAt: new Date(),
      humanNotes: notes?.trim() ? notes.trim() : review.humanNotes,
      rejectedAt: null,
    },
  });
  const summaryText = buildProductionReadinessSummary(updated);
  await prisma.productionReadinessReview.update({
    where: { id: reviewId },
    data: { summary: summaryText },
  });

  await logActivity({
    projectId: review.projectId,
    type: "production.approved",
    message: `Preparación de producción APROBADA por ${humanEmail} (no hace merge ni deploy)`,
    metadata: {
      productionReadinessReviewId: reviewId,
      workSessionId: review.workSessionId ?? undefined,
      taskId: review.taskId ?? undefined,
      recommendation: "ready_for_production",
      riskLevel: review.riskLevel ?? undefined,
      prNumber: (review.prSummary as { prNumber?: number | null } | null)?.prNumber ?? null,
    },
  });

  return updated;
}

/**
 * Marks a review as rejected by a human (requires a note).
 */
export async function rejectProductionReadiness(
  reviewId: string,
  humanEmail: string,
  notes: string
): Promise<ProductionReviewRecord | null> {
  if (!notes || !notes.trim()) {
    throw new Error("Para rechazar es necesario indicar el motivo.");
  }
  const review = await prisma.productionReadinessReview.findUnique({
    where: { id: reviewId },
  });
  if (!review) return null;

  const updated = await prisma.productionReadinessReview.update({
    where: { id: reviewId },
    data: {
      status: "rejected",
      rejectedAt: new Date(),
      humanNotes: notes.trim(),
      approvedBy: null,
      approvedAt: null,
    },
  });
  const summaryText = buildProductionReadinessSummary(updated);
  await prisma.productionReadinessReview.update({
    where: { id: reviewId },
    data: { summary: summaryText },
  });

  await logActivity({
    projectId: review.projectId,
    type: "production.rejected",
    message: `Preparación de producción RECHAZADA por ${humanEmail}: ${notes.trim().slice(0, 200)}`,
    metadata: {
      productionReadinessReviewId: reviewId,
      workSessionId: review.workSessionId ?? undefined,
      taskId: review.taskId ?? undefined,
      riskLevel: review.riskLevel ?? undefined,
    },
  });

  return updated;
}
