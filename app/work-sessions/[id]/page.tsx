import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { IterationActions } from "@/components/IterationActions";
import { RunSessionChecksButton } from "@/components/RunSessionChecksButton";
import { DevPreviewPanel, type DevPreviewData } from "@/components/DevPreviewPanel";
import {
  ProductionReadinessPanel,
  type ProductionReadinessData,
} from "@/components/ProductionReadinessPanel";
import {
  ProductionPromotionPanel,
  type ProductionPromotionData,
} from "@/components/ProductionPromotionPanel";
import type { JobRunPublicData } from "@/lib/jobs/types";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

const STATUS_TONE: Record<string, string> = {
  queued: "bg-neutral-700/40 text-neutral-300",
  running: "bg-sky-500/15 text-sky-300",
  waiting_for_user: "bg-amber-500/15 text-amber-300",
  completed: "bg-emerald-500/15 text-emerald-300",
  completed_with_warnings: "bg-amber-500/15 text-amber-300",
  failed: "bg-red-500/15 text-red-300",
  cancelled: "bg-neutral-700/40 text-neutral-400",
};

/**
 * Extracts the safe runtime-env summary from a PreviewDeployment's metadata.
 * Only key names are surfaced — never values.
 */
function previewEnvFromMetadata(metadata: unknown): DevPreviewData["env"] {
  if (!metadata || typeof metadata !== "object") return null;
  const meta = metadata as Record<string, unknown>;
  const env = meta.env;
  if (!env || typeof env !== "object") return null;
  const e = env as Record<string, unknown>;
  const asStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  return {
    mode: typeof e.mode === "string" ? e.mode : null,
    configured: typeof e.configured === "boolean" ? e.configured : null,
    keys: asStringArray(e.keys),
    skipped: asStringArray(e.skipped),
    unavailable: asStringArray(e.unavailable),
    error: typeof e.error === "string" ? e.error : null,
  };
}

function blockingReasonsFrom(review: {
  blockingReasons: unknown;
}): string[] {
  if (!Array.isArray(review.blockingReasons)) return [];
  return review.blockingReasons.filter((r): r is string => typeof r === "string");
}

function diagnosticsFrom(review: {
  diagnostics: unknown;
  prSummary: unknown;
}): ProductionReadinessData["diagnostics"] {
  if (!review.diagnostics || typeof review.diagnostics !== "object") {
    // Fallback: derive from prSummary + blockingReasons when no diagnostics yet.
    const pr = review.prSummary as Record<string, unknown> | null;
    const rec = pr?.reviewRecommendation;
    if (rec === "needs_changes") {
      return {
        blocking: [],
        needsChanges: [
          {
            source: "pr_review",
            reason: "La última PR Review pide cambios (needs_changes).",
            severity: "needs_changes",
          },
        ],
        warnings: [],
        positiveSignals: [],
      };
    }
    return null;
  }
  const d = review.diagnostics as Record<string, unknown>;
  return {
    blocking: Array.isArray(d.blocking) ? (d.blocking as never[]) : [],
    needsChanges: Array.isArray(d.needsChanges) ? (d.needsChanges as never[]) : [],
    warnings: Array.isArray(d.warnings) ? (d.warnings as never[]) : [],
    positiveSignals: Array.isArray(d.positiveSignals)
      ? (d.positiveSignals as string[])
      : [],
  };
}

