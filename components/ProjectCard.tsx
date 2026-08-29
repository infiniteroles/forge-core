import Link from "next/link";
import { StatusBadge } from "./StatusBadge";
import { Icon } from "./Icon";

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
      className="group flex flex-col gap-3 rounded-2xl border border-m3-outline-variant bg-m3-surface-container-low p-5 transition hover:border-m3-primary/60 hover:bg-m3-surface-container"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-m3-on-surface">
            {project.name}
          </h3>
          <p className="text-xs text-m3-on-surface-variant">/{project.slug}</p>
        </div>
        <StatusBadge status={project.status} />
      </div>

      {project.description ? (
        <p className="line-clamp-2 text-sm text-m3-on-surface-variant">
          {project.description}
        </p>
      ) : null}

      <div className="mt-auto flex flex-col gap-1 text-xs text-m3-on-surface-variant">
        {project.devUrl ? (
          <span className="flex items-center gap-1 truncate">
            <Icon name="web" className="text-[14px] leading-none" /> DEV · {project.devUrl}
          </span>
        ) : null}
        {project.repoUrl ? (
          <span className="flex items-center gap-1 truncate">
            <Icon name="code" className="text-[14px] leading-none" /> Repo · {project.repoUrl}
          </span>
        ) : null}
      </div>

      <div className="text-[11px] text-m3-on-surface-variant/70">
        Updated {project.updatedAt.toLocaleString()}
      </div>
    </Link>
  );
}
