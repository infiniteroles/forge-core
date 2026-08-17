import { CheckRepositoryButton } from "@/components/CheckRepositoryButton";

type RepositoryProject = {
  id: string;
  repositoryProvider: string | null;
  repositoryFullName: string | null;
  repositoryUrl: string | null;
  repositoryDefaultBranch: string | null;
  repositoryVisibility: string | null;
  repositoryDescription: string | null;
  repositoryLastCommitSha: string | null;
  repositoryLastCommitMessage: string | null;
  repositoryLastCommitUrl: string | null;
  repositoryLastCommitAt: Date | null;
  repositoryLastCheckedAt: Date | null;
  repoUrl: string | null;
};

function formatDate(value: Date | null): string | null {
  return value ? value.toLocaleString() : null;
}

export function RepositoryPanel({ project }: { project: RepositoryProject }) {
  const openUrl = project.repositoryUrl ?? project.repoUrl;

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Repository</h2>
        <div className="flex flex-wrap items-center gap-2">
          {openUrl ? (
            <a
              href={openUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:border-accent/50"
            >
              Open repository
            </a>
          ) : null}
          {project.repositoryFullName ? (
            <CheckRepositoryButton projectId={project.id} />
          ) : null}
        </div>
      </div>

      {!project.repositoryFullName ? (
        <p className="mt-4 text-sm text-text-dim">
          No repository linked yet. Edit the project to add one.
        </p>
      ) : (
        <dl className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <RepositoryItem
            label="Provider"
            value={project.repositoryProvider ?? "github"}
          />
          <RepositoryItem label="Full name" value={project.repositoryFullName} />
          <RepositoryItem
            label="URL"
            value={project.repositoryUrl}
            href={project.repositoryUrl}
          />
          <RepositoryItem
            label="Visibility"
            value={project.repositoryVisibility}
          />
          <RepositoryItem
            label="Default branch"
            value={project.repositoryDefaultBranch}
          />
          <RepositoryItem
            label="Last checked"
            value={formatDate(project.repositoryLastCheckedAt)}
          />

          <div className="sm:col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
              Description
            </dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-neutral-200">
              {project.repositoryDescription ?? "—"}
            </dd>
          </div>

          <div className="sm:col-span-2">
            <dt className="text-xs font-semibold uppercase tracking-wide text-text-dim">
              Last commit
            </dt>
            <dd className="mt-0.5 break-all text-neutral-200">
              {project.repositoryLastCommitMessage ? (
                <>
                  <span>{project.repositoryLastCommitMessage}</span>
                  {project.repositoryLastCommitSha ? (
                    <span className="ml-2 font-mono text-xs text-text-dim">
                      {project.repositoryLastCommitSha.slice(0, 7)}
                    </span>
                  ) : null}
                  {project.repositoryLastCommitAt ? (
                    <span className="ml-2 text-xs text-text-dim">
                      {project.repositoryLastCommitAt.toLocaleString()}
                    </span>
                  ) : null}
                </>
              ) : (
                "—"
              )}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

function RepositoryItem({
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
