import { PreviewRunnerConfig, CoolifyConnectionStatus } from "./types";

const REQUEST_TIMEOUT_MS = 15_000;

export interface CoolifyConfig {
  baseUrl: string;
  apiBaseUrl: string;
  hasToken: boolean;
  serverUuid: string | null;
  projectUuid: string | null;
  environmentName: string;
  domainSuffix: string;
}

/**
 * Reads the Coolify / preview configuration from the environment.
 * The API token is never returned to callers that render it — only a boolean
 * `hasToken` is exposed. Never log the token.
 */
export function getCoolifyConfig(): CoolifyConfig {
  const baseUrl = (process.env.COOLIFY_BASE_URL ?? "https://forge.core01.io").replace(/\/+$/, "");
  const token = process.env.COOLIFY_API_TOKEN ?? "";
  const serverUuid = process.env.COOLIFY_SERVER_UUID ?? "";
  const projectUuid = process.env.COOLIFY_PROJECT_UUID ?? "";
  const environmentName = process.env.COOLIFY_ENVIRONMENT_NAME ?? "dev";
  const domainSuffix = process.env.PREVIEW_DOMAIN_SUFFIX ?? ".dev.core01.io";

  return {
    baseUrl,
    apiBaseUrl: `${baseUrl}/api/v1`,
    hasToken: token.trim().length > 0,
    serverUuid: serverUuid.trim() || null,
    projectUuid: projectUuid.trim() || null,
    environmentName,
    domainSuffix,
  };
}

export function isCoolifyConfigured(): boolean {
  const cfg = getCoolifyConfig();
  return cfg.hasToken && cfg.baseUrl.length > 0;
}

export class CoolifyError extends Error {
  code: string;
  status?: number;
  constructor(message: string, code = "provider_error", status?: number) {
    super(message);
    this.name = "CoolifyError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Authenticated fetch against the Coolify v4 REST API. The token is added as a
 * Bearer header only and is never included in error messages or logs.
 */
export async function coolifyFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const cfg = getCoolifyConfig();
  if (!cfg.hasToken) {
    throw new CoolifyError(
      "Coolify API token is not configured",
      "not_configured"
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${process.env.COOLIFY_API_TOKEN ?? ""}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 401 || res.status === 403) {
        throw new CoolifyError(
          "Coolify API rejected the token (check COOLIFY_API_TOKEN permissions)",
          "unauthorized",
          res.status
        );
      }
      if (res.status === 404) {
        throw new CoolifyError(
          "Coolify API resource not found",
          "not_found",
          res.status
        );
      }
      if (res.status === 429) {
        throw new CoolifyError("Coolify API rate limit exceeded", "rate_limited", res.status);
      }
      throw new CoolifyError(
        `Coolify API error (HTTP ${res.status})${body ? ": " + body.slice(0, 200) : ""}`,
        "provider_error",
        res.status
      );
    }

    return (await res.json().catch(() => null)) as T;
  } catch (error) {
    if (error instanceof CoolifyError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new CoolifyError("Coolify API request timed out", "timeout");
    }
    throw new CoolifyError(
      "Could not reach the Coolify API",
      "network_error"
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Lightweight connectivity check against the Coolify API. Never throws; returns
 * a readable status instead.
 */
export async function checkCoolifyConnection(): Promise<CoolifyConnectionStatus> {
  const cfg = getCoolifyConfig();
  if (!cfg.hasToken) {
    return { ok: false, error: "Coolify API token is not configured" };
  }
  try {
    const data = await coolifyFetch<{ version?: string }>("/version");
    return { ok: true, version: data?.version };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown Coolify API error",
    };
  }
}
