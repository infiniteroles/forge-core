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

export type GithubErrorCode =
  | "not_configured"
  | "invalid_full_name"
  | "not_found"
  | "forbidden"
  | "rate_limited"
  | "network_error"
  | "provider_error";

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
