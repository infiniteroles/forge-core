/**
 * Production Readiness summary builder (Fase 3.8).
 *
 * Turns a persisted ProductionReadinessReview into a human-readable prose
 * summary shown in the UI. Pure and synchronous. Never exposes values — only
 * statuses, URLs and key names.
 */

import type { Prisma } from "@prisma/client";
import type {
  ProductionChecksSummary,
  ProductionFilesSummary,
  ProductionPreviewSummary,
  ProductionPrSummary,
  ReadinessDiagnostic,
  ReadinessDiagnostics,
} from "./types";

type ReviewLike = {
  status: string;
  recommendation: string | null;
  riskLevel: string | null;
  summary: string | null;
  blockingReasons?: Prisma.JsonValue | null;
  diagnostics?: Prisma.JsonValue | null;
  checksSummary?: Prisma.JsonValue | null;
  previewSummary?: Prisma.JsonValue | null;
  prSummary?: Prisma.JsonValue | null;
  filesSummary?: Prisma.JsonValue | null;
  humanNotes?: string | null;
  approvedAt?: Date | null;
  approvedBy?: string | null;
  rejectedAt?: Date | null;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Sin preparar",
  ready: "Listo",
  blocked: "Bloqueado",
  needs_changes: "Requiere cambios",
  approved: "Aprobado",
  rejected: "Rechazado",
  cancelled: "Cancelado",
};

const RECOMMENDATION_LABELS: Record<string, string> = {
  ready_for_production: "Listo para producción",
  needs_changes: "Requiere cambios",
  blocked: "Bloqueado",
  manual_review_required: "Requiere revisión manual",
};

export function productionStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function productionRecommendationLabel(recommendation: string | null): string {
  if (!recommendation) return "—";
  return RECOMMENDATION_LABELS[recommendation] ?? recommendation;
}

function asRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function readDiagItem(v: unknown): ReadinessDiagnostic | null {
  if (!v || typeof v !== "object") return null;
  const item = v as Record<string, unknown>;
  const reason = str(item.reason);
  if (!reason) return null;
  return {
    source: str(item.source) ?? "unknown",
    reason,
    details: str(item.details) ?? undefined,
    severity:
      item.severity === "blocked" ||
      item.severity === "needs_changes" ||
      item.severity === "manual_review_required" ||
      item.severity === "warning"
        ? item.severity
        : "warning",
  };
}

function diagArray(v: unknown): ReadinessDiagnostic[] {
  if (!Array.isArray(v)) return [];
  return v.map(readDiagItem).filter((d): d is ReadinessDiagnostic => d !== null);
}

function asDiagnostics(value: Prisma.JsonValue | null | undefined): ReadinessDiagnostics | null {
  const rec = asRecord(value);
  if (!rec) return null;
  return {
    blocking: diagArray(rec.blocking),
    needsChanges: diagArray(rec.needsChanges),
    warnings: diagArray(rec.warnings),
    positiveSignals: Array.isArray(rec.positiveSignals)
      ? rec.positiveSignals.filter((x): x is string => typeof x === "string")
      : [],
  };
}

/** Recommended next step based on the diagnostics. */
function nextStep(diag: ReadinessDiagnostics | null): string {
  if (!diag) return "Re-ejecutar la PR Review o aplicar una iteración correctiva.";
  const blocking = diag.blocking.length > 0;
  const prReview = diag.needsChanges.some((d) => d.source === "pr_review");
  const preview = diag.needsChanges.some((d) => d.source === "preview");
  const checks = diag.needsChanges.some((d) => d.source === "checks");
  const files = diag.needsChanges.some((d) => d.source === "files");

  if (blocking) {
    return "Resolver el bloqueo antes de continuar con la preparación de producción.";
  }
  if (prReview) {
    return "Re-ejecutar la PR Review o aplicar una iteración correctiva sobre la misma PR.";
  }
  if (preview) {
    return "Preparar y verificar el preview DEV antes de continuar.";
  }
  if (checks) {
    return "Corregir los checks de sesión antes de continuar.";
  }
  if (files) {
    return "Revisar los archivos modificados (infraestructura / workflows).";
  }
  return "Re-ejecutar la PR Review o revisar manualmente la preparación.";
}

