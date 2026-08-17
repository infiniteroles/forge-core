import { githubFetch, getGithubConfig } from "./client";
import { GithubError, GithubIssue } from "./types";

const fullNameRegex = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function requireToken(): string {
  const token = getGithubConfig().token;
  if (!token) {
    throw new GithubError(
      "No GitHub token configured. Issues can not be created.",
      "token_missing"
    );
  }
  return token;
}

function mapHttpError(status: number, body: string): never {
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
      "Repository not found or GitHub token lacks access",
      "repository_not_found",
      status
    );
  }

  if (status === 410) {
    throw new GithubError(
      "Issues are disabled for this repository",
      "issues_disabled",
      status
    );
  }

  if (status === 422) {
    throw new GithubError(
      "GitHub rejected the issue payload",
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

export interface CreateIssueInput {
  repositoryFullName: string;
  title: string;
  body: string;
  labels?: string[];
}

export interface GetIssueInput {
  repositoryFullName: string;
  issueNumber: number;
}

async function requestJson<T>(
  path: string,
  init: RequestInit
): Promise<T> {
  const res = await githubFetch(path, undefined, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    mapHttpError(res.status, text);
  }
  return (await res.json().catch(() => null)) as T;
}

interface IssuePayload {
  number?: number;
  html_url?: string;
  state?: string;
  title?: string;
  created_at?: string | null;
  updated_at?: string | null;
}

function toGithubIssue(data: IssuePayload | null): GithubIssue {
  if (!data || typeof data.number !== "number") {
    throw new GithubError("GitHub returned an invalid issue", "unknown");
  }
  return {
    number: data.number,
    html_url: data.html_url ?? "",
    state: data.state ?? "unknown",
    title: data.title ?? "",
    created_at: data.created_at ?? null,
    updated_at: data.updated_at ?? null,
  };
}

/**
 * Creates a GitHub issue in the given repository. Requires a configured token.
 */
export async function createIssue(
  input: CreateIssueInput
): Promise<GithubIssue> {
  requireToken();

  const fullName = (input.repositoryFullName ?? "").trim();
  if (!fullNameRegex.test(fullName)) {
    throw new GithubError(
      "Invalid repository full name. Use the format owner/repo",
      "invalid_full_name"
    );
  }

  const title = (input.title ?? "").trim();
  if (!title) {
    throw new GithubError("Issue title is required", "validation_error");
  }

  const data = await requestJson<IssuePayload>(`/repos/${fullName}/issues`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      body: input.body ?? "",
      labels: input.labels ?? [],
    }),
  });

  return toGithubIssue(data);
}

/**
 * Fetches an issue by number to refresh its local metadata.
 */
export async function getIssue(
  input: GetIssueInput
): Promise<GithubIssue> {
  requireToken();

  const fullName = (input.repositoryFullName ?? "").trim();
  if (!fullNameRegex.test(fullName)) {
    throw new GithubError(
      "Invalid repository full name. Use the format owner/repo",
      "invalid_full_name"
    );
  }

  if (!Number.isInteger(input.issueNumber) || input.issueNumber <= 0) {
    throw new GithubError("Invalid issue number", "validation_error");
  }

  const data = await requestJson<IssuePayload>(
    `/repos/${fullName}/issues/${input.issueNumber}`,
    { method: "GET" }
  );

  return toGithubIssue(data);
}
