import { githubFetch, getGithubConfig } from "./client";
import { GithubError, GithubErrorCode } from "./types";

const fullNameRegex = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function requireToken(): string {
  const token = getGithubConfig().token;
  if (!token) {
    throw new GithubError(
      "No GitHub token configured. Plan commits can not be created.",
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
    throw new GithubError("Not found", notFoundCode, status);
  }

  if (status === 422) {
    throw new GithubError(
      "GitHub rejected the file payload",
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

export interface GetFileContentInput {
  repositoryFullName: string;
  branchName: string;
  path: string;
}

export interface FileContent {
  path: string;
  sha: string;
}

/**
 * Returns the blob SHA of a file on a branch. Throws `file_not_found` when the
 * file does not exist.
 */
export async function getFileContent(
  input: GetFileContentInput
): Promise<FileContent> {
  requireToken();
  validateFullName(input.repositoryFullName);

  const data = await requestJson<{
    path?: string;
    sha?: string;
    type?: string;
  }>(
    `/repos/${input.repositoryFullName}/contents/${input.path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}?ref=${encodeURIComponent(input.branchName)}`
  ).catch((error) => {
    if (error instanceof GithubError && error.code === "repository_not_found") {
      throw new GithubError("File not found", "file_not_found", error.status);
    }
    throw error;
  });

  if (!data || data.type !== "file" || !data.sha) {
    throw new GithubError("File not found", "file_not_found", 404);
  }

  return { path: data.path ?? input.path, sha: data.sha };
}

export interface CreateOrUpdateFileInput {
  repositoryFullName: string;
  branchName: string;
  path: string;
  message: string;
  content: string;
}

export interface FileCommitResult {
  path: string;
  commitSha: string;
  commitUrl: string;
  commitMessage: string;
  committedAt: string | null;
  updated: boolean;
}

interface PutPayload {
  content?: {
    sha?: string;
    html_url?: string;
  } | null;
  commit?: {
    sha?: string;
    html_url?: string;
    message?: string;
    committer?: { date?: string | null } | null;
  } | null;
}

/**
 * Creates or updates a file on a branch via the Contents API, producing a commit.
 * Returns the commit SHA/URL/message. `updated` is true when the file already
 * existed and was updated.
 */
export async function createOrUpdateFile(
  input: CreateOrUpdateFileInput
): Promise<FileCommitResult> {
  requireToken();
  validateFullName(input.repositoryFullName);

  let existingSha: string | null = null;
  let updated = false;

  try {
    const existing = await getFileContent({
      repositoryFullName: input.repositoryFullName,
      branchName: input.branchName,
      path: input.path,
    });
    existingSha = existing.sha;
    updated = true;
  } catch (error) {
    if (error instanceof GithubError && error.code === "file_not_found") {
      updated = false;
    } else {
      throw error;
    }
  }

  const body: Record<string, unknown> = {
    message: input.message,
    content: Buffer.from(input.content, "utf8").toString("base64"),
    branch: input.branchName,
  };
  if (existingSha) {
    body.sha = existingSha;
  }

  const data = await requestJson<PutPayload>(
    `/repos/${input.repositoryFullName}/contents/${input.path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  const commit = data?.commit;
  const commitSha = commit?.sha;
  if (!commitSha) {
    throw new GithubError(
      "GitHub did not return a commit SHA",
      "unknown"
    );
  }

  return {
    path: input.path,
    commitSha,
    commitUrl:
      commit?.html_url ??
      `https://github.com/${input.repositoryFullName}/commit/${commitSha}`,
    commitMessage: commit?.message ?? input.message,
    committedAt: commit?.committer?.date ?? null,
    updated,
  };
}

export interface GetCommitInput {
  repositoryFullName: string;
  commitSha: string;
}

export interface CommitInfo {
  sha: string;
  url: string;
  message: string;
  committedAt: string | null;
}

/**
 * Fetches a commit by SHA.
 */
export async function getCommit(
  input: GetCommitInput
): Promise<CommitInfo> {
  requireToken();
  validateFullName(input.repositoryFullName);

  const data = await requestJson<{
    sha?: string;
    html_url?: string;
    commit?: {
      message?: string;
      committer?: { date?: string | null } | null;
    } | null;
  }>(`/repos/${input.repositoryFullName}/commits/${encodeURIComponent(input.commitSha)}`);

  if (!data?.sha) {
    throw new GithubError("Commit not found", "file_not_found", 404);
  }

  return {
    sha: data.sha,
    url:
      data.html_url ??
      `https://github.com/${input.repositoryFullName}/commit/${data.sha}`,
    message: data.commit?.message ?? "",
    committedAt: data.commit?.committer?.date ?? null,
  };
}

/**
 * Applies several file changes on a branch via the Contents API (one commit
 * per file — simple and reliable for this phase). Stops on the first failure.
 */
export async function createOrUpdateFiles(
  inputs: CreateOrUpdateFileInput[]
): Promise<FileCommitResult[]> {
  const results: FileCommitResult[] = [];
  for (const input of inputs) {
    const result = await createOrUpdateFile(input);
    results.push(result);
  }
  return results;
}