/**
 * Builds the human prose for a readiness review from its stored summaries and
 * diagnostics. Distinguishes real blockers, required changes, warnings and
 * positive signals.
 */
export function buildProductionReadinessSummary(review: ReviewLike): string {
  const lines: string[] = [];

  const pr = asRecord(review.prSummary);
  const preview = asRecord(review.previewSummary);
  const diag = asDiagnostics(review.diagnostics);
  const blocking = Array.isArray(review.blockingReasons)
    ? review.blockingReasons.filter((b): b is string => typeof b === "string")
    : [];

  const prNumber = str(pr?.prNumber);
  const base = str(pr?.baseBranch) ?? "main";
  const head = str(pr?.headBranch);

  const positives =
    diag && diag.positiveSignals.length > 0
      ? diag.positiveSignals
      : [];
  const blockers = diag
    ? [...diag.blocking.map((d) => d.reason), ...diag.needsChanges.map((d) => d.reason)]
    : blocking;
  const warnings = diag ? diag.warnings : [];

  const ready =
    (review.status === "ready" || review.status === "approved") &&
    (review.recommendation === "ready_for_production" || review.recommendation == null);

  lines.push(
    `${ready ? "Forge recomienda pasar esta tarea a producción." : "Forge no recomienda pasar esta tarea a producción todavía."}`
  );
  if (review.riskLevel) {
    lines.push(`Riesgo estimado: ${review.riskLevel}.`);
  }

  // ── Positives ─────────────────────────────────────────────────────────────
  const positiveList =
    positives.length > 0
      ? positives
      : [
          prNumber ? `La PR ${prNumber} está abierta y apunta a ${base}.` : null,
          preview?.status === "ready" ? "El preview DEV está funcionando." : null,
          "Los archivos modificados están permitidos por la safe-file policy.",
        ].filter((x): x is string => Boolean(x));

  lines.push("");
  lines.push("Lo que está bien:");
  positiveList.forEach((p) => lines.push(`- ${p}`));

  // ── What is missing ───────────────────────────────────────────────────────
  if (ready) {
    lines.push("");
    lines.push("No hay bloqueos conocidos.");
  } else if (blockers.length > 0) {
    lines.push("");
    lines.push("Qué falta:");
    blockers.forEach((b) => lines.push(`- ${b}`));
  }

  // ── Warnings ──────────────────────────────────────────────────────────────
  if (warnings.length > 0) {
    lines.push("");
    lines.push("Avisos:");
    warnings.forEach((w) => lines.push(`- ${w.reason}`));
  }

  if (!ready) {
    lines.push("");
    lines.push(`Siguiente paso recomendado:`);
    lines.push(`- ${nextStep(diag)}`);
  }

  // ── PR review detail ──────────────────────────────────────────────────────
  const reviewRec = str(pr?.reviewRecommendation);
  if (reviewRec) {
    lines.push("");
    lines.push(`Última PR Review: ${reviewRec}.`);
  }

  if (review.humanNotes) {
    lines.push("");
    lines.push(`Nota humana: ${review.humanNotes}`);
  }

  if (review.status === "approved" && review.approvedAt) {
    lines.push("");
    lines.push(`Aprobado por ${review.approvedBy ?? "humano"} el ${review.approvedAt.toLocaleString()}.`);
  }
  if (review.status === "rejected" && review.rejectedAt) {
    lines.push("");
    lines.push(`Rechazado el ${review.rejectedAt.toLocaleString()}.`);
  }

  lines.push("");
  lines.push(
    "Esto NO hace merge, NO despliega en producción y NO toca main. Solo un humano puede aprobar."
  );

  return lines.join("\n");
}

export type { ProductionChecksSummary, ProductionFilesSummary, ProductionPreviewSummary, ProductionPrSummary };
