import { githubFetch, githubGraphQL, getGithubConfig } from "./client";
import { GithubError, GithubErrorCode, GithubPullRequest } from "./types";

const fullNameRegex = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function requireToken(): string {
  const token = getGithubConfig().token;
  if (!token) {
    throw new GithubError(
      "No GitHub token configured. Pull requests can not be created.",
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

  if (status === 422) {
    if (lower.includes("a pull request already exists")) {
      throw new GithubError(
        "A pull request already exists for this branch",
        "pull_request_already_exists",
        status
      );
    }
    if (lower.includes("no commits between")) {
      throw new GithubError(
        "No commits between base and head branches",
        "no_commits_between",
        status
      );
    }
    throw new GithubError(
      "GitHub rejected the pull request payload",
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

interface PrPayload {
  number?: number;
  node_id?: string;
  html_url?: string;
  state?: string;
  title?: string;
  draft?: boolean;
  base?: { ref?: string } | null;
  head?: { ref?: string; sha?: string } | null;
  created_at?: string | null;
  updated_at?: string | null;
  merged_at?: string | null;
  merge_commit_sha?: string | null;
}

function toGithubPullRequest(data: PrPayload | null): GithubPullRequest {
  if (!data || typeof data.number !== "number") {
    throw new GithubError("GitHub returned an invalid pull request", "unknown");
  }
  return {
    number: data.number,
    nodeId: data.node_id ?? null,
    html_url: data.html_url ?? "",
    state: data.state ?? "unknown",
    title: data.title ?? "",
    draft: data.draft ?? false,
    baseBranch: data.base?.ref ?? "",
    headBranch: data.head?.ref ?? "",
    headSha: data.head?.sha ?? null,
    created_at: data.created_at ?? null,
    updated_at: data.updated_at ?? null,
    merged_at: data.merged_at ?? null,
    mergeCommitSha: data.merge_commit_sha ?? null,
  };
}

export interface CreatePullRequestInput {
  repositoryFullName: string;
  title: string;
  body: string;
  baseBranch: string;
  headBranch: string;
  draft?: boolean;
}

/**
 * Creates a pull request. When `draft` is true GitHub creates it as a draft PR.
 */
export async function createPullRequest(
  input: CreatePullRequestInput
): Promise<GithubPullRequest> {
  requireToken();
  validateFullName(input.repositoryFullName);

  if (!input.title) {
    throw new GithubError("PR title is required", "validation_error");
  }

  const data = await requestJson<PrPayload>(
    `/repos/${input.repositoryFullName}/pulls`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        body: input.body ?? "",
        head: input.headBranch,
        base: input.baseBranch,
        draft: input.draft ?? false,
      }),
    }
  );

  return toGithubPullRequest(data);
}

export interface GetPullRequestInput {
  repositoryFullName: string;
  prNumber: number;
}

/**
 * Fetches a pull request by number.
 */
export async function getPullRequest(
  input: GetPullRequestInput
): Promise<GithubPullRequest> {
  requireToken();
  validateFullName(input.repositoryFullName);

  if (!Number.isInteger(input.prNumber) || input.prNumber <= 0) {
    throw new GithubError("Invalid pull request number", "validation_error");
  }

  const data = await requestJson<PrPayload>(
    `/repos/${input.repositoryFullName}/pulls/${input.prNumber}`
  );

  return toGithubPullRequest(data);
}

export interface FindOpenPullRequestInput {
  repositoryFullName: string;
  headBranch: string;
}

/**
 * Returns the first open pull request whose head branch matches, or null.
 */
export async function findOpenPullRequestForBranch(
  input: FindOpenPullRequestInput
): Promise<GithubPullRequest | null> {
  requireToken();
  validateFullName(input.repositoryFullName);

  const head = `${input.repositoryFullName}:${input.headBranch}`;
  const data = await requestJson<PrPayload[]>(
    `/repos/${input.repositoryFullName}/pulls?state=open&head=${encodeURIComponent(head)}`
  );

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  return toGithubPullRequest(data[0]);
}

export interface MarkPullRequestReadyInput {
  repositoryFullName: string;
  prNumber: number;
}

/**
 * Converts a draft pull request into a regular (ready for review) PR.
 *
 * The REST API does not expose a `draft` field on the "Update a pull request"
 * endpoint, so this uses the GraphQL mutation `markPullRequestReadyForReview`.
 * It never merges.
 */
export async function markPullRequestReady(
  input: MarkPullRequestReadyInput
): Promise<GithubPullRequest> {
  requireToken();
  validateFullName(input.repositoryFullName);

  if (!Number.isInteger(input.prNumber) || input.prNumber <= 0) {
    throw new GithubError("Invalid pull request number", "validation_error");
  }

  // 1. Fetch the PR to obtain its GraphQL node id.
  const pr = await getPullRequest(input);
  if (!pr.nodeId) {
    throw new GithubError(
      "Could not resolve the pull request node id",
      "unknown"
    );
  }

  // 2. Convert draft → ready for review via GraphQL.
  const query = `
    mutation MarkPullRequestReadyForReview($id: ID!) {
      markPullRequestReadyForReview(input: { pullRequestId: $id }) {
        pullRequest {
          id
          number
          state
          isDraft
        }
      }
    }
  `;
  const result = await githubGraphQL(query, { id: pr.nodeId });
  const pullRequest = (result.data as {
    markPullRequestReadyForReview?: {
      pullRequest?: { number?: number; state?: string; isDraft?: boolean };
    };
  })?.markPullRequestReadyForReview?.pullRequest;

  if (!pullRequest) {
    throw new GithubError(
      "GitHub did not confirm the pull request was marked ready",
      "unknown"
    );
  }

  // 3. Return the fresh PR state.
  return getPullRequest(input);
}

export type MergeMethod = "squash" | "merge" | "rebase";

export interface MergePullRequestInput {
  repositoryFullName: string;
  pullRequestNumber: number;
  method?: MergeMethod;
  commitTitle?: string;
  commitMessage?: string;
}

export interface MergePullRequestResult {
  sha: string | null;
  merged: boolean;
  message: string;
}

/**
 * Merges a pull request using the GitHub REST "Merge a pull request" endpoint.
 *
 * Used ONLY by the controlled production promotion flow (Fase 3.9), after a
 * human has approved readiness and typed the PROMOTE confirmation. Defaults to
 * a squash merge. It deliberately does NOT delete the head branch and does NOT
 * auto-close the linked issue — the promotion keeps those side effects out.
 */
export async function mergePullRequest(
  input: MergePullRequestInput
): Promise<MergePullRequestResult> {
  requireToken();
  validateFullName(input.repositoryFullName);

  if (!Number.isInteger(input.pullRequestNumber) || input.pullRequestNumber <= 0) {
    throw new GithubError("Invalid pull request number", "validation_error");
  }

  const method = input.method ?? "squash";
  if (method !== "squash" && method !== "merge" && method !== "rebase") {
    throw new GithubError(
      "Invalid merge method. Use squash, merge or rebase",
      "validation_error"
    );
  }

  const payload: Record<string, unknown> = {
    merge_method: method,
  };
  if (input.commitTitle) payload.commit_title = input.commitTitle;
  if (input.commitMessage) payload.commit_message = input.commitMessage;

  const res = await githubFetch(
    `/repos/${input.repositoryFullName}/pulls/${input.pullRequestNumber}/merge`,
    undefined,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 405 || text.toLowerCase().includes("not mergeable")) {
      throw new GithubError(
        `Pull request #${input.pullRequestNumber} is not mergeable (conflict or not ready)`,
        "validation_error",
        res.status
      );
    }
    if (res.status === 404) {
      throw new GithubError(
        "Repository or pull request not found",
        "repository_not_found",
        res.status
      );
    }
    mapHttpError(res.status, text);
  }

  const data = (await res.json().catch(() => null)) as {
    sha?: string | null;
    merged?: boolean;
    message?: string;
  } | null;

  return {
    sha: data?.sha ?? null,
    merged: data?.merged ?? false,
    message: data?.message ?? "Merged",
  };
}
