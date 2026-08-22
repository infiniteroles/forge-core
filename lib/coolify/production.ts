/**
 * Production deploy trigger via Coolify API (Fase 4.2).
 *
 * Fase 4.1 revealed that Coolify does NOT auto-deploy `main` after a PR merge
 * (the Forge app is on manual deploy). This module resolves the production
 * application and triggers its deployment through the Coolify API so the
 * async promotion job can close the loop: merge → trigger deploy → wait →
 * verify.
 *
 * Modes:
 *  - `manual_wait` (default): do NOT call Coolify; just wait/poll the
 *    production endpoints (legacy behaviour). A human triggers the deploy.
 *  - `coolify_api`: resolve the app (by configured UUID or by domain
 *    discovery) and call POST /applications/{uuid}/start to deploy `main`.
 *
 * The API token is never exposed — only `hasToken` / config booleans.
 */

import {
  coolifyFetch,
  CoolifyError,
  getCoolifyConfig,
  isCoolifyConfigured,
  listCoolifyApplications,
} from "./client";

export type ProductionDeployMode = "manual_wait" | "coolify_api";

export interface ProductionDeployConfig {
  mode: ProductionDeployMode;
  /** Base URL of the production environment. */
  productionBaseUrl: string;
  /** Explicit Coolify application UUID if configured (PRODUCTION_COOLIFY_APPLICATION_UUID). */
  applicationUuid: string | null;
  /** Max time (ms) for the trigger call itself. */
  triggerTimeoutMs: number;
  /** Max time (ms) to wait for the deploy to pick up the merge. */
  deployWaitMs: number;
  /** How often (ms) to poll while waiting. */
  deployPollIntervalMs: number;
}

export interface ProductionApplicationResolution {
  applicationUuid: string;
  method: "configured" | "discovered";
  domains: string[];
  name: string | null;
}

export interface ProductionDeployTriggerResult {
  mode: ProductionDeployMode;
  applicationUuid: string;
  triggered: boolean;
  deploymentUuid: string | null;
  status: string | null;
  triggeredAt: string;
}

/**
 * Reads the production-deploy configuration from the environment.
 */
export function getProductionDeployConfig(): ProductionDeployConfig {
  const modeRaw = (process.env.PRODUCTION_DEPLOY_MODE ?? "manual_wait").trim();
  const mode: ProductionDeployMode =
    modeRaw === "coolify_api" ? "coolify_api" : "manual_wait";
  return {
    mode,
    productionBaseUrl:
      process.env.PRODUCTION_BASE_URL ?? "https://forge-app.dev.core01.io",
    applicationUuid:
      (process.env.PRODUCTION_COOLIFY_APPLICATION_UUID ?? "").trim() || null,
    triggerTimeoutMs: Number(
      process.env.PRODUCTION_DEPLOY_TRIGGER_TIMEOUT_MS ?? "30000"
    ),
    deployWaitMs: Number(process.env.PRODUCTION_DEPLOY_WAIT_MS ?? "600000"),
    deployPollIntervalMs: Number(
      process.env.PRODUCTION_DEPLOY_POLL_INTERVAL_MS ?? "10000"
    ),
  };
}

export function isProductionDeployViaCoolify(): boolean {
  return getProductionDeployConfig().mode === "coolify_api";
}

/** Extracts the host from a URL (or returns the string as-is). */
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Resolves the production Coolify application:
 *  1. If PRODUCTION_COOLIFY_APPLICATION_UUID is set, use it (validated if the
 *     API is reachable).
 *  2. Otherwise discover by listing applications and matching the production
 *     domain against each app's `domains` field.
 * Never logs the token.
 */
export async function resolveProductionApplication(): Promise<ProductionApplicationResolution> {
  const cfg = getProductionDeployConfig();

  if (cfg.applicationUuid) {
    return {
      applicationUuid: cfg.applicationUuid,
      method: "configured",
      domains: [],
      name: null,
    };
  }

  if (!isCoolifyConfigured()) {
    throw new CoolifyError(
      "Coolify API token is not configured — cannot discover the production app. Set PRODUCTION_COOLIFY_APPLICATION_UUID or configure COOLIFY_API_TOKEN.",
      "not_configured"
    );
  }

  const productionHost = hostOf(cfg.productionBaseUrl);
  const apps = await listCoolifyApplications();
  const match = apps.find((app) => {
    const domains = (app.domains ?? "")
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
    return domains.some((d) => hostOf(d) === productionHost);
  });

  if (!match?.uuid) {
    throw new CoolifyError(
      `No se pudo descubrir la app principal de producción (dominio ${productionHost}). Configura PRODUCTION_COOLIFY_APPLICATION_UUID o revisa el dominio en Coolify.`,
      "not_found"
    );
  }

  return {
    applicationUuid: match.uuid,
    method: "discovered",
    domains: (match.domains ?? "")
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean),
    name: match.name,
  };
}

/**
 * Triggers a deployment of the production application on Coolify.
 *
 * Uses the same endpoint validated for preview apps:
 *   POST /api/v1/applications/{uuid}/start   (action_deploy)
 * There is no `/applications/{uuid}/deploy` endpoint.
 */
export async function triggerProductionDeployment(): Promise<ProductionDeployTriggerResult> {
  const cfg = getProductionDeployConfig();
  if (cfg.mode !== "coolify_api") {
    throw new CoolifyError(
      "PRODUCTION_DEPLOY_MODE no es coolify_api; no se dispara el deploy vía Coolify.",
      "mode_mismatch"
    );
  }

  const resolved = await resolveProductionApplication();

  const data = await coolifyFetch<{
    deployments?: { uuid?: string; status?: string }[];
    deployment_uuid?: string;
    status?: string;
  }>(`/applications/${encodeURIComponent(resolved.applicationUuid)}/start`, {
    method: "POST",
  });

  const deployment = data?.deployments?.[0];
  const deploymentUuid = deployment?.uuid ?? data?.deployment_uuid ?? null;
  const status = deployment?.status ?? data?.status ?? "triggered";

  return {
    mode: cfg.mode,
    applicationUuid: resolved.applicationUuid,
    triggered: true,
    deploymentUuid,
    status,
    triggeredAt: new Date().toISOString(),
  };
}

/**
 * Queries the live status of a Coolify deployment by UUID.
 */
export async function getProductionDeploymentStatus(deploymentUuid: string): Promise<{
  status: string | null;
  logUrl: string | null;
}> {
  const data = await coolifyFetch<{ status?: string; log_url?: string }>(
    `/deployments/${encodeURIComponent(deploymentUuid)}`
  );
  return {
    status: data?.status ?? null,
    logUrl: data?.log_url ?? null,
  };
}

export { CoolifyError, getCoolifyConfig, isCoolifyConfigured };
