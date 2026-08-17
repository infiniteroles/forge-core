import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { TaskForm } from "@/components/TaskForm";
import { parseBuilderProposalOutput } from "@/lib/llm/builder-proposal";
import type { BuilderProposalOutput } from "@/lib/llm/builder-proposal";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditTaskPage({ params }: Props) {
  if (!(await getSession())) redirect("/login");

  const { id } = await params;

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      agentRuns: {
        where: { agentName: "builder-proposal" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  if (!task) notFound();

  const commitRun = await prisma.agentRun.findFirst({
    where: { taskId: task.id, agentName: "builder-commit" },
    orderBy: { createdAt: "desc" },
  });

  const builderRun = task.agentRuns[0] ?? null;
  const builderOutput = builderRun
    ? parseBuilderProposalOutput(builderRun.output)
    : null;

  return (
    <AppShell>
      <div className="max-w-xl">
        <Link
          href={`/projects/${task.projectId}`}
          className="text-sm text-text-dim transition hover:text-neutral-100"
        >
          ← Back to project
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Edit task
        </h1>
        <p className="mt-1 text-sm text-text-dim">
          Update the details of &ldquo;{task.title}&rdquo;.
        </p>

        {task.githubIssueNumber ? (
          <div className="mt-6 rounded-xl border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-dim">
              GitHub Issue
            </h2>
            <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  Number
                </dt>
                <dd className="mt-0.5 text-neutral-200">
                  #{task.githubIssueNumber}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  State
                </dt>
                <dd className="mt-0.5 font-mono text-neutral-200">
                  {task.githubIssueState ?? "—"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  URL
                </dt>
                <dd className="mt-0.5 break-all text-neutral-200">
                  {task.githubIssueUrl ? (
                    <a
                      href={task.githubIssueUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent transition hover:underline"
                    >
                      {task.githubIssueUrl}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  Last checked
                </dt>
                <dd className="mt-0.5 text-neutral-200">
                  {task.githubIssueLastCheckedAt
                    ? task.githubIssueLastCheckedAt.toLocaleString()
                    : "—"}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        {task.githubBranchName ? (
          <div className="mt-6 rounded-xl border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-dim">
              GitHub Branch
            </h2>
            <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  Name
                </dt>
                <dd className="mt-0.5 break-all font-mono text-neutral-200">
                  {task.githubBranchName}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  Base branch
                </dt>
                <dd className="mt-0.5 font-mono text-neutral-200">
                  {task.githubBaseBranch ?? "—"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  URL
                </dt>
                <dd className="mt-0.5 break-all text-neutral-200">
                  {task.githubBranchUrl ? (
                    <a
                      href={task.githubBranchUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent transition hover:underline"
                    >
                      {task.githubBranchUrl}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  Base SHA
                </dt>
                <dd className="mt-0.5 break-all font-mono text-neutral-200">
                  {task.githubBaseSha ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  Created at
                </dt>
                <dd className="mt-0.5 text-neutral-200">
                  {task.githubBranchCreatedAt
                    ? task.githubBranchCreatedAt.toLocaleString()
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  Last checked
                </dt>
                <dd className="mt-0.5 text-neutral-200">
                  {task.githubBranchLastCheckedAt
                    ? task.githubBranchLastCheckedAt.toLocaleString()
                    : "—"}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        {task.githubPlanCommitSha ? (
          <div className="mt-6 rounded-xl border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-dim">
              GitHub Plan Commit
            </h2>
            <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  Path
                </dt>
                <dd className="mt-0.5 break-all font-mono text-neutral-200">
                  {task.githubPlanPath ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  Commit SHA
                </dt>
                <dd className="mt-0.5 break-all font-mono text-neutral-200">
                  {task.githubPlanCommitSha}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  Commit URL
                </dt>
                <dd className="mt-0.5 break-all text-neutral-200">
                  {task.githubPlanCommitUrl ? (
                    <a
                      href={task.githubPlanCommitUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent transition hover:underline"
                    >
                      {task.githubPlanCommitUrl}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  Commit message
                </dt>
                <dd className="mt-0.5 break-all text-neutral-200">
                  {task.githubPlanCommitMessage ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  Committed at
                </dt>
                <dd className="mt-0.5 text-neutral-200">
                  {task.githubPlanCommittedAt
                    ? task.githubPlanCommittedAt.toLocaleString()
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  Last checked
                </dt>
                <dd className="mt-0.5 text-neutral-200">
                  {task.githubPlanLastCheckedAt
                    ? task.githubPlanLastCheckedAt.toLocaleString()
                    : "—"}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        {task.githubPrNumber ? (
          <div className="mt-6 rounded-xl border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-dim">
              GitHub Pull Request
            </h2>
            <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  Number
                </dt>
                <dd className="mt-0.5 text-neutral-200">
                  #{task.githubPrNumber}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  State
                </dt>
                <dd className="mt-0.5 font-mono text-neutral-200">
                  {task.githubPrState ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  Draft
                </dt>
                <dd className="mt-0.5 text-neutral-200">
                  {task.githubPrDraft == null ? "—" : task.githubPrDraft ? "Yes" : "No"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  Title
                </dt>
                <dd className="mt-0.5 break-all text-neutral-200">
                  {task.githubPrTitle ?? "—"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  URL
                </dt>
                <dd className="mt-0.5 break-all text-neutral-200">
                  {task.githubPrUrl ? (
                    <a
                      href={task.githubPrUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent transition hover:underline"
                    >
                      {task.githubPrUrl}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  Base branch
                </dt>
                <dd className="mt-0.5 font-mono text-neutral-200">
                  {task.githubPrBaseBranch ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  Head branch
                </dt>
                <dd className="mt-0.5 break-all font-mono text-neutral-200">
                  {task.githubPrHeadBranch ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  Created at
                </dt>
                <dd className="mt-0.5 text-neutral-200">
                  {task.githubPrCreatedAt
                    ? task.githubPrCreatedAt.toLocaleString()
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  Updated at
                </dt>
                <dd className="mt-0.5 text-neutral-200">
                  {task.githubPrUpdatedAt
                    ? task.githubPrUpdatedAt.toLocaleString()
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  Merged at
                </dt>
                <dd className="mt-0.5 text-neutral-200">
                  {task.githubPrMergedAt
                    ? task.githubPrMergedAt.toLocaleString()
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
                  Last checked
                </dt>
                <dd className="mt-0.5 text-neutral-200">
                  {task.githubPrLastCheckedAt
                    ? task.githubPrLastCheckedAt.toLocaleString()
                    : "—"}
                </dd>
              </div>
            </dl>
          </div>
        ) : null}

        {builderRun ? (
          <div
            id="builder-proposal"
            className="mt-6 rounded-xl border border-border bg-surface p-6"
          >
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-dim">
              Builder Proposal
            </h2>
            <p className="mt-1 text-xs text-text-dim">
              Last proposal from the Builder agent (read-only, no changes made).
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-text-dim">
              <span
                className={`rounded px-1.5 py-0.5 font-mono ${
                  builderRun.status === "completed"
                    ? "bg-emerald-500/10 text-emerald-300"
                    : builderRun.status === "completed_with_warnings"
                      ? "bg-amber-500/10 text-amber-300"
                      : "bg-red-500/10 text-red-300"
                }`}
              >
                {builderRun.status}
              </span>
              {builderRun.model ? (
                <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">
                  {builderRun.model}
                </span>
              ) : null}
              <span>{builderRun.createdAt.toLocaleString()}</span>
            </div>

            {builderRun.status !== "completed" && !builderOutput ? (
              <pre className="mt-4 overflow-x-auto rounded-lg bg-background p-4 text-xs text-neutral-300">
                {builderRun.output ?? "(no output)"}
              </pre>
            ) : null}

            {builderOutput ? (
              <BuilderProposalDetail output={builderOutput} />
            ) : null}
          </div>
        ) : null}

        {commitRun ? (
          <div
            id="builder-commit"
            className="mt-6 rounded-xl border border-border bg-surface p-6"
          >
            <h2 className="text-sm font-semibold uppercase tracking-wide text-text-dim">
              Builder Commit
            </h2>
            <p className="mt-1 text-xs text-text-dim">
              Last functional commit run by the Builder agent (read-only, applied
              only to the task branch).
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-text-dim">
              <span
                className={`rounded px-1.5 py-0.5 font-mono ${
                  commitRun.status === "completed"
                    ? "bg-emerald-500/10 text-emerald-300"
                    : commitRun.status === "completed_with_warnings"
                      ? "bg-amber-500/10 text-amber-300"
                      : "bg-red-500/10 text-red-300"
                }`}
              >
                {commitRun.status}
              </span>
              {commitRun.model ? (
                <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">
                  {commitRun.model}
                </span>
              ) : null}
              <span>{commitRun.createdAt.toLocaleString()}</span>
            </div>

            {commitRun.status === "failed" ? (
              <pre className="mt-4 overflow-x-auto rounded-lg bg-background p-4 text-xs text-neutral-300">
                {commitRun.output ?? "(no output)"}
              </pre>
            ) : null}

            {commitRun.status === "completed_with_warnings" ? (
              <BuilderCommitWarnings run={commitRun} />
            ) : null}

            {commitRun.status === "completed" ? (
              <BuilderCommitDetail run={commitRun} task={task} />
            ) : null}
          </div>
        ) : null}

        <div className="mt-8 rounded-xl border border-border bg-surface p-6">
          <TaskForm task={task} />
        </div>
      </div>
    </AppShell>
  );
}

function BuilderCommitWarnings({ run }: { run: { output: string | null } }) {
  const parsed = (() => {
    try {
      return JSON.parse(run.output ?? "{}");
    } catch {
      return null;
    }
  })();
  const reason: string = parsed?.reason ?? "Unknown warning";
  const violations: string[] = parsed?.violations ?? [];
  return (
    <div className="mt-4 flex flex-col gap-3">
      <p className="text-sm text-amber-300">{reason}</p>
      {violations.length > 0 ? (
        <ul className="flex list-disc flex-col gap-1 pl-4">
          {violations.map((v, i) => (
            <li key={i} className="text-sm text-neutral-300">
              {v}
            </li>
          ))}
        </ul>
      ) : null}
      {parsed?.raw ? (
        <pre className="overflow-x-auto rounded-lg bg-background p-4 text-xs text-neutral-300">
          {parsed.raw}
        </pre>
      ) : null}
    </div>
  );
}

function BuilderCommitDetail({
  run,
  task,
}: {
  run: { output: string | null };
  task: {
    githubBuilderCommitSha: string | null;
    githubBuilderCommitUrl: string | null;
    githubBuilderCommitMessage: string | null;
    githubBuilderCommittedAt: Date | null;
    githubBuilderLastCheckedAt: Date | null;
  };
}) {
  const parsed = (() => {
    try {
      return JSON.parse(run.output ?? "{}");
    } catch {
      return null;
    }
  })();

  const files: { path: string; operation: string; reason: string }[] =
    parsed?.files ?? [];
  const validationPlan: { command: string; purpose: string }[] =
    parsed?.validation_plan ?? [];
  const risks: string[] = parsed?.risks ?? [];
  const postCommitNotes: string[] = parsed?.post_commit_notes ?? [];

  return (
    <div className="mt-4 flex flex-col gap-4">
      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
            Summary
          </dt>
          <dd className="mt-0.5 text-neutral-200">
            {parsed?.summary ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
            Implementation notes
          </dt>
          <dd className="mt-0.5 text-neutral-200">
            {parsed?.implementation_notes ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
            Commit SHA
          </dt>
          <dd className="mt-0.5 break-all font-mono text-neutral-200">
            {task.githubBuilderCommitSha ?? "—"}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
            Commit URL
          </dt>
          <dd className="mt-0.5 break-all text-neutral-200">
            {task.githubBuilderCommitUrl ? (
              <a
                href={task.githubBuilderCommitUrl}
                target="_blank"
                rel="noreferrer"
                className="text-accent transition hover:underline"
              >
                {task.githubBuilderCommitUrl}
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
            Commit message
          </dt>
          <dd className="mt-0.5 break-all text-neutral-200">
            {task.githubBuilderCommitMessage ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
            Committed at
          </dt>
          <dd className="mt-0.5 text-neutral-200">
            {task.githubBuilderCommittedAt
              ? task.githubBuilderCommittedAt.toLocaleString()
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
            Last checked
          </dt>
          <dd className="mt-0.5 text-neutral-200">
            {task.githubBuilderLastCheckedAt
              ? task.githubBuilderLastCheckedAt.toLocaleString()
              : "—"}
          </dd>
        </div>
      </dl>

      <ProposalBlock title="Files changed">
        {files.length === 0 ? (
          <p className="text-sm text-text-dim">—</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {files.map((f, i) => (
              <li key={i} className="text-sm text-neutral-300">
                <span className="font-mono text-accent">{f.path}</span>
                <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-text-dim">
                  {f.operation}
                </span>
                <span className="text-text-dim"> — {f.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </ProposalBlock>

      <ProposalBlock title="Validation plan">
        {validationPlan.length === 0 ? (
          <p className="text-sm text-text-dim">—</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {validationPlan.map((c, i) => (
              <div key={i}>
                <code className="rounded bg-background px-2 py-1 font-mono text-xs text-neutral-200">
                  {c.command}
                </code>
                <p className="mt-0.5 text-xs text-text-dim">{c.purpose}</p>
              </div>
            ))}
          </div>
        )}
      </ProposalBlock>

      <ProposalBlock title="Risks">
        <ListOfStrings items={risks} />
      </ProposalBlock>

      <ProposalBlock title="Post-commit notes">
        <ListOfStrings items={postCommitNotes} />
      </ProposalBlock>
    </div>
  );
}

function BuilderProposalDetail({
  output,
}: {
  output: BuilderProposalOutput;
}) {
  return (
    <div className="mt-4 flex flex-col gap-4">
      <ProposalBlock title="Summary">
        <p className="whitespace-pre-wrap text-sm text-neutral-200">
          {output.summary}
        </p>
      </ProposalBlock>
      <ProposalBlock title="Understanding">
        <p className="whitespace-pre-wrap text-sm text-neutral-200">
          {output.understanding}
        </p>
      </ProposalBlock>
      <ProposalBlock title="Recommended approach">
        <p className="whitespace-pre-wrap text-sm text-neutral-200">
          {output.recommended_approach}
        </p>
      </ProposalBlock>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ProposalBlock title="Files to inspect">
          <ul className="flex flex-col gap-1.5">
            {output.files_to_inspect.map((f, i) => (
              <li key={i} className="text-sm text-neutral-300">
                <span className="font-mono text-accent">{f.path}</span>
                <span className="text-text-dim"> — {f.reason}</span>
              </li>
            ))}
          </ul>
        </ProposalBlock>
        <ProposalBlock title="Files likely to modify">
          <ul className="flex flex-col gap-1.5">
            {output.files_likely_to_modify.map((f, i) => (
              <li key={i} className="text-sm text-neutral-300">
                <span className="font-mono text-accent">{f.path}</span>
                <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-text-dim">
                  {f.change_type}
                </span>
                <span className="text-text-dim"> — {f.reason}</span>
              </li>
            ))}
          </ul>
        </ProposalBlock>
      </div>

      <ProposalBlock title="Implementation steps">
        <ol className="flex flex-col gap-2">
          {output.implementation_steps.map((s, i) => (
            <li key={i} className="text-sm text-neutral-300">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-neutral-100">
                  {i + 1}. {s.title}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
                    s.risk === "low"
                      ? "bg-emerald-500/10 text-emerald-300"
                      : s.risk === "medium"
                        ? "bg-amber-500/10 text-amber-300"
                        : "bg-red-500/10 text-red-300"
                  }`}
                >
                  {s.risk} risk
                </span>
              </div>
              <p className="mt-0.5 text-text-dim">{s.description}</p>
            </li>
          ))}
        </ol>
      </ProposalBlock>

      <ProposalBlock title="Validation commands">
        <div className="flex flex-col gap-1.5">
          {output.validation_commands.map((c, i) => (
            <div key={i}>
              <code className="rounded bg-background px-2 py-1 font-mono text-xs text-neutral-200">
                {c.command}
              </code>
              <p className="mt-0.5 text-xs text-text-dim">{c.purpose}</p>
            </div>
          ))}
        </div>
      </ProposalBlock>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ProposalBlock title="Risks">
          <ListOfStrings items={output.risks} />
        </ProposalBlock>
        <ProposalBlock title="Open questions">
          <ListOfStrings items={output.questions} />
        </ProposalBlock>
        <ProposalBlock title="Acceptance criteria">
          <ListOfStrings items={output.acceptance_criteria} />
        </ProposalBlock>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] text-text-dim">
        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">
          estimated complexity: {output.estimated_complexity}
        </span>
        <span className="rounded bg-surface-2 px-1.5 py-0.5 font-mono">
          safe to attempt next:{" "}
          {output.safe_to_attempt_next ? "Yes" : "No"}
        </span>
      </div>
    </div>
  );
}

function ProposalBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-dim">
        {title}
      </h3>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function ListOfStrings({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-text-dim">—</p>;
  }
  return (
    <ul className="flex list-disc flex-col gap-1 pl-4">
      {items.map((item, i) => (
        <li key={i} className="text-sm text-neutral-300">
          {item}
        </li>
      ))}
    </ul>
  );
}
