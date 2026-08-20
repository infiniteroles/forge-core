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
} from "./types";

type ReviewLike = {
  status: string;
  recommendation: string | null;
  riskLevel: string | null;
  summary: string | null;
  blockingReasons?: Prisma.JsonValue | null;
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

/**
 * Builds the human prose for a readiness review from its stored summaries.
 */
export function buildProductionReadinessSummary(review: ReviewLike): string {
  const lines: string[] = [];

  const pr = asRecord(review.prSummary);
  const preview = asRecord(review.previewSummary);
  const checks = asRecord(review.checksSummary);
  const files = asRecord(review.filesSummary);
  const blocking = Array.isArray(review.blockingReasons)
    ? review.blockingReasons.filter((b): b is string => typeof b === "string")
    : [];

  const prNumber = str(pr?.prNumber);
  const base = str(pr?.baseBranch) ?? "main";
  const head = str(pr?.headBranch);

  lines.push(
    `Producción: ${productionStatusLabel(review.status)}${
      review.recommendation
        ? ` · ${productionRecommendationLabel(review.recommendation)}`
        : ""
    }.`
  );

  if (review.riskLevel) {
    lines.push(`Riesgo estimado: ${review.riskLevel}.`);
  }

  if (prNumber) {
    const reviewRec = str(pr?.reviewRecommendation);
    lines.push(
      `PR #${prNumber} (${head ?? "?"} → ${base}): estado ${str(pr?.state) ?? "?"}${
        pr?.draft === true ? " · draft" : ""
      }.`
    );
    if (reviewRec) {
      lines.push(`Revisión automática del PR: ${reviewRec}.`);
    }
  }

  const previewStatus = str(preview?.status);
  if (previewStatus) {
    lines.push(
      `Preview DEV: ${previewStatus}${
        str(preview?.previewUrl) ? ` · ${str(preview?.previewUrl)}` : ""
      }.`
    );
  }

  const checksStatus = str(checks?.status);
  if (checksStatus) {
    lines.push(`Checks de sesión: ${checksStatus}.`);
  }

  if (files) {
    const total = typeof files.total === "number" ? files.total : 0;
    lines.push(`Archivos modificados: ${total}.`);
    if (files.touchesBlockedPaths === true) {
      lines.push("Aviso: la PR toca rutas bloqueadas.");
    }
    if (files.touchesSecrets === true) {
      lines.push("Aviso: la PR toca archivos sensibles.");
    }
  }

  if (blocking.length > 0) {
    lines.push("");
    lines.push("Motivos:");
    blocking.forEach((b) => lines.push(`- ${b}`));
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