function productionReadinessData(review: {
  id: string;
  status: string;
  recommendation: string | null;
  riskLevel: string | null;
  summary: string | null;
  blockingReasons: unknown;
  diagnostics: unknown;
  prSummary: unknown;
  previewSummary: unknown;
  filesSummary: unknown;
  humanNotes: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  updatedAt: Date;
}): ProductionReadinessData {
  const pr = review.prSummary as Record<string, unknown> | null;
  const preview = review.previewSummary as Record<string, unknown> | null;
  const files = review.filesSummary as Record<string, unknown> | null;
  const testsPresent =
    Array.isArray(files?.paths) &&
    (files!.paths as string[]).some(
      (p) =>
        /(^|\/)(__tests__|test|tests)(\/|$)/.test(p) ||
        /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(p)
    );
  return {
    id: review.id,
    status: review.status,
    recommendation: review.recommendation,
    riskLevel: review.riskLevel,
    summary: review.summary,
    blockingReasons: blockingReasonsFrom(review),
    diagnostics: diagnosticsFrom(review),
    humanNotes: review.humanNotes,
    approvedBy: review.approvedBy,
    approvedAt: review.approvedAt ? review.approvedAt.toISOString() : null,
    rejectedAt: review.rejectedAt ? review.rejectedAt.toISOString() : null,
    prNumber: typeof pr?.prNumber === "number" ? pr.prNumber : null,
    prDraft: typeof pr?.draft === "boolean" ? (pr.draft as boolean) : null,
    prReviewRecommendation:
      typeof pr?.reviewRecommendation === "string"
        ? pr.reviewRecommendation
        : null,
    previewSource: typeof preview?.source === "string" ? (preview.source as string) : null,
    previewUrl: typeof preview?.previewUrl === "string" ? (preview.previewUrl as string) : null,
    testsPresent,
    lastEvaluatedAt: review.updatedAt.toISOString(),
  };
}

function productionPromotionData(promotion: {
  id: string;
  status: string;
  strategy: string;
  summary: string | null;
  error: string | null;
  prNumber: number | null;
  prUrl: string | null;
  branchName: string | null;
  baseBranch: string | null;
  mergeCommitSha: string | null;
  mergeMethod: string | null;
  preflightSummary: unknown;
  deploymentSummary: unknown;
  verificationSummary: unknown;
  requestedBy: string | null;
  requestedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
}): ProductionPromotionData {
  const pre = promotion.preflightSummary as Record<string, unknown> | null;
  const dep = promotion.deploymentSummary as Record<string, unknown> | null;
  const ver = promotion.verificationSummary as Record<string, unknown> | null;
  return {
    id: promotion.id,
    status: promotion.status,
    strategy: promotion.strategy,
    summary: promotion.summary,
    error: promotion.error,
    prNumber: promotion.prNumber,
    prUrl: promotion.prUrl,
    branchName: promotion.branchName,
    baseBranch: promotion.baseBranch,
    mergeCommitSha: promotion.mergeCommitSha,
    mergeMethod: promotion.mergeMethod,
    preflightSummary: pre
      ? {
          ok: Boolean(pre.ok),
          checks: Array.isArray(pre.checks) ? (pre.checks as never[]) : [],
          blockingReasons: Array.isArray(pre.blockingReasons)
            ? (pre.blockingReasons as string[])
            : [],
          warnings: Array.isArray(pre.warnings) ? (pre.warnings as string[]) : [],
        }
      : null,
    deploymentSummary: dep
      ? {
          mode: typeof dep.mode === "string" ? dep.mode : undefined,
          applicationUuid:
            typeof dep.applicationUuid === "string"
              ? dep.applicationUuid
              : undefined,
          resolvedBy:
            typeof dep.resolvedBy === "string" ? dep.resolvedBy : undefined,
          triggered:
            typeof dep.triggered === "boolean" ? dep.triggered : undefined,
          deploymentUuid:
            typeof dep.deploymentUuid === "string"
              ? dep.deploymentUuid
              : undefined,
          status: typeof dep.status === "string" ? dep.status : undefined,
          triggeredAt:
            typeof dep.triggeredAt === "string" ? dep.triggeredAt : undefined,
          live: typeof dep.live === "boolean" ? dep.live : undefined,
        }
      : null,
    verificationSummary: ver
      ? {
          ok: Boolean(ver.ok),
          prMerged: typeof ver.prMerged === "boolean" ? (ver.prMerged as boolean) : undefined,
          health: (ver.health ?? undefined) as
            | { url: string; status: number; ok: boolean }
            | undefined,
          expectedEndpoint: (ver.expectedEndpoint ?? null) as
            | { url: string; status: number; ok: boolean }
            | null
            | undefined,
        }
      : null,
    requestedBy: promotion.requestedBy,
    requestedAt: promotion.requestedAt ? promotion.requestedAt.toISOString() : null,
    startedAt: promotion.startedAt ? promotion.startedAt.toISOString() : null,
    completedAt: promotion.completedAt ? promotion.completedAt.toISOString() : null,
    failedAt: promotion.failedAt ? promotion.failedAt.toISOString() : null,
    createdAt: promotion.createdAt.toISOString(),
  };
}

