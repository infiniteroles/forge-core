/**
 * Production Readiness diagnostics (Fase 3.8B).
 *
 * Explains WHY a task is not ready for production: real blockers, required
 * changes, warnings and positive signals. Feeds the evaluator decision, the
 * persisted review (blockingReasons + diagnostics) and the UI ("Why not
 * ready?"). Pure and synchronous — no I/O.
 */

import type { ProductionEvaluationInput } from "./evaluator";
import type {
  ReadinessDiagnostic,
  ReadinessDiagnostics,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Builds structured diagnostics from the current task/session/PR state.
 */
export function buildReadinessDiagnostics(
  input: ProductionEvaluationInput
): ReadinessDiagnostics {
  const blocking: ReadinessDiagnostic[] = [];
  const needsChanges: ReadinessDiagnostic[] = [];
  const warnings: ReadinessDiagnostic[] = [];
  const positiveSignals: string[] = [];

  const prNumber = input.prNumber ? `#${input.prNumber}` : "la PR";

  // ── PR structure ──────────────────────────────────────────────────────────
  const prState = input.prState ?? null;
  if (prState !== "open") {
    if (prState === "merged") {
      blocking.push({
        source: "pr",
        reason: "La PR ya está fusionada (merged).",
        severity: "blocked",
      });
    } else if (prState === "closed") {
      blocking.push({
        source: "pr",
        reason: "La PR está cerrada.",
        severity: "blocked",
      });
    } else {
      needsChanges.push({
        source: "pr",
        reason: "No hay una PR abierta para esta tarea.",
        severity: "needs_changes",
      });
    }
  } else {
    positiveSignals.push(`La PR ${prNumber} está abierta.`);
  }

  if (input.prBaseBranch && input.prBaseBranch !== "main") {
    blocking.push({
      source: "pr",
      reason: `La PR apunta a "${input.prBaseBranch}" y no a main.`,
      severity: "blocked",
    });
  } else if (input.prBaseBranch === "main") {
    positiveSignals.push(`La PR ${prNumber} apunta a main.`);
  }

  if (!input.prHeadBranch || input.prHeadBranch === "main") {
    blocking.push({
      source: "pr",
      reason: "La rama origen de la PR es main (o es desconocida).",
      severity: "blocked",
    });
  } else {
    positiveSignals.push("La rama de la PR no es main.");
  }

  // ── Builder commit ────────────────────────────────────────────────────────
  if (!input.builderCommitSha) {
    needsChanges.push({
      source: "builder",
      reason: "No hay un commit del Builder en esta tarea.",
      severity: "needs_changes",
    });
  } else {
    positiveSignals.push("Hay un commit del Builder en la tarea.");
  }

  // ── PR review (guardrail: real state wins) ────────────────────────────────
  const reviewRec = input.prReviewRecommendation;
  const reviewRisk = input.prReviewRiskLevel;
  if (reviewRec === "needs_changes") {
    needsChanges.push({
      source: "pr_review",
      reason: "La última PR Review pide cambios (needs_changes).",
      details:
        "Re-ejecuta la PR Review o aplica una iteración correctiva antes de preparar producción.",
      severity: "needs_changes",
    });
  } else if (reviewRec === "keep_draft") {
    needsChanges.push({
      source: "pr_review",
      reason: "La última PR Review recomienda mantener la PR en draft.",
      severity: "manual_review_required",
    });
  } else if (reviewRec === "needs_human_decision") {
    needsChanges.push({
      source: "pr_review",
      reason: "La última PR Review requiere una decisión humana.",
      severity: "manual_review_required",
    });
  } else if (reviewRec === "completed_with_warnings") {
    warnings.push({
      source: "pr_review",
      reason: "La última PR Review terminó con warnings.",
    });
  } else if (reviewRec === "ready_for_review") {
    positiveSignals.push("La última PR Review recomienda ready_for_review.");
  }

  if (reviewRec && input.prReviewLastCheckedAt) {
    const age = Date.now() - input.prReviewLastCheckedAt.getTime();
    if (age > 3 * DAY_MS) {
      warnings.push({
        source: "pr_review",
        reason: "La última PR Review es antigua; considera re-ejecutarla.",
        details: `Revisada hace ${Math.round(age / DAY_MS)} días.`,
      });
    }
  }

  if (reviewRisk === "high" || reviewRisk === "critical") {
    blocking.push({
      source: "pr_review",
      reason: `Riesgo de la revisión: ${reviewRisk}.`,
      severity: "blocked",
    });
  }

  // ── Session checks ────────────────────────────────────────────────────────
  const checksStatus = input.checks?.status ?? null;
  if (checksStatus === "failed") {
    needsChanges.push({
      source: "checks",
      reason: "Los checks de sesión fallaron.",
      severity: "needs_changes",
    });
  } else if (checksStatus === "timeout") {
    needsChanges.push({
      source: "checks",
      reason: "Algún check de sesión expiró (timeout).",
      severity: "manual_review_required",
    });
  } else if (checksStatus === "passed") {
    positiveSignals.push("Los checks de sesión pasaron.");
  } else if (checksStatus === "skipped") {
    warnings.push({
      source: "checks",
      reason: "Los checks de sesión están omitidos (runner no configurado).",
    });
  }

  // ── DEV preview ───────────────────────────────────────────────────────────
  const previewStatus = input.preview?.status ?? "none";
  if (previewStatus === "failed") {
    blocking.push({
      source: "preview",
      reason: "El preview DEV falló.",
      severity: "blocked",
    });
  } else if (previewStatus === "deploying" || previewStatus === "queued") {
    needsChanges.push({
      source: "preview",
      reason: "El preview DEV todavía se está desplegando.",
      severity: "manual_review_required",
    });
  } else if (
    previewStatus === "not_configured" ||
    previewStatus === "none" ||
    previewStatus === "stopped"
  ) {
    needsChanges.push({
      source: "preview",
      reason: "No hay un preview DEV listo.",
      severity: "needs_changes",
    });
  } else if (previewStatus === "ready") {
    positiveSignals.push("El preview DEV está listo.");
    if (input.preview?.previewUrl) {
      positiveSignals.push(`El preview DEV responde en ${input.preview.previewUrl}.`);
    }
  }

  // ── Safe-file policy ──────────────────────────────────────────────────────
  if (input.files?.touchesBlockedPaths) {
    blocking.push({
      source: "files",
      reason: "La PR toca rutas bloqueadas por la safe-file policy.",
      severity: "blocked",
    });
  }
  if (input.files?.touchesSecrets) {
    blocking.push({
      source: "files",
      reason: "La PR toca archivos sensibles o con secretos.",
      severity: "blocked",
    });
  }
  if (input.files?.touchesInfra) {
    needsChanges.push({
      source: "files",
      reason: "La PR toca infraestructura / configuración de deploy.",
      severity: "needs_changes",
    });
  }
  if (input.files?.touchesWorkflow) {
    needsChanges.push({
      source: "files",
      reason: "La PR toca workflows de CI/CD.",
      severity: "needs_changes",
    });
  }
  if (
    !input.files?.touchesBlockedPaths &&
    !input.files?.touchesSecrets &&
    !input.files?.touchesInfra &&
    !input.files?.touchesWorkflow &&
    (input.files?.total ?? 0) > 0
  ) {
    positiveSignals.push("Los archivos modificados están permitidos por la safe-file policy.");
  }

  return { blocking, needsChanges, warnings, positiveSignals };
}

/** Convenience: reasons that keep the task from being ready. */
export function readinessReasons(diag: ReadinessDiagnostics): string[] {
  return [
    ...diag.blocking.map((d) => d.reason),
    ...diag.needsChanges.map((d) => d.reason),
  ];
}
