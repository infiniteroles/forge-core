export interface GithubRepository {
  fullName: string;
  url: string;
  defaultBranch: string;
  visibility: string;
  description: string | null;
  lastCommitSha: string | null;
  lastCommitMessage: string | null;
  lastCommitUrl: string | null;
  lastCommitAt: string | null;
  updatedAt: string | null;
}

export interface GithubIssue {
  number: number;
  html_url: string;
  state: string;
  title: string;
  created_at: string | null;
  updated_at: string | null;
}

export interface GithubBranch {
  name: string;
  url: string;
  sha: string | null;
}

export interface GithubPullRequest {
  number: number;
  nodeId: string | null;
  html_url: string;
  state: string;
  title: string;
  draft: boolean;
  baseBranch: string;
  headBranch: string;
  headSha: string | null;
  created_at: string | null;
  updated_at: string | null;
  merged_at: string | null;
  mergeCommitSha: string | null;
}

export type GithubErrorCode =
  | "not_configured"
  | "token_missing"
  | "invalid_full_name"
  | "not_found"
  | "repository_not_found"
  | "issues_disabled"
  | "branch_already_exists"
  | "branch_not_found"
  | "file_not_found"
  | "pull_request_already_exists"
  | "no_commits_between"
  | "forbidden"
  | "rate_limited"
  | "network_error"
  | "validation_error"
  | "provider_error"
  | "unknown";

export class GithubError extends Error {
  readonly code: GithubErrorCode;
  readonly status?: number;

  constructor(message: string, code: GithubErrorCode, status?: number) {
    super(message);
    this.name = "GithubError";
    this.code = code;
    this.status = status;
  }
}
