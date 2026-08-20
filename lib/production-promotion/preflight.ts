/**
 * Production promotion — preflight (Fase 3.9).
 *
 * Re-validates, at promotion time, every guardrail that must hold before a
 * pull request may be merged into main. This is the enforcement point: even
 * though a readiness review was approved earlier, the promotion preflight
 * re-checks the live state (PR open, not draft, not merged, review still
 * ready_for_review, preview ready, no blocked files) right before the merge.
 */

import { prisma } from "@/lib/db";
import { getPullRequest } from "@/lib/github/pull-requests";
import { getPrFiles } from "@/lib/github/pr-context";
import { assessPrPaths } from "@/lib/github/safe-file-policy";
import { resolveReadyPreviewForTask } from "@/lib/production-readiness/preview-resolver";
import type {
  ProductionPreflightCheck,
  ProductionPreflightResult,
} from "./types";

export interface ProductionPromotionPreflightInput {
  reviewId: string;
  workSessionId: string | null;
}

function check(
  name: string,
  status: ProductionPreflightCheck["status"],
  reason?: string
): ProductionPreflightCheck {
  return reason ? { name, status, reason } : { name, status };
}

/**
 * Runs the promotion preflight. Pure in spirit but needs DB + GitHub access,
 * so it is async and touches only read-only sources. It NEVER merges.
 */
