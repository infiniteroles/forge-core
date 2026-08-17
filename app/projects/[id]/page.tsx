import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { InstructionForm } from "@/components/InstructionForm";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { ProjectArchiveButton } from "@/components/ProjectArchiveButton";
import { AskPlannerButton } from "@/components/AskPlannerButton";
import { AgentRunCard } from "@/components/AgentRunCard";
import { TaskCard } from "@/components/TaskCard";
import { RepositoryPanel } from "@/components/RepositoryPanel";

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
      tasks: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });

  if (!project) notFound();

  const linkedIssueCount = project.tasks.filter(
    (task) => task.githubIssueNumber != null
  ).length;

  const linkedBranchCount = project.tasks.filter(
    (task) => task.githubBranchName != null
  ).length;

  const planCommitCount = project.tasks.filter(
    (task) => task.githubPlanCommitSha != null
  ).length;

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
          </div>
        </div>

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
              </p>
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {project.tasks.map((task) => (
                  <TaskCard key={task.id} task={task} />
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
