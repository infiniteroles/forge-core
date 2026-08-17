import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { TaskForm } from "@/components/TaskForm";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditTaskPage({ params }: Props) {
  if (!(await getSession())) redirect("/login");

  const { id } = await params;

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) notFound();

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

        <div className="mt-8 rounded-xl border border-border bg-surface p-6">
          <TaskForm task={task} />
        </div>
      </div>
    </AppShell>
  );
}
