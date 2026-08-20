/**
 * Production Readiness evaluator (Fase 3.8).
 *
 * Reviews the current state of a task / work session / PR / preview / checks /
 * changed files and produces a conservative readiness recommendation. It never
 * merges, never deploys and never writes to main. If the PR review says
 * needs_changes or keep_draft, the evaluator returns that REAL state — it never
 * forces ready_for_production.
 */

import type {
  ProductionChecksSummary,
  ProductionEvaluationResult,
  ProductionFilesSummary,
  ProductionPreviewSummary,
  ProductionPrSummary,
  ProductionRecommendation,
  ProductionReviewStatus,
  ProductionRiskLevel,
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
  checks: ProductionChecksSummary | null;
  preview: ProductionPreviewSummary | null;
  files: ProductionFilesSummary | null;
  prSummary: ProductionPrSummary | null;
}

type BlockerSeverity = "blocked" | "needs_changes" | "manual_review_required";

interface Block {
  reason: string;
  severity: BlockerSeverity;
}

function classify(input: ProductionEvaluationInput): Block[] {
  const blocks: Block[] = [];

  // ── Structural readiness ──────────────────────────────────────────────────
  const prState = input.prState ?? null;
  if (prState !== "open") {
    if (prState === "merged") {
      blocks.push({
        reason: "La PR ya está fusionada (merged).",
        severity: "blocked",
      });
    } else if (prState === "closed") {
      blocks.push({ reason: "La PR está cerrada.", severity: "blocked" });
    } else {
      blocks.push({
        reason: "No hay una PR abierta para esta tarea.",
        severity: "needs_changes",
      });
    }
  }

  if (input.prBaseBranch && input.prBaseBranch !== "main") {
    blocks.push({
      reason: `La PR apunta a "${input.prBaseBranch}" y no a main.`,
      severity: "blocked",
    });
  }

  if (!input.prHeadBranch || input.prHeadBranch === "main") {
    blocks.push({
      reason: "La rama origen de la PR es main (o es desconocida).",
      severity: "blocked",
    });
  }

  if (!input.builderCommitSha) {
    blocks.push({
      reason: "No hay un commit del Builder en esta tarea.",
      severity: "needs_changes",
    });
  }

  // ── PR review (guardrail: real state wins) ────────────────────────────────
  const reviewRec = input.prReviewRecommendation;
  if (reviewRec === "needs_changes") {
    blocks.push({
      reason: "La revisión automática del PR pide cambios (needs_changes).",
      severity: "needs_changes",
    });
  } else if (reviewRec === "keep_draft") {
    blocks.push({
      reason: "La revisión automática recomienda mantener la PR en draft.",
      severity: "manual_review_required",
    });
  } else if (reviewRec === "needs_human_decision") {
    blocks.push({
      reason: "La revisión automática requiere una decisión humana.",
      severity: "manual_review_required",
    });
  }

  // ── Session checks ────────────────────────────────────────────────────────
  const checksStatus = input.checks?.status ?? null;
  if (checksStatus === "failed") {
    blocks.push({
      reason: "Los checks de sesión fallaron.",
      severity: "needs_changes",
    });
  } else if (checksStatus === "timeout") {
    blocks.push({
      reason: "Algún check de sesión expiró (timeout).",
      severity: "manual_review_required",
    });
  }

  // ── DEV preview ───────────────────────────────────────────────────────────
  const previewStatus = input.preview?.status ?? "none";
  if (previewStatus === "failed") {
    blocks.push({
      reason: "El preview DEV falló.",
      severity: "blocked",
    });
  } else if (previewStatus === "deploying" || previewStatus === "queued") {
    blocks.push({
      reason: "El preview DEV todavía se está desplegando.",
      severity: "manual_review_required",
    });
  } else if (previewStatus === "not_configured" || previewStatus === "none" || previewStatus === "stopped") {
    blocks.push({
      reason: "No hay un preview DEV listo.",
      severity: "needs_changes",
    });
  }

  // ── Safe-file policy ──────────────────────────────────────────────────────
  if (input.files?.touchesBlockedPaths) {
    blocks.push({
      reason: "La PR toca rutas bloqueadas por la safe-file policy.",
      severity: "blocked",
    });
  }
  if (input.files?.touchesSecrets) {
    blocks.push({
      reason: "La PR toca archivos sensibles o con secretos.",
      severity: "blocked",
    });
  }
  if (input.files?.touchesInfra) {
    blocks.push({
      reason: "La PR toca infraestructura / configuración de deploy.",
      severity: "needs_changes",
    });
  }
  if (input.files?.touchesWorkflow) {
    blocks.push({
      reason: "La PR toca workflows de CI/CD.",
      severity: "needs_changes",
    });
  }

  return blocks;
}

function computeRisk(input: ProductionEvaluationInput, blocks: Block[]): ProductionRiskLevel {
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
    blocks.some(
      (b) =>
        b.severity === "blocked" &&
        /PR ya está fusionada|PR está cerrada|apunta a|falló|secretos|bloqueadas/.test(b.reason)
    )
  ) {
    risk = risk === "critical" ? "critical" : "high";
  }

  return risk;
}

function decide(
  blocks: Block[],
  input: ProductionEvaluationInput
): { status: ProductionReviewStatus; recommendation: ProductionRecommendation } {
  // Guardrail: never force ready_for_production when the PR review wants changes.
  if (blocks.length === 0) {
    return { status: "ready", recommendation: "ready_for_production" };
  }

  const hasBlocked = blocks.some((b) => b.severity === "blocked");
  const hasNeeds = blocks.some((b) => b.severity === "needs_changes");
  const hasManual = blocks.some((b) => b.severity === "manual_review_required");

  // Guardrail: PR review explicitly asked for changes → real state, even if
  // there are only "manual" issues elsewhere.
  if (input.prReviewRecommendation === "needs_changes" && !hasBlocked) {
    return { status: "needs_changes", recommendation: "needs_changes" };
  }

  if (hasBlocked) return { status: "blocked", recommendation: "blocked" };
  if (hasNeeds) return { status: "needs_changes", recommendation: "needs_changes" };
  if (hasManual)
    return { status: "needs_changes", recommendation: "manual_review_required" };

  return { status: "needs_changes", recommendation: "needs_changes" };
}

function buildSummary(
  status: ProductionReviewStatus,
  recommendation: ProductionRecommendation,
  blocks: Block[],
  input: ProductionEvaluationInput
): string {
  const pr = input.prNumber ? `#${input.prNumber}` : "la PR";
  const base = input.prBaseBranch ? ` → ${input.prBaseBranch}` : "";
  const head = input.prHeadBranch ?? "?";

  if (status === "ready") {
    return `Forge ha preparado la revisión de producción de la PR ${pr} (${head}${base}). La PR está abierta, hay commit del Builder y la revisión automática del PR es coherente. El preview DEV está listo. No hay bloqueos conocidos. Esto NO hace merge ni despliega.`;
  }

  const reasons = blocks.map((b) => b.reason).join(" · ");
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
  const blocks = classify(input);
  const { status, recommendation } = decide(blocks, input);
  const riskLevel = computeRisk(input, blocks);

  return {
    status,
    recommendation,
    riskLevel,
    summary: buildSummary(status, recommendation, blocks, input),
    blockingReasons: blocks.map((b) => b.reason),
    checksSummary: input.checks,
    previewSummary: input.preview,
    prSummary: input.prSummary ?? null,
    filesSummary: input.files,
  };
}
