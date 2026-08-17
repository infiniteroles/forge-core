import { githubFetch, getGithubConfig } from "./client";
import { GithubBranch, GithubError, GithubErrorCode } from "./types";

const fullNameRegex = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function requireToken(): string {
  const token = getGithubConfig().token;
  if (!token) {
    throw new GithubError(
      "No GitHub token configured. Branches can not be created.",
      "token_missing"
    );
  }
  return token;
}

function mapHttpError(
  status: number,
  body: string,
  notFoundCode: GithubErrorCode = "repository_not_found"
): never {
  const lower = body.toLowerCase();

  if (status === 401) {
    throw new GithubError(
      "GitHub token is invalid or lacks access",
      "forbidden",
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
      "GitHub token lacks permission for this repository",
      "forbidden",
      status
    );
  }

  if (status === 404) {
    throw new GithubError(
      "Not found",
      notFoundCode,
      status
    );
  }

  if (status === 422) {
    if (lower.includes("reference already exists")) {
      throw new GithubError(
        "A branch with this name already exists",
        "branch_already_exists",
        status
      );
    }
    throw new GithubError(
      "GitHub rejected the branch payload",
      "validation_error",
      status
    );
  }

  throw new GithubError(
    `GitHub API error (HTTP ${status})`,
    "provider_error",
    status
  );
}

function validateFullName(fullName: string): void {
  if (!fullNameRegex.test(fullName)) {
    throw new GithubError(
      "Invalid repository full name. Use the format owner/repo",
      "invalid_full_name"
    );
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await githubFetch(path, undefined, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    mapHttpError(res.status, text);
  }
  return (await res.json().catch(() => null)) as T;
}

interface RefPayload {
  ref?: string;
  object?: { type?: string; sha?: string } | null;
}

interface BranchPayload {
  name?: string;
  commit?: { sha?: string } | null;
}

function branchHtmlUrl(fullName: string, branchName: string): string {
  return `https://github.com/${fullName}/tree/${encodeURIComponent(branchName)}`;
}

export interface GetBranchRefInput {
  repositoryFullName: string;
  branchName: string;
}

export interface CreateBranchInput {
  repositoryFullName: string;
  branchName: string;
  baseSha: string;
}

/**
 * Returns the ref (and tip SHA) of a branch. Throws `branch_not_found` if it
 * does not exist.
 */
export async function getBranchRef(
  input: GetBranchRefInput
): Promise<{ ref: string; sha: string }> {
  requireToken();
  validateFullName(input.repositoryFullName);

  const data = await requestJson<RefPayload>(
    `/repos/${input.repositoryFullName}/git/ref/heads/${encodeURIComponent(input.branchName)}`,
    undefined
  ).catch((error) => {
    if (error instanceof GithubError && error.code === "repository_not_found") {
      throw new GithubError(
        "Branch not found",
        "branch_not_found",
        error.status
      );
    }
    throw error;
  });

  const sha = data?.object?.sha;
  if (!data?.ref || !sha) {
    throw new GithubError("Branch not found", "branch_not_found", 404);
  }

  return { ref: data.ref, sha };
}

/**
 * Creates a new branch pointing at `baseSha`. Throws `branch_already_exists`
 * when the ref already exists.
 */
export async function createBranch(
  input: CreateBranchInput
): Promise<GithubBranch> {
  requireToken();
  validateFullName(input.repositoryFullName);

  if (!input.baseSha) {
    throw new GithubError("Base SHA is required", "validation_error");
  }

  const data = await requestJson<RefPayload>(
    `/repos/${input.repositoryFullName}/git/refs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ref: `refs/heads/${input.branchName}`,
        sha: input.baseSha,
      }),
    }
  );

  return {
    name: input.branchName,
    url: branchHtmlUrl(input.repositoryFullName, input.branchName),
    sha: data?.object?.sha ?? input.baseSha,
  };
}

/**
 * Fetches a branch by name to refresh local metadata. Throws `branch_not_found`
 * when it does not exist.
 */
export async function getBranch(
  input: GetBranchRefInput
): Promise<GithubBranch> {
  requireToken();
  validateFullName(input.repositoryFullName);

  const data = await requestJson<BranchPayload>(
    `/repos/${input.repositoryFullName}/branches/${encodeURIComponent(input.branchName)}`,
    undefined
  ).catch((error) => {
    if (error instanceof GithubError && error.code === "repository_not_found") {
      throw new GithubError(
        "Branch not found",
        "branch_not_found",
        error.status
      );
    }
    throw error;
  });

  if (!data?.name) {
    throw new GithubError("Branch not found", "branch_not_found", 404);
  }

  return {
    name: data.name,
    url: branchHtmlUrl(input.repositoryFullName, data.name),
    sha: data.commit?.sha ?? null,
  };
}
