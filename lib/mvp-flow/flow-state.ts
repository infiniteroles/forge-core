/**
 * MVP flow state (Fase 5.0).
 *
 * Computes a single, human-friendly "where am I / what do I do next" summary
 * for a project/task/work-session from the existing domain data. Purely a
 * UI/flow helper: it never mutates anything and never reads secrets. The goal
 * is to replace panels-of-status with one clear next action.
 */

export type MvpPhase =
  | "idea"
  | "working"
  | "preview_ready"
  | "changes_requested"
  | "ready_for_approval"
  | "approved"
  | "ready_to_promote"
  | "promoting"
  | "production_live"
  | "blocked"
  | "failed";

export type MvpActionKind =
  | "work_on_this"
  | "open_preview"
  | "ask_for_changes"
  | "prepare_production"
  | "approve_readiness"
  | "prepare_promotion"
  | "promote"
  | "view_production"
  | "recover"
  | "none";

export interface MvpFlowState {
  phase: MvpPhase;
  title: string;
  description: string;
  nextActionLabel?: string;
  nextActionKind: MvpActionKind;
  primaryUrl?: string;
  secondaryActions?: Array<{
    label: string;
    kind: string;
    url?: string;
  }>;
  warnings?: string[];
  advancedSummary?: {
    prNumber?: number;
    branchName?: string;
    previewUrl?: string;
    promotionStatus?: string;
    jobStatus?: string;
    workerMode?: string;
  };
}

export interface MvpFlowInput {
  project?: {
    id: string;
    name?: string | null;
    productionUrl?: string | null;
  } | null;
  task?: {
    id: string;
    title?: string | null;
    githubPrNumber?: number | null;
    githubPrUrl?: string | null;
    githubBranchName?: string | null;
  } | null;
  workSession?: {
    id: string;
    status: string;
    summary?: string | null;
    error?: string | null;
    requestedChanges?: string | null;
    iterationNumber?: number;
  } | null;
  preview?: {
    status: string;
    previewUrl?: string | null;
    error?: string | null;
  } | null;
  readiness?: {
    status: string;
    recommendation?: string | null;
    summary?: string | null;
  } | null;
  promotion?: {
    status: string;
    error?: string | null;
    jobStatus?: string | null;
    prNumber?: number | null;
    mergeCommitSha?: string | null;
  } | null;
  workerMode?: "detached" | "inline" | "unknown";
}

const SESSION_URL = (id: string) => `/work-sessions/${id}`;

/**
 * Derives the MVP flow state. Priority chain (highest wins):
 * production live → promoting → promotion failed → ready to promote →
 * approved → ready for approval → needs changes → preview ready →
 * preview failed → working → idea.
 */
