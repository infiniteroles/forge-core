import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { ProjectEditForm } from "@/components/ProjectEditForm";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function EditProjectPage({ params }: Props) {
  if (!(await getSession())) redirect("/login");

  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  return (
    <AppShell>
      <div className="max-w-xl">
        <Link
          href={`/projects/${project.id}`}
          className="text-sm text-text-dim transition hover:text-neutral-100"
        >
          ← Back to project
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Edit project
        </h1>
        <p className="mt-1 text-sm text-text-dim">
          Update the details of &ldquo;{project.name}&rdquo;.
        </p>

        <div className="mt-8 rounded-xl border border-border bg-surface p-6">
          <ProjectEditForm project={project} />
        </div>
      </div>
    </AppShell>
  );
}
