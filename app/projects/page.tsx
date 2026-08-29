import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { ProjectCard } from "@/components/ProjectCard";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  if (!(await getSession())) redirect("/login");

  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
  });

  const activeProjects = projects.filter((project) => !project.archivedAt);
  const archivedProjects = projects.filter((project) => project.archivedAt);

  return (
    <AppShell>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-text-dim">
            Create and track development initiatives.
          </p>
        </div>
        <Link
          href="/projects/new"
          className="flex items-center gap-1.5 rounded-full bg-m3-primary px-4 py-2 text-sm font-medium text-m3-on-primary transition hover:opacity-90"
        >
          <Icon name="add" className="text-[16px] leading-none" /> New project
        </Link>
      </div>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-m3-on-surface-variant">
        Active projects
      </h2>

      {activeProjects.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-m3-outline p-10 text-center">
          <p className="text-sm text-m3-on-surface-variant">No active projects yet.</p>
          <Link
            href="/projects/new"
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-m3-primary hover:underline"
          >
            Create the first one
            <Icon name="arrow_forward" className="text-[16px] leading-none" />
          </Link>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activeProjects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      {archivedProjects.length > 0 ? (
        <>
          <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-m3-on-surface-variant">
            Archived projects
          </h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {archivedProjects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </>
      ) : null}
    </AppShell>
  );
}
