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

        <div className="mt-8 rounded-xl border border-border bg-surface p-6">
          <TaskForm task={task} />
        </div>
      </div>
    </AppShell>
  );
}
