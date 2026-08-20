/**
 * Production promotion — human-readable summary builder (Fase 3.9).
 *
 * Generates the free-text `summary` stored on a ProductionPromotion from its
 * structured fields (preflight, merge, verification).
 */

import type { ProductionPromotionSummaryData } from "./types";

export function buildProductionPromotionSummary(
  data: ProductionPromotionSummaryData
): string {
  const pr = data.prNumber ? `PR #${data.prNumber}` : "PR";
  const lines: string[] = [];

  if (!data.preflightOk && data.status === "preflight_failed") {
    lines.push("No se puede promover a producción: el preflight no ha pasado.");
    lines.push(
      "El merge a main está bloqueado hasta que se cumplan todos los guardrails."
    );
    if (data.error) lines.push(`Detalle: ${data.error}`);
    return lines.join(" ");
  }

  if (data.completed || data.status === "completed") {
    lines.push(`Promoción a producción completada (${pr}).`);
    if (data.mergeCommitSha) {
      lines.push(`Merge commit: ${data.mergeCommitSha.slice(0, 12)}.`);
    }
    const statuses: string[] = [];
    if (data.healthOk !== undefined) {
      statuses.push(
        data.healthOk ? "salud OK" : "salud con problemas"
      );
    }
    if (data.endpointOk !== undefined) {
      statuses.push(
        data.endpointOk
          ? "endpoint verificado"
          : "endpoint no disponible"
      );
    }
    if (statuses.length > 0) {
      lines.push(`Verificación: ${statuses.join(", ")}.`);
    }
    lines.push(
      "El cambio ya está en main. El despliegue de producción puede tardar unos minutos."
    );
    return lines.join(" ");
  }

  if (data.failed || data.status === "failed") {
    lines.push(`La promoción a producción ha fallado (${pr}).`);
    if (data.mergeCommitSha) {
      lines.push(`Merge commit: ${data.mergeCommitSha.slice(0, 12)}.`);
    }
    lines.push("No se ha revertido nada automáticamente.");
    if (data.error) lines.push(`Motivo: ${data.error}`);
    return lines.join(" ");
  }

  if (data.status === "ready_to_promote") {
    lines.push("Preflight superado: listo para promover a producción.");
    lines.push(
      "El merge a main solo se ejecutará tras una confirmación humana explícita (PROMOTE)."
    );
    return lines.join(" ");
  }

  if (data.status === "promoting" || data.status === "merged" || data.status === "verifying") {
    lines.push(`Promoción a producción en curso (${pr}).`);
    if (data.mergeCommitSha) {
      lines.push(`Merge commit: ${data.mergeCommitSha.slice(0, 12)}.`);
    }
    lines.push(
      "Se está verificando que main responde correctamente antes de dar por completada la promoción."
    );
    return lines.join(" ");
  }

  if (data.status === "cancelled") {
    return `Promoción a producción cancelada (${pr}). No se ha mergeado nada.`;
  }

  return `Promoción a producción preparada (${pr}). Estado: ${data.status}.`;
}
