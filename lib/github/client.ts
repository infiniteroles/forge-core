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

interface GraphQLResponse {
  data?: unknown;
  errors?: { message?: string }[];
}

/**
 * Minimal GitHub GraphQL client. Used for operations not exposed by the REST
 * API (e.g. converting a draft PR to ready for review). Never logs the token.
 */
export async function githubGraphQL(
  query: string,
  variables: Record<string, unknown>,
  config?: GithubConfig
): Promise<GraphQLResponse> {
  const cfg = config ?? getGithubConfig();

  if (!cfg.token) {
    throw new GithubError("No GitHub token configured", "token_missing");
  }

  const url = `${cfg.apiBaseUrl.replace(/\/+$/, "")}/graphql`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.token}`,
      },
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });

    const data = (await res.json().catch(() => null)) as GraphQLResponse | null;

    if (!data) {
      throw new GithubError(
        "GitHub GraphQL returned an invalid response",
        "provider_error"
      );
    }

    if (data.errors && data.errors.length > 0) {
      throw new GithubError(
        data.errors[0].message ?? "GitHub GraphQL error",
        "validation_error"
      );
    }

    if (!res.ok) {
      throw new GithubError(
        `GitHub GraphQL error (HTTP ${res.status})`,
        "provider_error",
        res.status
      );
    }

    return data;
  } catch (error) {
    if (error instanceof GithubError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new GithubError("GitHub request timed out", "network_error");
    }
    throw new GithubError("GitHub API is unreachable", "network_error");
  } finally {
    clearTimeout(timeout);
  }
}
