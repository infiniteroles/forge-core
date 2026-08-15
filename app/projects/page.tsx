import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { ProjectCard } from "@/components/ProjectCard";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  if (!(await getSession())) redirect("/login");

  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
  });

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
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-black transition hover:opacity-90"
        >
          New project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-text-dim">No projects yet.</p>
          <Link
            href="/projects/new"
            className="mt-3 inline-block text-sm font-medium text-accent hover:underline"
          >
            Create the first one →
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
