import { githubFetch, getGithubConfig } from "./client";
import { GithubError, GithubPullRequest } from "./types";
import { getPullRequest } from "./pull-requests";
import { assessPrPaths, PrPathAssessment } from "./safe-file-policy";

const MAX_FILES = 40;
const MAX_PATCH_PER_FILE = 8 * 1024; // 8 KB per diff
const MAX_TOTAL = 150 * 1024; // 150 KB total context

const fullNameRegex = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function requireToken(): string {
  const token = getGithubConfig().token;
  if (!token) {
    throw new GithubError(
      "No GitHub token configured",
      "token_missing"
    );
  }
  return token;
}

function validateFullName(fullName: string): void {
  if (!fullNameRegex.test(fullName)) {
    throw new GithubError(
      "Invalid repository full name. Use the format owner/repo",
      "invalid_full_name"
    );
  }
}

async function requestJson<T>(path: string): Promise<T> {
  const res = await githubFetch(path);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 404) {
      throw new GithubError("Not found", "not_found", 404);
    }
    throw new GithubError(
      `GitHub API error (HTTP ${res.status})`,
      "provider_error",
      res.status
    );
  }
  return (await res.json().catch(() => null)) as T;
}

export interface PrContextFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch: string | null;
}

export interface PrContextCommit {
  sha: string;
  message: string;
  authorDate: string | null;
}

export interface PrReviewGitHubContext {
  pr: GithubPullRequest;
  changedFiles: PrContextFile[];
  commits: PrContextCommit[];
  totalChanges: number;
  assessment: PrPathAssessment;
  warnings: string[];
}

export interface GetPrFilesInput {
  repositoryFullName: string;
  prNumber: number;
}

/**
 * Fetches the files (with diff patch) of a pull request. Patches are
 * truncated to keep the context bounded. No secrets or full file contents.
 */
export async function getPrFiles(
  input: GetPrFilesInput
): Promise<PrContextFile[]> {
  requireToken();
  validateFullName(input.repositoryFullName);

  const data = await requestJson<
    {
      filename?: string;
      status?: string;
      additions?: number;
      deletions?: number;
      changes?: number;
      patch?: string | null;
    }[]
  >(`/repos/${input.repositoryFullName}/pulls/${input.prNumber}/files`);

  if (!Array.isArray(data)) return [];

  const files: PrContextFile[] = [];
  let total = 0;
  for (const f of data.slice(0, MAX_FILES)) {
    const patch = f.patch ?? null;
    const patchSize = patch ? Buffer.byteLength(patch, "utf8") : 0;
    const limited = patch && patchSize > MAX_PATCH_PER_FILE
      ? `${patch.slice(0, MAX_PATCH_PER_FILE)}\n… [diff truncated]`
      : patch;
    total += patch ? Buffer.byteLength(limited ?? "", "utf8") : 0;
    files.push({
      filename: f.filename ?? "(unknown)",
      status: f.status ?? "unknown",
      additions: f.additions ?? 0,
      deletions: f.deletions ?? 0,
      changes: f.changes ?? 0,
      patch: limited,
    });
    if (total > MAX_TOTAL) {
      files.push({
        filename: "…",
        status: "truncated",
        additions: 0,
        deletions: 0,
        changes: 0,
        patch: "Context limit reached; remaining files omitted.",
      });
      break;
    }
  }

  return files;
}

export interface GetPrCommitsInput {
  repositoryFullName: string;
  prNumber: number;
}

export async function getPrCommits(
  input: GetPrCommitsInput
): Promise<PrContextCommit[]> {
  requireToken();
  validateFullName(input.repositoryFullName);

  const data = await requestJson<
    {
      sha?: string;
      commit?: {
        message?: string;
        author?: { date?: string | null } | null;
      } | null;
    }[]
  >(`/repos/${input.repositoryFullName}/pulls/${input.prNumber}/commits`);

  if (!Array.isArray(data)) return [];

  return data.slice(0, 20).map((c) => ({
    sha: c.sha ?? "",
    message: c.commit?.message ?? "",
    authorDate: c.commit?.author?.date ?? null,
  }));
}

export interface BuildPrReviewContextInput {
  repositoryFullName: string;
  prNumber: number;
}

/**
 * Builds the full GitHub context for a PR review: metadata, files/diff and
 * commits, plus a safe-file-policy assessment of the changed paths.
 */
export async function buildPrReviewGitHubContext(
  input: BuildPrReviewContextInput
): Promise<PrReviewGitHubContext> {
  requireToken();
  validateFullName(input.repositoryFullName);

  const [pr, changedFiles, commits] = await Promise.all([
    getPullRequest({ repositoryFullName: input.repositoryFullName, prNumber: input.prNumber }),
    getPrFiles(input),
    getPrCommits(input),
  ]);

  const paths = changedFiles.map((f) => f.filename);
  const assessment = assessPrPaths(paths);

  const warnings: string[] = [];
  if (assessment.touchesBlockedPaths) {
    warnings.push(
      `PR touches blocked paths: ${assessment.blockedPaths.join(", ")}`
    );
  }
  if (changedFiles.length > 0 && changedFiles[changedFiles.length - 1].status === "truncated") {
    warnings.push("PR diff context was truncated at the total size limit.");
  }

  return {
    pr,
    changedFiles,
    commits,
    totalChanges: changedFiles.reduce((acc, f) => acc + f.changes, 0),
    assessment,
    warnings,
  };
}
