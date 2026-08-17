import { GithubError } from "./types";

const DEFAULT_API_BASE_URL = "https://api.github.com";
const DEFAULT_OWNER = "infiniteroles";
const DEFAULT_TIMEOUT_MS = 15000;

export interface GithubConfig {
  token?: string;
  apiBaseUrl: string;
  defaultOwner: string;
  timeoutMs: number;
}

export function getGithubConfig(): GithubConfig {
  return {
    token: process.env.GITHUB_TOKEN || undefined,
    apiBaseUrl: process.env.GITHUB_API_BASE_URL || DEFAULT_API_BASE_URL,
    defaultOwner: process.env.GITHUB_DEFAULT_OWNER || DEFAULT_OWNER,
    timeoutMs: Number(process.env.GITHUB_REQUEST_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  };
}

export function isGithubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN);
}

/**
 * Shared GitHub REST fetch. Adds the optional token as an Authorization header
 * and a timeout. Never logs the token.
 */
export async function githubFetch(
  path: string,
  config?: GithubConfig,
  init?: RequestInit
): Promise<Response> {
  const cfg = config ?? getGithubConfig();

  const url = `${cfg.apiBaseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...((init?.headers as Record<string, string>) ?? {}),
  };

  if (cfg.token) {
    headers.Authorization = `Bearer ${cfg.token}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);

  try {
    const res = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });
    return res;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new GithubError("GitHub request timed out", "network_error");
    }
    throw new GithubError(
      "GitHub API is unreachable",
      "network_error"
    );
  } finally {
    clearTimeout(timeout);
  }
}
