import { githubFetch, getGithubConfig } from "./client";
import { GithubError } from "./types";

const fullNameRegex = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

const MAX_FILES = 10;
const MAX_FILE_SIZE = 30 * 1024; // 30 KB per file
const MAX_TOTAL_SIZE = 120 * 1024; // 120 KB total

const SENSITIVE_PATTERNS = [
  /\b\.env\b/,
  /secret/i,
  /credential/i,
  /node_modules/,
  /\.git\//,
];

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip",
  ".gz", ".tar", ".woff", ".woff2", ".ttf", ".eot", ".aiff", ".wav",
  ".mp3", ".mp4", ".mov", ".bin", ".exe", ".dll", ".lock",
]);

const PRIORITY_FILES = [
  "README.md",
  "README.MD",
  "package.json",
  "Dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "tsconfig.json",
  "prisma/schema.prisma",
];

export interface RepoContextFile {
  path: string;
  content: string;
}

export interface LimitedRepositoryContext {
  rootEntries: string[];
  appLibListings: string[];
  files: RepoContextFile[];
  warnings: string[];
}

function validateFullName(fullName: string): void {
  if (!fullNameRegex.test(fullName)) {
    throw new GithubError(
      "Invalid repository full name. Use the format owner/repo",
      "invalid_full_name"
    );
  }
}

function isSensitive(path: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(path));
}

function isBinary(path: string): boolean {
  const lower = path.toLowerCase();
  return BINARY_EXTENSIONS.has(`.${lower.split(".").pop()}`);
}

interface TreeEntry {
  path?: string;
  type?: string;
  size?: number;
}

function truncate(content: string, limit: number): string {
  return content.length > limit ? content.slice(0, limit) : content;
}

/**
 * Reads a limited set of repository context from the task branch:
 * root tree listing, a few key files, and path listings for app/lib.
 * Never reads secrets or large files. Best-effort: missing files are skipped.
 */
export async function getLimitedRepositoryContext(input: {
  repositoryFullName: string;
  branchName: string;
}): Promise<LimitedRepositoryContext> {
  validateFullName(input.repositoryFullName);
  requireToken();

  const result: LimitedRepositoryContext = {
    rootEntries: [],
    appLibListings: [],
    files: [],
    warnings: [],
  };

  // 1. Root tree (non-recursive).
  const treeData = await requestJson<{ tree?: TreeEntry[] }>(
    `/repos/${input.repositoryFullName}/git/trees/${encodeURIComponent(input.branchName)}`
  );
  const entries = Array.isArray(treeData?.tree) ? treeData.tree : [];

  const rootEntries = entries
    .map((e) => e.path ?? "")
    .filter(Boolean)
    .sort();
  result.rootEntries = rootEntries.slice(0, 60);

  // 2. Path listings for app/ and lib/ (top-level names only).
  const appLibPaths = entries
    .map((e) => e.path ?? "")
    .filter(
      (p) =>
        p.startsWith("app/") ||
        p.startsWith("lib/") ||
        p.startsWith("src/") ||
        p.startsWith("components/")
    )
    .sort();
  result.appLibListings = appLibPaths.slice(0, 40);

  // 3. Candidate files to read.
  const candidates = new Set<string>();
  for (const priority of PRIORITY_FILES) {
    if (rootEntries.includes(priority)) candidates.add(priority);
  }

  let totalBytes = 0;
  for (const path of candidates) {
    if (result.files.length >= MAX_FILES) {
      result.warnings.push("Reached maximum file count; skipped remaining files.");
      break;
    }
    if (isSensitive(path) || isBinary(path)) continue;

    try {
      const file = await requestJson<{
        size?: number;
        content?: string;
        encoding?: string;
      }>(
        `/repos/${input.repositoryFullName}/contents/${path
          .split("/")
          .map(encodeURIComponent)
          .join("/")}?ref=${encodeURIComponent(input.branchName)}`
      );

      if (!file || typeof file.size !== "number") {
        result.warnings.push(`Could not read ${path}.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        result.warnings.push(`Skipped ${path} (too large).`);
        continue;
      }

      const raw =
        file.encoding === "base64" && typeof file.content === "string"
          ? Buffer.from(file.content, "base64").toString("utf8")
          : file.content ?? "";
      if (!raw) {
        result.warnings.push(`Skipped ${path} (empty).`);
        continue;
      }
      if (totalBytes + raw.length > MAX_TOTAL_SIZE) {
        result.warnings.push("Reached total context limit; skipped remaining files.");
        break;
      }

      result.files.push({ path, content: truncate(raw, MAX_FILE_SIZE) });
      totalBytes += raw.length;
    } catch (error) {
      if (error instanceof GithubError && error.code === "file_not_found") {
        result.warnings.push(`Skipped ${path} (not found).`);
      } else {
        result.warnings.push(`Skipped ${path}.`);
      }
    }
  }

  return result;
}

function requireToken(): void {
  const token = getGithubConfig().token;
  if (!token) {
    throw new GithubError(
      "No GitHub token configured",
      "token_missing"
    );
  }
}

async function requestJson<T>(path: string): Promise<T> {
  const res = await githubFetch(path);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 404) {
      throw new GithubError("Not found", "file_not_found", 404);
    }
    throw new GithubError(
      `GitHub API error (HTTP ${res.status})`,
      "provider_error",
      res.status
    );
  }
  return (await res.json().catch(() => null)) as T;
}
