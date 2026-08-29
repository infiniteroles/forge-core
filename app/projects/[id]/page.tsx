import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { InstructionForm } from "@/components/InstructionForm";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { ProjectArchiveButton } from "@/components/ProjectArchiveButton";
import { ProjectDeleteButton } from "@/components/ProjectDeleteButton";
import { summarizeProjectAgents } from "@/lib/agents/summary";
import { getAgentSkill } from "@/lib/agents/skills";
import { Icon } from "@/components/Icon";
import { AskPlannerButton } from "@/components/AskPlannerButton";
import { AgentRunCard } from "@/components/AgentRunCard";
import { TaskCard } from "@/components/TaskCard";
import { RepositoryPanel } from "@/components/RepositoryPanel";
import { IdeaForm } from "@/components/IdeaForm";
import { MvpFlowPanel } from "@/components/mvp-flow/MvpFlowPanel";
import { computeMvpFlow } from "@/lib/mvp-flow/flow-state";
import type { LatestWorkSessionSummary } from "@/components/TaskCard";
import type { TaskProductionReadinessData } from "@/components/TaskProductionReadiness";
import type { TaskPromotionData } from "@/components/TaskProductionPromotion";
import { parseBuilderProposalOutput } from "@/lib/llm/builder-proposal";
import type { BuilderProposalSummary } from "@/components/BuilderProposalActions";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function ProjectDetailPage({ params }: Props) {
  if (!(await getSession())) redirect("/login");

  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      instructions: { orderBy: { createdAt: "desc" } },
      agentRuns: {
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { _count: { select: { tasks: true } } },
      },
      activityLogs: { orderBy: { createdAt: "desc" }, take: 50 },
      previewDeployments: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          previewUrl: true,
          error: true,
          workSessionId: true,
        },
      },
      productionReadinessReviews: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          taskId: true,
          workSessionId: true,
          status: true,
          recommendation: true,
          blockingReasons: true,
          diagnostics: true,
        },
      },
      productionPromotions: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          taskId: true,
          workSessionId: true,
          status: true,
          prNumber: true,
          mergeCommitSha: true,
          summary: true,
          error: true,
          jobRun: {
            select: {
              id: true,
              status: true,
              currentStage: true,
              progressPercent: true,
            },
          },
        },
      },
      tasks: {
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: {
          agentRuns: {
            where: { agentName: "builder-proposal" },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  if (!project) notFound();

  const workSessions = await prisma.workSession.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const latestWorkSessionByTask = new Map<string, LatestWorkSessionSummary>();
  for (const ws of workSessions) {
    if (!ws.taskId) continue;
    if (latestWorkSessionByTask.has(ws.taskId)) continue;
    const result =
      typeof ws.result === "object" && ws.result !== null
        ? (ws.result as {
            prUrl?: string | null;
            builderCommitUrl?: string | null;
            checks?: { status?: string; summary?: string | null } | null;
            previewId?: string | null;
            previewUrl?: string | null;
            previewStatus?: string | null;
          })
        : null;
    latestWorkSessionByTask.set(ws.taskId, {
      id: ws.id,
      status: ws.status,
      summary: ws.summary,
      result: {
        prUrl: result?.prUrl ?? null,
        builderCommitUrl: result?.builderCommitUrl ?? null,
        checks: result?.checks
          ? { status: result.checks.status ?? "skipped", summary: result.checks.summary ?? null }
          : null,
        previewId: result?.previewId ?? null,
        previewUrl: result?.previewUrl ?? null,
        previewStatus: result?.previewStatus ?? null,
      },
    });
  }

  const latestWs = workSessions[0] ?? null;

  const mvpFlow = computeMvpFlow({
    project: {
      id: project.id,
      name: project.name,
      productionUrl: project.productionUrl,
    },
    task: latestWs?.taskId
      ? (() => {
          const t = project.tasks.find((x) => x.id === latestWs.taskId);
          return t
            ? {
                id: t.id,
                title: t.title,
                githubPrNumber: t.githubPrNumber,
                githubPrUrl: t.githubPrUrl,
                githubBranchName: t.githubBranchName,
              }
            : null;
        })()
      : null,
    workSession: latestWs
      ? {
          id: latestWs.id,
          status: latestWs.status,
          summary: latestWs.summary,
          error: latestWs.error,
          requestedChanges: latestWs.requestedChanges,
          iterationNumber: latestWs.iterationNumber,
        }
      : null,
    preview: (() => {
      const match = latestWs
        ? project.previewDeployments.find((p) => p.workSessionId === latestWs.id)
        : null;
      const p = match ?? project.previewDeployments[0];
      return p
        ? { status: p.status, previewUrl: p.previewUrl, error: p.error }
        : null;
    })(),
    readiness:
      project.productionReadinessReviews[0] ?? null,
    promotion: (() => {
      const match = latestWs
        ? project.productionPromotions.find((p) => p.workSessionId === latestWs.id)
        : null;
      const pr = match ?? project.productionPromotions[0];
      return pr
        ? {
            status: pr.status,
            error: pr.error,
            jobStatus: pr.jobRun?.status ?? null,
            prNumber: pr.prNumber,
            mergeCommitSha: pr.mergeCommitSha,
          }
        : null;
    })(),
  });

  const linkedIssueCount = project.tasks.filter(
    (task) => task.githubIssueNumber != null
  ).length;

  const linkedBranchCount = project.tasks.filter(
    (task) => task.githubBranchName != null
  ).length;

  const planCommitCount = project.tasks.filter(
    (task) => task.githubPlanCommitSha != null
  ).length;

  const prCount = project.tasks.filter(
    (task) => task.githubPrNumber != null
  ).length;

  const builderProposalCount = project.tasks.filter(
    (task) => task.agentRuns.length > 0
  ).length;

  const builderCommitCount = project.tasks.filter(
    (task) => task.githubBuilderCommitSha != null
  ).length;

  const prReviewCount = project.tasks.filter(
    (task) => task.githubPrReviewRunId != null
  ).length;

  const prReadyReviewCount = project.tasks.filter(
    (task) => task.githubPrReviewReadyForReview === true
  ).length;

  const prMarkedReadyCount = project.tasks.filter(
    (task) => task.githubPrMarkedReadyAt != null
  ).length;

  const devPreviewCount = project.previewDeployments.length;
  const readyPreviewCount = project.previewDeployments.filter(
    (p) => p.status === "ready"
  ).length;

  // Agentes especializados que han trabajado en este proyecto.
  const agentSummary = summarizeProjectAgents(
    project.activityLogs,
    project.agentRuns
  );

  // Production readiness: latest review per task.
  function readinessCause(review: {
    diagnostics: unknown;
    blockingReasons: unknown;
  }): string | null {
    const diag = review.diagnostics as Record<string, unknown> | null;
    if (diag) {
      const items = [
        ...(Array.isArray(diag.blocking) ? (diag.blocking as { source?: string }[]) : []),
        ...(Array.isArray(diag.needsChanges) ? (diag.needsChanges as { source?: string }[]) : []),
      ];
      const source = items.find((d) => d?.source)?.source ?? null;
      const map: Record<string, string> = {
        pr_review: "PR review",
        preview: "preview",
        checks: "checks",
        files: "files",
        pr: "PR draft",
        builder: "builder",
        tests: "tests",
      };
      return source ? (map[source] ?? source) : null;
    }
    const blocking = Array.isArray(review.blockingReasons)
      ? review.blockingReasons.filter((b): b is string => typeof b === "string")
      : [];
    if (blocking.some((b) => /revisión automática|PR Review|needs_changes/i.test(b))) {
      return "PR review";
    }
    return null;
  }

  const productionByTask = new Map<string, TaskProductionReadinessData>();
  for (const review of project.productionReadinessReviews) {
    if (!review.taskId) continue;
    if (productionByTask.has(review.taskId)) continue;
    productionByTask.set(review.taskId, {
      reviewId: review.id,
      status: review.status,
      recommendation: review.recommendation,
      workSessionId: review.workSessionId,
      taskId: review.taskId,
      cause: readinessCause(review),
    });
  }
  const productionReadyCount = project.productionReadinessReviews.filter(
    (r) => r.status === "ready"
  ).length;
  const productionApprovedCount = project.productionReadinessReviews.filter(
    (r) => r.status === "approved"
  ).length;
  const productionBlockedCount = project.productionReadinessReviews.filter(
    (r) => r.status === "blocked" || r.status === "needs_changes"
  ).length;

  // Production promotion: latest promotion per task.
  const promotionByTask = new Map<string, TaskPromotionData>();
  for (const p of project.productionPromotions) {
    if (!p.taskId) continue;
    if (promotionByTask.has(p.taskId)) continue;
    const readiness = productionByTask.get(p.taskId);
    promotionByTask.set(p.taskId, {
      promotionId: p.id,
      status: p.status,
      prNumber: p.prNumber,
      mergeCommitSha: p.mergeCommitSha,
      summary: p.summary,
      error: p.error,
      reviewId: readiness?.reviewId ?? null,
      workSessionId: readiness?.workSessionId ?? p.workSessionId ?? null,
      jobRunId: p.jobRun?.id ?? null,
      jobStatus: p.jobRun?.status ?? null,
      jobStage: p.jobRun?.currentStage ?? null,
      jobProgress: p.jobRun?.progressPercent ?? null,
      readinessApproved:
        readiness?.status === "approved" &&
        readiness?.recommendation === "ready_for_production",
    });
  }
  const promotionsReadyCount = project.productionPromotions.filter(
    (p) => p.status === "ready_to_promote"
  ).length;
  const promotionsCompletedCount = project.productionPromotions.filter(
    (p) => p.status === "completed"
  ).length;
  const promotionsFailedCount = project.productionPromotions.filter(
    (p) => p.status === "failed" || p.status === "preflight_failed"
  ).length;

  function builderSummary(
    run: {
      id: string;
      status: string;
      output: string | null;
      createdAt: Date;
    } | null
  ): BuilderProposalSummary | null {
    if (!run) return null;
    const parsed = parseBuilderProposalOutput(run.output);
    return {
      agentRunId: run.id,
      status: run.status,
      summary: parsed?.summary ?? null,
      recommendedApproach: parsed?.recommended_approach ?? null,
      complexity: parsed?.estimated_complexity ?? null,
      safeToAttempt: parsed?.safe_to_attempt_next ?? null,
      createdAt: run.createdAt.toISOString(),
    };
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {project.name}
              </h1>
              <StatusBadge status={project.status} />
            </div>
            <p className="mt-1 font-mono text-sm text-text-dim">
              /{project.slug}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/projects/${project.id}/edit`}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-black transition hover:opacity-90"
            >
              Edit
            </Link>
            {!project.archivedAt ? (
              <ProjectArchiveButton
                projectId={project.id}
                projectName={project.name}
              />
            ) : null}
            <ProjectDeleteButton
              projectId={project.id}
              projectName={project.name}
            />
          </div>
        </div>

        <MvpFlowPanel flow={mvpFlow} />

        {agentSummary.length > 0 ? (
          <div className="rounded-xl border border-border bg-surface p-4">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-text-dim">
              Agentes del proyecto
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {agentSummary.map((a) => (
                <div
                  key={a.role}
                  title={`Skill: ${getAgentSkill(a.role).name}`}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                >
                  <Icon name={a.iconName} className="text-[16px] leading-none text-accent" />
                  <span className="text-neutral-100">{a.label}</span>
                  <span className="text-text-dim">
                    {a.stages > 0 ? `${a.stages} etapas` : ""}
                    {a.stages > 0 && a.runs > 0 ? " · " : ""}
                    {a.runs > 0 ? `${a.runs} análisis` : ""}
                  </span>
                  <span className="ml-1 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
                    {getAgentSkill(a.role).name}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {project.archivedAt ? (
          <div className="rounded-lg border border-neutral-700 bg-surface px-4 py-3 text-sm text-text-dim">
            Archived on {project.archivedAt.toLocaleDateString()}
          </div>
        ) : null}

        {project.description ? (
          <p className="max-w-3xl text-sm text-neutral-300">
            {project.description}
          </p>
        ) : null}

        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-dim">
            Overview
          </h2>
          <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <OverviewItem
              label="DEV URL"
              value={project.devUrl}
              href={project.devUrl}
            />
            <OverviewItem
              label="Production URL"
              value={project.productionUrl}
              href={project.productionUrl}
            />
            <OverviewItem
              label="Repo URL"
              value={project.repoUrl}
              href={project.repoUrl}
            />
            <OverviewItem
              label="Target DEV domain"
              value={project.targetDevDomain}
            />
            <OverviewItem
              label="Preferred stack"
              value={project.preferredStack}
            />
            <OverviewItem
              label="Repository full name"
              value={project.repositoryFullName}
            />
          </dl>
          {project.notes ? (
            <div className="mt-4 border-t border-border pt-4">
              <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                Notes
              </dt>
              <dd className="mt-1 whitespace-pre-wrap text-sm text-neutral-200">
                {project.notes}
              </dd>
            </div>
          ) : null}
        </div>

        <RepositoryPanel project={project} />

        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled
            title="Coming soon"
            className="cursor-not-allowed rounded-md border border-border bg-surface px-4 py-2 text-sm text-text-dim opacity-60"
          >
            Prepare DEV
          </button>
          <AskPlannerButton projectId={project.id} />
          <button
            disabled
            title="Coming soon"
            className="cursor-not-allowed rounded-md border border-border bg-surface px-4 py-2 text-sm text-text-dim opacity-60"
          >
            Prepare PRO
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="rounded-xl border border-border bg-surface p-6">
              <h2 className="text-lg font-semibold tracking-tight">
                Instructions
              </h2>
              <p className="mt-1 text-sm text-text-dim">
                Capture what needs to happen next.
              </p>

              <div className="mt-5">
                <InstructionForm projectId={project.id} />
              </div>

              <div className="mt-6 flex flex-col gap-3">
                {project.instructions.length === 0 ? (
                  <p className="text-sm text-text-dim">
                    No instructions yet.
                  </p>
                ) : (
                  project.instructions.map((instruction) => (
                    <div
                      key={instruction.id}
                      className="rounded-lg border border-border bg-background p-4"
                    >
                      <p className="whitespace-pre-wrap text-sm text-neutral-200">
                        {instruction.content}
                      </p>
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-text-dim">
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">
                          {instruction.source}
                        </span>
                        <span
                          className={`rounded bg-surface-2 px-1.5 py-0.5 font-mono ${
                            instruction.status === "pending"
                              ? "text-amber-300"
                              : "text-emerald-300"
                          }`}
                        >
                          {instruction.status}
                        </span>
                        <span>{instruction.createdAt.toLocaleString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-border bg-surface p-6">
              <h2 className="text-lg font-semibold tracking-tight">
                Agent runs
              </h2>
              <p className="mt-1 text-sm text-text-dim">
                Executions of planning and automation agents.
              </p>
              <div className="mt-5 flex flex-col gap-3">
                {project.agentRuns.length === 0 ? (
                  <p className="text-sm text-text-dim">
                    No agent runs yet.
                  </p>
                ) : (
                  project.agentRuns.map((run) => (
                    <AgentRunCard
                      key={run.id}
                      run={run}
                      taskCount={run._count.tasks}
                    />
                  ))
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="rounded-xl border border-border bg-surface p-6">
              <h2 className="text-lg font-semibold tracking-tight">Activity</h2>
              <div className="mt-5">
                <ActivityTimeline activities={project.activityLogs} />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold tracking-tight">New idea</h2>
          <p className="mt-1 text-sm text-text-dim">
            Tell Forge what to build or change. It will work in DEV autonomously
            and prepare a pull request for you to review.
          </p>
          <div className="mt-4">
            <IdeaForm projectId={project.id} />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6">
          <h2 className="text-lg font-semibold tracking-tight">Backlog</h2>
          <p className="mt-1 text-sm text-text-dim">
            Tasks derived from Planner runs and manual entries.
          </p>
          {project.repositoryFullName ? (
            <p className="mt-3 rounded-md bg-background px-3 py-2 text-xs text-text-dim">
              Repository context:{" "}
              <span className="text-neutral-300">
                {project.repositoryFullName}
              </span>
              {project.repositoryDefaultBranch ? (
                <>
                  {" · "}
                  <span className="font-mono">
                    {project.repositoryDefaultBranch}
                  </span>
                </>
              ) : null}
              {project.repositoryVisibility ? (
                <>
                  {" · "}
                  <span>{project.repositoryVisibility}</span>
                </>
              ) : null}
            </p>
          ) : null}
          {project.tasks.length === 0 ? (
            <p className="mt-5 text-sm text-text-dim">No tasks yet.</p>
          ) : (
            <>
              <p className="mt-3 text-xs text-text-dim">
                GitHub issues linked: {linkedIssueCount} / {project.tasks.length}{" "}
                tasks
              </p>
              <p className="mt-1 text-xs text-text-dim">
                GitHub branches linked: {linkedBranchCount} / {project.tasks.length}{" "}
                tasks
              </p>
              <p className="mt-1 text-xs text-text-dim">
                Plan commits created: {planCommitCount} / {project.tasks.length}{" "}
                tasks
              </p>              <p className="mt-1 text-xs text-text-dim">
                Draft PRs opened: {prCount} / {project.tasks.length} tasks
              </p>              <p className="mt-1 text-xs text-text-dim">
                Builder proposals: {builderProposalCount} / {project.tasks.length}{" "}
                tasks
              </p>              <p className="mt-1 text-xs text-text-dim">
                Builder commits: {builderCommitCount} / {project.tasks.length}{" "}
                tasks
              </p>              <p className="mt-1 text-xs text-text-dim">
                PR reviews: {prReviewCount} / {project.tasks.length} tasks
              </p>              <p className="mt-1 text-xs text-text-dim">
                PRs ready for review: {prReadyReviewCount} / {project.tasks.length}{" "}
                tasks
              </p>              <p className="mt-1 text-xs text-text-dim">
                PRs marked ready: {prMarkedReadyCount} / {project.tasks.length}{" "}
                tasks
              </p>              <p className="mt-1 text-xs text-text-dim">
                DEV previews: {devPreviewCount} · Ready previews:{" "}
                {readyPreviewCount}
              </p>              <p className="mt-1 text-xs text-text-dim">
                Production ready: {productionReadyCount} · Approved:{" "}
                {productionApprovedCount} · Blocked: {productionBlockedCount}
              </p>              <p className="mt-1 text-xs text-text-dim">
                Promotions ready: {promotionsReadyCount} · Promotions completed:{" "}
                {promotionsCompletedCount} · Promotions failed: {promotionsFailedCount}
              </p>              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {project.tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    repositoryLinked={project.repositoryFullName != null}
                    builderProposal={builderSummary(task.agentRuns[0])}
                    workSession={latestWorkSessionByTask.get(task.id) ?? null}
                    production={productionByTask.get(task.id) ?? null}
                    promotion={promotionByTask.get(task.id) ?? null}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function OverviewItem({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null;
  href?: string | null;
}) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
        {label}
      </dt>
      <dd className="mt-0.5 break-all text-neutral-200">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="transition hover:text-accent"
          >
            {value}
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}
