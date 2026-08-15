import Link from "next/link";
import { StatusBadge } from "./StatusBadge";

type ProjectCardProps = {
  project: {
    id: string;
    name: string;
    slug: string;
    status: string;
    description: string | null;
    devUrl: string | null;
    repoUrl: string | null;
    updatedAt: Date;
  };
};

export function ProjectCard({ project }: ProjectCardProps) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 transition hover:border-accent/50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-neutral-100">
            {project.name}
          </h3>
          <p className="text-xs text-text-dim">/{project.slug}</p>
        </div>
        <StatusBadge status={project.status} />
      </div>

      {project.description ? (
        <p className="line-clamp-2 text-sm text-text-dim">
          {project.description}
        </p>
      ) : null}

      <div className="mt-auto flex flex-col gap-1 text-xs text-text-dim">
        {project.devUrl ? (
          <span className="truncate">DEV · {project.devUrl}</span>
        ) : null}
        {project.repoUrl ? (
          <span className="truncate">Repo · {project.repoUrl}</span>
        ) : null}
      </div>

      <div className="text-[11px] text-text-dim/70">
        Updated {project.updatedAt.toLocaleString()}
      </div>
    </Link>
  );
}
