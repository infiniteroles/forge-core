import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { MvpFlowState } from "@/lib/mvp-flow/flow-state";

/**
 * MVP flow panel (Fase 5.0). Shows, in one clear block:
 *   - current human state (phase + title + description)
 *   - the next recommended action (primary)
 *   - secondary actions
 *   - warnings
 *   - preview / production links
 *
 * Server-renderable: it never performs mutations — actions that are POST
 * (work on this, prepare production, approve, promote…) link to the page that
 * owns the real button (the work session or project page).
 */

const PHASE_TONE: Record<string, string> = {
  idea: "bg-neutral-700/40 text-neutral-200",
  working: "bg-sky-500/15 text-sky-300",
  preview_ready: "bg-emerald-500/15 text-emerald-300",
  changes_requested: "bg-amber-500/15 text-amber-300",
  ready_for_approval: "bg-emerald-500/15 text-emerald-300",
  approved: "bg-emerald-500/15 text-emerald-300",
  ready_to_promote: "bg-amber-500/15 text-amber-300",
  promoting: "bg-sky-500/15 text-sky-300",
  production_live: "bg-emerald-500/15 text-emerald-300",
  blocked: "bg-red-500/15 text-red-300",
  failed: "bg-red-500/15 text-red-300",
};

const PHASE_LABEL: Record<string, string> = {
  idea: "Idea",
  working: "Forge trabajando",
  preview_ready: "Preview listo",
  changes_requested: "Cambios solicitados",
  ready_for_approval: "Listo para aprobar",
  approved: "Aprobado",
  ready_to_promote: "Listo para promover",
  promoting: "Promoviendo",
  production_live: "En producción",
  blocked: "Requiere atención",
  failed: "Falló",
};

export function MvpFlowPanel({ flow }: { flow: MvpFlowState }) {
  const tone = PHASE_TONE[flow.phase] ?? "bg-neutral-700/40 text-neutral-200";
  const label = PHASE_LABEL[flow.phase] ?? flow.phase;

  const primaryIsExternal = flow.primaryUrl?.startsWith("http");

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}
        >
          {label}
        </span>
        <span className="text-sm font-semibold text-neutral-100">
          {flow.title}
        </span>
      </div>

      <p className="mt-2 max-w-3xl text-sm text-neutral-300">{flow.description}</p>

      {flow.nextActionKind !== "none" ? (
        <div className="mt-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">
            Next recommended action
          </div>
          <div className="mt-1.5">
            {flow.primaryUrl ? (
              <Link
                href={flow.primaryUrl}
                {...(primaryIsExternal
                  ? { target: "_blank", rel: "noreferrer" }
                  : {})}
                className="inline-flex items-center gap-2 rounded-full bg-m3-primary px-4 py-1.5 text-sm font-medium text-m3-on-primary transition hover:opacity-90"
              >
                {flow.nextActionLabel ?? flow.nextActionKind}
                {primaryIsExternal ? (
                  <Icon name="open_in_new" className="text-[16px] leading-none" />
                ) : null}
              </Link>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full border border-m3-outline-variant px-3.5 py-1.5 text-sm font-medium text-m3-primary">
                {flow.nextActionLabel ?? flow.nextActionKind}
              </span>
            )}
          </div>
        </div>
      ) : null}

      {flow.secondaryActions && flow.secondaryActions.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {flow.secondaryActions.map((a) =>
            a.url ? (
              <Link
                key={a.kind}
                href={a.url}
                {...(a.url.startsWith("http")
                  ? { target: "_blank", rel: "noreferrer" }
                  : {})}
                className="rounded-full border border-m3-outline-variant px-2.5 py-1 text-xs text-m3-on-surface-variant transition hover:bg-m3-surface-container-high hover:text-m3-on-surface"
              >
                {a.label}
              </Link>
            ) : (
              <span
                key={a.kind}
                className="rounded-full border border-m3-outline-variant px-2.5 py-1 text-xs text-m3-on-surface-variant"
              >
                {a.label}
              </span>
            )
          )}
        </div>
      ) : null}

      {flow.warnings && flow.warnings.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1 text-xs text-amber-300/90">
          {flow.warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <Icon name="warning" className="mt-[1px] shrink-0 text-[14px] leading-none" /> {w}
            </li>
          ))}
        </ul>
      ) : null}

      {(flow.advancedSummary?.previewUrl ||
        flow.advancedSummary?.promotionStatus ||
        flow.advancedSummary?.jobStatus ||
        flow.advancedSummary?.workerMode) ? (
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-3 text-[11px] text-text-dim">
          {flow.advancedSummary.previewUrl ? (
            <span>
              Preview:{" "}
              <a
                href={flow.advancedSummary.previewUrl}
                target="_blank"
                rel="noreferrer"
                className="text-accent hover:underline"
              >
                {flow.advancedSummary.previewUrl}
              </a>
            </span>
          ) : null}
          {flow.advancedSummary.promotionStatus ? (
            <span>Promotion: {flow.advancedSummary.promotionStatus}</span>
          ) : null}
          {flow.advancedSummary.jobStatus ? (
            <span>Job: {flow.advancedSummary.jobStatus}</span>
          ) : null}
          {flow.advancedSummary.workerMode ? (
            <span>Runner: {flow.advancedSummary.workerMode}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