export async function runProductionPromotionPreflight(
  input: ProductionPromotionPreflightInput
): Promise<ProductionPreflightResult> {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  const checks: ProductionPreflightCheck[] = [];

  const review = await prisma.productionReadinessReview.findUnique({
    where: { id: input.reviewId },
    include: {
      task: true,
      project: true,
      workSession: true,
      previewDeployment: true,
    },
  });

  // --- 1. Readiness approved ---
  if (!review) {
    return {
      ok: false,
      status: "preflight_failed",
      checks: [check("readiness.approved", "failed", "No existe la revisión de readiness.")],
      blockingReasons: ["No existe la revisión de readiness."],
      warnings: [],
    };
  }
  const readinessOk =
    review.status === "approved" && review.recommendation === "ready_for_production";
  checks.push(
    check(
      "readiness.approved",
      readinessOk ? "passed" : "failed",
      readinessOk
        ? `Revisión ${review.status} con recomendación ${review.recommendation}.`
        : `Revisión ${review.status} con recomendación ${review.recommendation} (se requiere approved + ready_for_production).`
    )
  );
  if (!readinessOk) {
    blockingReasons.push(
      `La revisión de readiness no está aprobada (status ${review.status}, recomendación ${review.recommendation ?? "—"}).`
    );
  }

  const prSummary = (review.prSummary ?? {}) as Record<string, unknown>;
  const prNumber =
    typeof prSummary.prNumber === "number"
      ? prSummary.prNumber
      : review.task?.githubPrNumber ?? null;
  const repositoryFullName = review.project.repositoryFullName ?? null;

  // --- 2. PR exists / open / not draft / not merged / base main ---
  let prState: {
    state: string;
    draft: boolean;
    merged_at: string | null;
    base_ref: string | null;
    head_ref: string | null;
    html_url: string | null;
    merge_commit_sha: string | null;
  } | null = null;
  let prError: string | null = null;
  if (repositoryFullName && prNumber) {
    try {
      const pr = await getPullRequest({
        repositoryFullName,
        prNumber,
      });
      prState = {
        state: pr.state,
        draft: pr.draft,
        merged_at: pr.merged_at,
        base_ref: pr.baseBranch,
        head_ref: pr.headBranch,
        html_url: pr.html_url,
        merge_commit_sha: null,
      };
      const merged = Boolean(pr.merged_at);
      const prOk =
        pr.state === "open" &&
        !pr.draft &&
        !merged &&
        pr.baseBranch === "main";
      checks.push(
        check(
          "pr.ready",
          prOk ? "passed" : "failed",
          prOk
            ? `PR #${prNumber} abierto, no draft, sin mergear, base main.`
            : `PR #${prNumber}: state=${pr.state} draft=${pr.draft} merged=${merged} base=${pr.baseBranch}.`
        )
      );
      if (!prOk) {
        blockingReasons.push(
          `El PR #${prNumber} no está listo para merge: state=${pr.state}, draft=${pr.draft}, merged=${merged}, base=${pr.baseBranch}.`
        );
      }
    } catch (err) {
      prError = err instanceof Error ? err.message : "Error consultando el PR";
      checks.push(
        check("pr.ready", "failed", prError)
      );
      blockingReasons.push(`No se pudo verificar el PR #${prNumber}: ${prError}.`);
    }
  } else {
    checks.push(
      check(
        "pr.ready",
        "failed",
        "No hay repositorio o número de PR asociado a la revisión."
      )
    );
    blockingReasons.push(
      "No hay repositorio o número de PR asociado a la revisión de readiness."
    );
  }

  // --- 3. Last PR review still ready_for_review ---
  const reviewRec =
    typeof prSummary.reviewRecommendation === "string"
      ? prSummary.reviewRecommendation
      : null;
  const reviewOk = reviewRec === "ready_for_review";
  checks.push(
    check(
      "pr.review",
      reviewOk ? "passed" : "failed",
      reviewOk
        ? "La última PR Review recomienda ready_for_review."
        : `La última PR Review recomienda ${reviewRec ?? "—"} (se requiere ready_for_review).`
    )
  );
  if (!reviewOk) {
    blockingReasons.push(
      `La última PR Review no recomienda ready_for_review (recomendación: ${reviewRec ?? "—"}).`
    );
  }

  // --- 4. Preview ready + URL ---
  const resolvedPreview = await resolveReadyPreviewForTask({
    projectId: review.projectId,
    taskId: review.taskId,
    workSessionId: input.workSessionId ?? review.workSessionId,
    branchName: review.task?.githubBranchName ?? prState?.head_ref ?? null,
    pullRequestNumber: prNumber,
    repositoryFullName,
  });
  const previewReady =
    resolvedPreview !== null &&
    resolvedPreview.status === "ready" &&
    Boolean(resolvedPreview.previewUrl);
  checks.push(
    check(
      "preview.ready",
      previewReady ? "passed" : "failed",
      previewReady
        ? `Preview lista en ${resolvedPreview?.previewUrl}.`
        : resolvedPreview
          ? `Preview ${resolvedPreview.status} sin URL utilizable.`
          : "No se encontró una preview lista para la tarea."
    )
  );
  if (!previewReady) {
    blockingReasons.push(
      "No hay una preview DEV lista y verificada para esta tarea."
    );
  }

  // --- 5. Safe-file policy: no blocked paths in the PR diff ---
  let blockedPaths: string[] = [];
  if (repositoryFullName && prNumber) {
    try {
      const files = await getPrFiles({ repositoryFullName, prNumber });
      const paths = files.map((f) => f.filename);
      const assessment = assessPrPaths(paths);
      blockedPaths = assessment.blockedPaths;
      const safeOk = !assessment.touchesBlockedPaths;
      checks.push(
        check(
          "files.safe",
          safeOk ? "passed" : "failed",
          safeOk
            ? "El diff del PR no toca rutas bloqueadas."
            : `El diff del PR toca rutas bloqueadas: ${assessment.blockedPaths.join(", ")}.`
        )
      );
      if (!safeOk) {
        blockingReasons.push(
          `El diff del PR toca rutas bloqueadas por safe-file-policy: ${assessment.blockedPaths.join(", ")}.`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error";
      checks.push(check("files.safe", "failed", msg));
      blockingReasons.push(`No se pudo comprobar el diff del PR: ${msg}.`);
    }
  } else {
    checks.push(check("files.safe", "skipped", "Sin PR para comprobar ficheros."));
  }

  // --- 6. Checks: no critical failures in the readiness checks summary ---
  const checksSummary = (review.checksSummary ?? {}) as Record<string, unknown>;
  const criticalFails = Array.isArray(checksSummary.criticalFails)
    ? (checksSummary.criticalFails as string[])
    : [];
  const checksOk = criticalFails.length === 0;
  checks.push(
    check(
      "checks.no_critical_fails",
      checksOk ? "passed" : "failed",
      checksOk
        ? "No hay fallos críticos en los checks del trabajo."
        : `Fallos críticos detectados: ${criticalFails.join(", ")}.`
    )
  );
  if (!checksOk) {
    blockingReasons.push(
      `Hay fallos críticos pendientes en los checks del trabajo: ${criticalFails.join(", ")}.`
    );
  }

  // --- Warnings ---
  if (prState && prState.state === "open" && prState.base_ref !== "main") {
    warnings.push(`El PR #${prNumber} apunta a la base "${prState.base_ref}" (no "main").`);
  }
  if (blockedPaths.length > 0) {
    warnings.push(
      `Rutas sensibles en el diff: ${blockedPaths.join(", ")}.`
    );
  }

  const ok = blockingReasons.length === 0;
  return {
    ok,
    status: ok ? "ready_to_promote" : "preflight_failed",
    checks,
    blockingReasons,
    warnings,
  };
}