function jobRunData(job: {
  id: string;
  type: string;
  status: string;
  resourceType: string | null;
  resourceId: string | null;
  projectId: string | null;
  taskId: string | null;
  workSessionId: string | null;
  currentStage: string | null;
  progressPercent: number | null;
  summary: string | null;
  error: string | null;
  result: unknown;
  startedAt: Date | null;
  finishedAt: Date | null;
  failedAt: Date | null;
  cancelledAt: Date | null;
  lastHeartbeatAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): JobRunPublicData {
  return {
    id: job.id,
    type: job.type,
    status: job.status,
    resourceType: job.resourceType,
    resourceId: job.resourceId,
    projectId: job.projectId,
    taskId: job.taskId,
    workSessionId: job.workSessionId,
    currentStage: job.currentStage,
    progressPercent: job.progressPercent,
    summary: job.summary,
    error: job.error,
    result:
      job.result && typeof job.result === "object"
        ? (job.result as Record<string, unknown>)
        : null,
    startedAt: job.startedAt ? job.startedAt.toISOString() : null,
    finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
    failedAt: job.failedAt ? job.failedAt.toISOString() : null,
    cancelledAt: job.cancelledAt ? job.cancelledAt.toISOString() : null,
    lastHeartbeatAt: job.lastHeartbeatAt
      ? job.lastHeartbeatAt.toISOString()
      : null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}

export default async function WorkSessionPage({ params }: Props) {
  if (!(await getSession())) redirect("/login");

  const { id } = await params;

  const session = await prisma.workSession.findUnique({
    where: { id },
    include: {
      task: true,
      project: true,
      agentRuns: { orderBy: { createdAt: "desc" } },
      sessionChecks: { orderBy: { createdAt: "asc" } },
      previewDeployments: { orderBy: { createdAt: "desc" } },
      productionReadinessReviews: { orderBy: { createdAt: "desc" } },
      productionPromotions: {
        orderBy: { createdAt: "desc" },
        include: { jobRun: true },
      },
      parentWorkSession: { select: { id: true, status: true, mode: true, iterationNumber: true, objective: true } },
      childrenWorkSessions: {
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, mode: true, iterationNumber: true, objective: true, requestedChanges: true },
      },
    },
  });
  if (!session) notFound();

  const activity = await prisma.activityLog.findMany({
    where: { projectId: session.projectId },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  const result = (session.result ?? {}) as {
    issueUrl?: string | null;
    branchUrl?: string | null;
    planCommitUrl?: string | null;
    prUrl?: string | null;
    builderCommitUrl?: string | null;
    prReviewRecommendation?: string | null;
    filesChanged?: string[];
    warnings?: string[];
  };

  const tone = STATUS_TONE[session.status] ?? "bg-neutral-700/40 text-neutral-300";

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">Work Session</h1>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>
                {session.status}
              </span>
              <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-text-dim">
                {session.mode}
              </span>
            </div>
            <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm text-neutral-200">
              {session.objective}
            </p>
          </div>
          <Link
            href={`/projects/${session.projectId}`}
            className="text-sm text-text-dim transition hover:text-neutral-100"
          >
            ← Back to project
          </Link>
        </div>

        {session.task ? (
          <div className="rounded-lg border border-border bg-surface px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                Actions
              </span>
              <IterationActions
                taskId={session.task.id}
                workSessionId={session.id}
                compact
              />
            </div>
          </div>
        ) : null}

        <DevPreviewPanel
          workSessionId={session.id}
          preview={
            session.previewDeployments[0]
              ? {
                  id: session.previewDeployments[0].id,
                  status: session.previewDeployments[0].status,
                  provider: session.previewDeployments[0].provider,
                  previewUrl: session.previewDeployments[0].previewUrl,
                  domain: session.previewDeployments[0].domain,
                  branchName: session.previewDeployments[0].branchName,
                  commitSha: session.previewDeployments[0].commitSha,
                  lastDeploymentStatus: session.previewDeployments[0].lastDeploymentStatus,
                  lastCheckedAt: session.previewDeployments[0].lastCheckedAt
                    ? session.previewDeployments[0].lastCheckedAt.toISOString()
                    : null,
                  error: session.previewDeployments[0].error,
                  env: previewEnvFromMetadata(session.previewDeployments[0].metadata),
                }
              : null
          }
        />

        <ProductionReadinessPanel
          workSessionId={session.id}
          taskId={session.taskId}
          review={
            session.productionReadinessReviews[0]
              ? productionReadinessData(session.productionReadinessReviews[0])
              : null
          }
        />

        <ProductionPromotionPanel
          workSessionId={session.id}
          review={
            session.productionReadinessReviews[0]
              ? productionReadinessData(session.productionReadinessReviews[0])
              : null
          }
          promotion={
            session.productionPromotions[0]
              ? productionPromotionData(session.productionPromotions[0])
              : null
          }
          job={
            session.productionPromotions[0]?.jobRun
              ? jobRunData(session.productionPromotions[0].jobRun)
              : null
          }
        />

        {session.requestedChanges || session.iterationNumber > 1 ? (
          <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <span className="text-text-dim">
                Iteration{" "}
                <span className="font-mono text-neutral-200">
                  #{session.iterationNumber}
                </span>
                {session.mode ? (
                  <span className="ml-1 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-text-dim">
                    {session.mode}
                  </span>
                ) : null}
              </span>
              {session.parentWorkSession ? (
                <span className="text-text-dim">
                  Parent:{" "}
                  <Link
                    href={`/work-sessions/${session.parentWorkSession.id}`}
                    className="text-accent transition hover:underline"
                  >
                    #{session.parentWorkSession.iterationNumber} ({session.parentWorkSession.status})
                  </Link>
                </span>
              ) : null}
              {session.childrenWorkSessions.length > 0 ? (
                <span className="text-text-dim">
                  Children:{" "}
                  {session.childrenWorkSessions.map((c, i) => (
                    <span key={c.id}>
                      {i > 0 ? ", " : ""}
                      <Link
                        href={`/work-sessions/${c.id}`}
                        className="text-accent transition hover:underline"
                      >
                        #{c.iterationNumber} ({c.status})
                      </Link>
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
            {session.requestedChanges ? (
              <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-200">
                <span className="font-semibold text-neutral-100">Requested changes: </span>
                {session.requestedChanges}
              </p>
            ) : null}
          </div>
        ) : null}

        {session.currentStage ? (
          <div className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-text-dim">
            Current stage: <span className="font-mono text-neutral-200">{session.currentStage}</span>
            {session.startedAt ? (
              <>
                {" · "}Started {session.startedAt.toLocaleString()}
              </>
            ) : null}
            {session.finishedAt ? (
              <>
                {" · "}Finished {session.finishedAt.toLocaleString()}
              </>
            ) : null}
          </div>
        ) : null}

        {session.error ? (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {session.error}
          </div>
        ) : null}

        {session.summary ? (
          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-dim">
              Resultado
            </h2>
            <pre className="mt-3 whitespace-pre-wrap text-sm text-neutral-200">
              {session.summary}
            </pre>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-dim">
              Artefactos
            </h2>
            <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 text-sm">
              <LinkRow label="Task" href={session.task ? `/tasks/${session.task.id}/edit` : null}>
                {session.task ? session.task.title : "—"}
              </LinkRow>
              <LinkRow label="Issue" href={result.issueUrl ?? null}>
                {result.issueUrl ?? "—"}
              </LinkRow>
              <LinkRow label="Branch" href={result.branchUrl ?? null}>
                {result.branchUrl ?? "—"}
              </LinkRow>
              <LinkRow label="Plan commit" href={result.planCommitUrl ?? null}>
                {result.planCommitUrl ?? "—"}
              </LinkRow>
              <LinkRow label="Pull request" href={result.prUrl ?? null}>
                {result.prUrl ?? "—"}
              </LinkRow>
              <LinkRow label="Builder commit" href={result.builderCommitUrl ?? null}>
                {result.builderCommitUrl ?? "—"}
              </LinkRow>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  PR review recommendation
                </dt>
                <dd className="mt-0.5 text-neutral-200">
                  {result.prReviewRecommendation ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  Files changed
                </dt>
                <dd className="mt-0.5 text-neutral-200">
                  {result.filesChanged && result.filesChanged.length > 0
                    ? result.filesChanged.join(", ")
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  Warnings
                </dt>
                <dd className="mt-0.5 text-neutral-200">
                  {result.warnings && result.warnings.length > 0
                    ? result.warnings.join(" | ")
                    : "—"}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-dim">
              Agent runs
            </h2>
            <div className="mt-4 flex flex-col gap-3">
              {session.agentRuns.length === 0 ? (
                <p className="text-sm text-text-dim">No agent runs yet.</p>
              ) : (
                session.agentRuns.map((run) => (
                  <div key={run.id} className="rounded-lg border border-border bg-background p-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-neutral-200">{run.agentName ?? "?"}</span>
                      <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-text-dim">
                        {run.status}
                      </span>
                      <span className="text-[11px] text-text-dim">
                        {run.createdAt.toLocaleString()}
                      </span>
                    </div>
                    {run.output ? (
                      <pre className="mt-2 max-h-40 overflow-auto rounded bg-background p-2 text-[11px] text-neutral-400">
                        {run.output.slice(0, 400)}
                        {run.output.length > 400 ? "…" : ""}
                      </pre>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {session.sessionChecks.length > 0 ? (
          <div className="rounded-xl border border-border bg-surface p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-text-dim">
                Checks
              </h2>
              <RunSessionChecksButton workSessionId={session.id} />
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {session.sessionChecks.map((check) => (
                <div key={check.id} className="rounded-lg border border-border bg-background p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-neutral-200">{check.name}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
                        check.status === "passed"
                          ? "bg-emerald-500/10 text-emerald-300"
                          : check.status === "failed" || check.status === "timeout"
                            ? "bg-red-500/10 text-red-300"
                            : check.status === "running"
                              ? "bg-sky-500/10 text-sky-300"
                              : "bg-neutral-700/40 text-neutral-300"
                      }`}
                    >
                      {check.status}
                    </span>
                    <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-text-dim">
                      {check.command}
                    </code>
                    {typeof check.exitCode === "number" ? (
                      <span className="font-mono text-[11px] text-text-dim">
                        exit {check.exitCode}
                      </span>
                    ) : null}
                    {typeof check.durationMs === "number" && check.durationMs > 0 ? (
                      <span className="text-[11px] text-text-dim">
                        {check.durationMs} ms
                      </span>
                    ) : null}
                  </div>
                  {check.summary ? (
                    <p className="mt-1.5 text-xs text-neutral-300">{check.summary}</p>
                  ) : null}
                  {check.stdoutTail ? (
                    <pre className="mt-2 max-h-28 overflow-auto rounded bg-background p-2 text-[11px] text-neutral-400">
                      {check.stdoutTail}
                    </pre>
                  ) : null}
                  {check.stderrTail ? (
                    <pre className="mt-1 max-h-28 overflow-auto rounded bg-red-500/5 p-2 text-[11px] text-red-300/80">
                      {check.stderrTail}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-dim">
            Activity
          </h2>
          <div className="mt-4">
            <ActivityTimeline activities={activity} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function LinkRow({
  label,
  href,
  children,
}: {
  label: string;
  href: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
        {label}
      </dt>
      <dd className="mt-0.5 break-all text-neutral-200">
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="text-accent transition hover:underline">
            {children}
          </a>
        ) : (
          children
        )}
      </dd>
    </div>
  );
}
