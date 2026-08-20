/**
 * Production Readiness evaluator (Fase 3.8).
 *
 * Reviews the current state of a task / work session / PR / preview / checks /
 * changed files and produces a conservative readiness recommendation. It never
 * merges, never deploys and never writes to main. If the PR review says
 * needs_changes or keep_draft, the evaluator returns that REAL state — it never
 * forces ready_for_production.
 */

import { buildReadinessDiagnostics, readinessReasons } from "./diagnostics";
import type {
  ProductionChecksSummary,
  ProductionEvaluationResult,
  ProductionFilesSummary,
  ProductionPreviewSummary,
  ProductionPrSummary,
  ProductionRecommendation,
  ProductionReviewStatus,
  ProductionRiskLevel,
  ReadinessDiagnostics,
} from "./types";

export interface ProductionEvaluationInput {
  prNumber: number | null;
  prUrl: string | null;
  prState: string | null; // "open" | "closed" | "merged" | null
  prDraft: boolean | null;
  prBaseBranch: string | null;
  prHeadBranch: string | null;
  prMergedAt: Date | null;
  prReviewStatus: string | null;
  prReviewRecommendation: string | null; // ready_for_review|keep_draft|needs_changes|needs_human_decision|completed_with_warnings
  prReviewRiskLevel: string | null; // low|medium|high
  prReviewReadyForReview: boolean | null;
  prReviewSummary: string | null;
  prReviewLastCheckedAt: Date | null;
  prMarkedReadyAt: Date | null;
  builderCommitSha: string | null;
  testsPresent: boolean;
  checks: ProductionChecksSummary | null;
  preview: ProductionPreviewSummary | null;
  files: ProductionFilesSummary | null;
  prSummary: ProductionPrSummary | null;
}



function computeRisk(
  input: ProductionEvaluationInput,
  diag: ReadinessDiagnostics
): ProductionRiskLevel {
  const reviewRisk = input.prReviewRiskLevel;
  let risk: ProductionRiskLevel = "low";

  if (reviewRisk === "critical") risk = "critical";
  else if (reviewRisk === "high") risk = "high";
  else if (reviewRisk === "medium") risk = "medium";
  else if (reviewRisk === "low") risk = "low";
  else risk = "unknown";

  // Escalate from policy findings.
  if (input.files?.touchesSecrets || input.files?.touchesBlockedPaths) {
    risk = risk === "critical" ? "critical" : "high";
  }
  if (
    diag.blocking.some((b) =>
      /PR ya está fusionada|PR está cerrada|apunta a|falló|secretos|bloqueadas|Riesgo de la revisión/.test(
        b.reason
      )
    )
  ) {
    risk = risk === "critical" ? "critical" : "high";
  }

  return risk;
}

function decide(
  diag: ReadinessDiagnostics,
  input: ProductionEvaluationInput
): { status: ProductionReviewStatus; recommendation: ProductionRecommendation } {
  // Guardrail: a PR review asking for changes always returns the real state —
  // never forced to ready_for_production.
  if (input.prReviewRecommendation === "needs_changes" && diag.blocking.length === 0) {
    return { status: "needs_changes", recommendation: "needs_changes" };
  }

  const hasBlocked = diag.blocking.length > 0;
  const hasNeeds = diag.needsChanges.some((d) => d.severity === "needs_changes");
  const hasManual = diag.needsChanges.some(
    (d) => d.severity === "manual_review_required"
  );

  if (hasBlocked) return { status: "blocked", recommendation: "blocked" };
  if (hasNeeds) return { status: "needs_changes", recommendation: "needs_changes" };
  if (hasManual)
    return { status: "needs_changes", recommendation: "manual_review_required" };

  return { status: "ready", recommendation: "ready_for_production" };
}

function buildSummary(
  status: ProductionReviewStatus,
  recommendation: ProductionRecommendation,
  diag: ReadinessDiagnostics,
  input: ProductionEvaluationInput
): string {
  const pr = input.prNumber ? `#${input.prNumber}` : "la PR";
  const base = input.prBaseBranch ? ` → ${input.prBaseBranch}` : "";
  const head = input.prHeadBranch ?? "?";

  if (status === "ready") {
    return `Forge ha preparado la revisión de producción de la PR ${pr} (${head}${base}). La PR está abierta, hay commit del Builder y la revisión automática del PR es coherente. El preview DEV está listo. No hay bloqueos conocidos. Esto NO hace merge ni despliega.`;
  }

  const reasons = readinessReasons(diag).join(" · ");
  const label: Record<ProductionRecommendation, string> = {
    ready_for_production: "Listo para producción",
    needs_changes: "Requiere cambios",
    blocked: "Bloqueado",
    manual_review_required: "Requiere revisión manual",
  };
  return `Forge ha preparado la revisión de producción de la PR ${pr} (${head}${base}). Recomendación: ${label[recommendation]}. ${reasons}`;
}

/**
 * Evaluates production readiness from the current task/session/PR state.
 * Pure and synchronous — no I/O, no side effects.
 */
export function evaluateProductionReadiness(
  input: ProductionEvaluationInput
): ProductionEvaluationResult {
  const diagnostics = buildReadinessDiagnostics(input);
  const { status, recommendation } = decide(diagnostics, input);
  const riskLevel = computeRisk(input, diagnostics);

  return {
    status,
    recommendation,
    riskLevel,
    summary: buildSummary(status, recommendation, diagnostics, input),
    blockingReasons: readinessReasons(diagnostics),
    diagnostics,
    checksSummary: input.checks,
    previewSummary: input.preview,
    prSummary: input.prSummary ?? null,
    filesSummary: input.files,
  };
}