export function computeMvpFlow(input: MvpFlowInput): MvpFlowState {
  const { workSession, preview, readiness, promotion, task, project } = input;
  const ws = workSession;

  const advancedSummary: MvpFlowState["advancedSummary"] = {
    prNumber: task?.githubPrNumber ?? undefined,
    branchName: task?.githubBranchName ?? undefined,
    previewUrl: preview?.previewUrl ?? undefined,
    promotionStatus: promotion?.status,
    jobStatus: promotion?.jobStatus ?? undefined,
    workerMode: input.workerMode,
  };

  const secondary: MvpFlowState["secondaryActions"] = [];
  const warnings: string[] = [];
  if (input.workerMode === "inline") {
    warnings.push(
      "No hay worker detached activo: Forge puede usar el fallback inline, pero lo recomendable es revisar forge-worker."
    );
  }

  // 1. Production live.
  if (promotion?.status === "completed") {
    return {
      phase: "production_live",
      title: "El cambio ya está en producción",
      description:
        "La promoción se completó y la verificación fue correcta. El cambio ya está publicado.",
      nextActionKind: "view_production",
      nextActionLabel: "Ver resultado en producción",
      primaryUrl: project?.productionUrl ?? undefined,
      secondaryActions: secondary,
      warnings,
      advancedSummary,
    };
  }

  // 2. Promotion in progress.
  const activePromotion = ["promoting", "merged", "deploying", "verifying"];
  if (promotion && activePromotion.includes(promotion.status)) {
    return {
      phase: "promoting",
      title: "Forge está promocionando el cambio",
      description:
        promotion.status === "deploying" || promotion.status === "verifying"
          ? "El cambio se está desplegando y verificando en producción. Esto puede tardar unos minutos."
          : "La promoción está en curso: merge y despliegue de producción.",
      nextActionKind: "none",
      secondaryActions: secondary,
      warnings,
      advancedSummary,
    };
  }

  // 3. Promotion failed → recover.
  if (promotion?.status === "failed") {
    return {
      phase: "failed",
      title: "La promoción necesita atención",
      description: (promotion.error ?? "Ocurrió un error durante la promoción.").slice(0, 300),
      nextActionKind: "recover",
      nextActionLabel: "Recuperar la promoción",
      primaryUrl: ws ? SESSION_URL(ws.id) : undefined,
      secondaryActions: secondary,
      warnings,
      advancedSummary,
    };
  }

  // 4. Ready to promote.
  if (promotion?.status === "ready_to_promote") {
    return {
      phase: "ready_to_promote",
      title: "Listo para promover a producción",
      description:
        "La preflight de promoción está superada. Ejecuta la promoción para publicar el cambio (requiere confirmación PROMOTE).",
      nextActionKind: "promote",
      nextActionLabel: "Promocionar a producción",
      primaryUrl: ws ? SESSION_URL(ws.id) : undefined,
      secondaryActions: secondary,
      warnings,
      advancedSummary,
    };
  }

  // 5. Approved → prepare promotion.
  if (readiness?.status === "approved") {
    return {
      phase: "approved",
      title: "Aprobado para producción",
      description:
        "La preparación de producción está aprobada. Siguiente paso: preparar la promoción (hace preflight, no mergea).",
      nextActionKind: "prepare_promotion",
      nextActionLabel: "Preparar promoción",
      primaryUrl: ws ? SESSION_URL(ws.id) : undefined,
      secondaryActions: secondary,
      warnings,
      advancedSummary,
    };
  }

  // 6. Ready for approval.
  if (
    readiness?.recommendation === "ready_for_production" ||
    readiness?.status === "ready"
  ) {
    return {
      phase: "ready_for_approval",
      title: "Listo para aprobar",
      description:
        "Forge recomienda pasar el cambio a producción. Revisa el preview y aprueba la preparación.",
      nextActionKind: "approve_readiness",
      nextActionLabel: "Aprobar preparación de producción",
      primaryUrl: ws ? SESSION_URL(ws.id) : undefined,
      secondaryActions: [
        ...secondary,
        ...(preview?.previewUrl
          ? [{ label: "Abrir preview DEV", kind: "open_preview", url: preview.previewUrl }]
          : []),
      ],
      warnings,
      advancedSummary,
    };
  }

  // 7. Needs changes / blocked by readiness.
  const blockedStatuses = ["needs_changes", "blocked", "rejected"];
  if (readiness && blockedStatuses.includes(readiness.status)) {
    return {
      phase: readiness.status === "blocked" ? "blocked" : "changes_requested",
      title:
        readiness.status === "blocked"
          ? "Hay bloqueos antes de aprobar"
          : "Forge ha detectado ajustes antes de aprobar",
      description:
        readiness.status === "blocked"
          ? "Existen bloqueos de producción. Pide cambios a Forge o revisa la preparación."
          : "La revisión de producción requiere cambios. Pide cambios a Forge o revisa la PR.",
      nextActionKind: "ask_for_changes",
      nextActionLabel: "Pedir cambios a Forge",
      primaryUrl: ws ? SESSION_URL(ws.id) : undefined,
      secondaryActions: [
        ...secondary,
        ...(preview?.previewUrl
          ? [{ label: "Abrir preview DEV", kind: "open_preview", url: preview.previewUrl }]
          : []),
      ],
      warnings,
      advancedSummary,
    };
  }

  // 8. Preview ready.
  if (preview?.status === "ready" && preview.previewUrl) {
    return {
      phase: "preview_ready",
      title: "Puedes revisar el cambio en DEV",
      description:
        "El preview DEV está listo. Ábrelo para revisar el resultado antes de aprobar o pedir cambios.",
      nextActionKind: "open_preview",
      nextActionLabel: "Abrir preview DEV",
      primaryUrl: preview.previewUrl,
      secondaryActions: [
        ...secondary,
        ...(ws
          ? [{ label: "Preparar producción", kind: "prepare_production", url: SESSION_URL(ws.id) }]
          : []),
      ],
      warnings,
      advancedSummary,
    };
  }

  // 9. Preview failed.
  if (preview?.status === "failed") {
    return {
      phase: "blocked",
      title: "El preview no está disponible",
      description:
        preview.error ?? "El preview falló. Reintenta el preview o revisa los logs avanzados.",
      nextActionKind: "none",
      nextActionLabel: "Reintentar preview",
      primaryUrl: ws ? SESSION_URL(ws.id) : undefined,
      secondaryActions: secondary,
      warnings,
      advancedSummary,
    };
  }

  // 10. Working.
  const activeSession = ["queued", "running"];
  if (ws && activeSession.includes(ws.status)) {
    return {
      phase: "working",
      title: "Forge está trabajando en tu idea",
      description:
        "Forge está creando la rama, la PR, la propuesta y el commit. No hace falta hacer nada por ahora.",
      nextActionKind: "none",
      secondaryActions: secondary,
      warnings,
      advancedSummary,
    };
  }

  // 11. Session waiting for user / completed with warnings → needs attention.
  if (ws && (ws.status === "waiting_for_user" || ws.status === "completed_with_warnings")) {
    return {
      phase: ws.status === "waiting_for_user" ? "changes_requested" : "blocked",
      title:
        ws.status === "waiting_for_user"
          ? "Forge necesita tu decisión"
          : "El último intento terminó con avisos",
      description:
        ws.status === "waiting_for_user"
          ? (ws.summary ?? ws.error ?? "Revisa la sesión y decide cómo continuar.")
          : (ws.summary ?? "Revisa el resultado y pide cambios si es necesario."),
      nextActionKind: "ask_for_changes",
      nextActionLabel: "Continuar o pedir cambios",
      primaryUrl: SESSION_URL(ws.id),
      secondaryActions: secondary,
      warnings,
      advancedSummary,
    };
  }

  // 12. Session failed.
  if (ws && ws.status === "failed") {
    return {
      phase: "failed",
      title: "La sesión falló",
      description: ws.error ?? ws.summary ?? "Ocurrió un error. Revisa el detalle avanzado.",
      nextActionKind: "recover",
      nextActionLabel: "Reintentar",
      primaryUrl: SESSION_URL(ws.id),
      secondaryActions: secondary,
      warnings,
      advancedSummary,
    };
  }

  // 13. Session completed but nothing beyond → working/finished with next step.
  if (ws && ws.status === "completed") {
    return {
      phase: "working",
      title: "Forge ha terminado de trabajar",
      description:
        ws.summary ??
        "La sesión terminó. Prepara el preview DEV o continúa con la revisión.",
      nextActionKind: "prepare_production",
      nextActionLabel: "Continuar en la sesión",
      primaryUrl: SESSION_URL(ws.id),
      secondaryActions: secondary,
      warnings,
      advancedSummary,
    };
  }

  // 14. No work session yet → idea.
  return {
    phase: "idea",
    title: "Empieza con una idea",
    description:
      project?.name
        ? `Describe qué quieres que Forge construya en ${project.name}.`
        : "Describe qué quieres que Forge construya.",
    nextActionKind: "work_on_this",
    nextActionLabel: "Escribir una idea",
    primaryUrl: project ? `/projects/${project.id}` : undefined,
    secondaryActions: secondary,
    warnings,
    advancedSummary,
  };
}
