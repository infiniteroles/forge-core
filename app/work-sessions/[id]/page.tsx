import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { IterationActions } from "@/components/IterationActions";
import { RunSessionChecksButton } from "@/components/RunSessionChecksButton";

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
