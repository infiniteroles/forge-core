import { githubFetch, getGithubConfig } from "./client";
import { GithubError, GithubRepository } from "./types";

const fullNameRegex = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function mapHttpError(status: number, body: string): never {
  const lower = body.toLowerCase();

  if (status === 404) {
    throw new GithubError(
      "Repository not found or GitHub token lacks access",
      "not_found",
      status
    );
  }

  if (status === 403 || status === 429) {
    if (
      status === 429 ||
      lower.includes("rate limit") ||
      lower.includes("secondary rate limit")
    ) {
      throw new GithubError(
        "GitHub API rate limit exceeded",
        "rate_limited",
        status
      );
    }
    throw new GithubError(
      "Repository is private and no GitHub token with access is configured",
      "forbidden",
      status
    );
  }

  throw new GithubError(
    `GitHub API error (HTTP ${status})`,
    "provider_error",
    status
  );
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await githubFetch(path);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    mapHttpError(res.status, text);
  }
  return (await res.json().catch(() => null)) as T;
}

interface RepoPayload {
  full_name?: string;
  html_url?: string;
  default_branch?: string;
  visibility?: string;
  description?: string | null;
  updated_at?: string | null;
}

interface CommitPayload {
  sha?: string;
  html_url?: string;
  commit?: {
    message?: string;
    committer?: { date?: string | null } | null;
  };
}

/**
 * Looks up a repository by `owner/repo` and returns its basic metadata plus the
 * latest commit on the default branch. Read-only; uses REST, never GraphQL.
 */
export async function checkRepository(
  fullNameInput: string
): Promise<GithubRepository> {
  const fullName = (fullNameInput ?? "").trim();

  if (!fullName) {
    throw new GithubError(
      "Repository full name is missing",
      "invalid_full_name"
    );
  }

  if (!fullNameRegex.test(fullName)) {
    throw new GithubError(
      "Invalid repository full name. Use the format owner/repo",
      "invalid_full_name"
    );
  }

  const repo = await fetchJson<RepoPayload>(`/repos/${fullName}`);

  if (!repo || !repo.full_name) {
    throw new GithubError(
      "Repository not found or GitHub token lacks access",
      "not_found",
      404
    );
  }

  const defaultBranch = repo.default_branch || "main";

  // Latest commit on the default branch is best-effort: if it fails we keep the
  // repository metadata but leave the commit fields empty.
  let commit: CommitPayload | null = null;
  try {
    commit = await fetchJson<CommitPayload>(
      `/repos/${repo.full_name}/commits/${encodeURIComponent(defaultBranch)}`
    );
  } catch {
    commit = null;
  }

  return {
    fullName: repo.full_name,
    url: repo.html_url ?? `https://github.com/${repo.full_name}`,
    defaultBranch,
    visibility: repo.visibility ?? "unknown",
    description: repo.description ?? null,
    lastCommitSha: commit?.sha ?? null,
    lastCommitMessage: commit?.commit?.message ?? null,
    lastCommitUrl: commit?.html_url ?? null,
    lastCommitAt: commit?.commit?.committer?.date ?? null,
    updatedAt: repo.updated_at ?? null,
  };
}
