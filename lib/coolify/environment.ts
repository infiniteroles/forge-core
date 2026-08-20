/**
 * Coolify preview application environment (Fase 3.7C).
 *
 * Reads/writes env vars on a Coolify preview application through the Coolify
 * REST API, applying the PREVIEW_ENV_MODE policy. Never logs or returns real
 * values — only keys + a safe summary.
 *
 * Endpoint (verified against Coolify v4 sources):
 *   - PATCH /api/v1/applications/{uuid}/envs/bulk  -> upsert many envs
 *   - POST   /api/v1/applications/{uuid}/envs      -> create one env
 *   - PATCH  /api/v1/applications/{uuid}/envs      -> update one env (by key)
 *   - GET    /api/v1/applications/{uuid}/envs      -> list envs (values masked)
 */

import {
  coolifyFetch,
  CoolifyError,
  isCoolifyConfigured,
} from "./client";
import {
  buildPreviewEnvironmentVariables,
  getPreviewEnvConfig,
  PreviewEnvVariable,
} from "./preview-env-policy";

export interface PreviewEnvResult {
  configured: boolean;
  mode: string;
  keys: string[];
  skipped: string[];
  unavailable: string[];
  error?: string;
  configuredAt?: string;
}

/**
 * Lists the env var keys currently set on a Coolify application. Values are
 * masked by Coolify (our token has no read:sensitive) and are never returned.
 */
export async function getPreviewApplicationEnvironment(
  applicationUuid: string
): Promise<string[]> {
  const data = await coolifyFetch<Array<{ key?: string }>>(
    `/applications/${encodeURIComponent(applicationUuid)}/envs`
  );
  return (Array.isArray(data) ? data : [])
    .map((e) => e?.key)
    .filter((k): k is string => typeof k === "string" && k.length > 0);
}

/**
 * Sets the runtime env vars on a Coolify preview application for a domain,
 * following PREVIEW_ENV_MODE. Returns a safe summary (never values).
 *
 * - disabled  -> returns configured:false (no-op).
 * - minimal   -> only generated values (APP_URL, NEXT_PUBLIC_APP_URL, NODE_ENV).
 * - shared_dev-> allowlist values copied from Forge's env (denylist blocked).
 *
 * Throws CoolifyError on real API failures so the caller can decide how to
 * surface them (clear error + manual fallback).
 */
export async function setPreviewApplicationEnvironment(input: {
  applicationUuid: string;
  domain: string;
}): Promise<PreviewEnvResult> {
  const config = getPreviewEnvConfig();
  const base = {
    mode: config.mode,
    keys: [] as string[],
    skipped: [] as string[],
    unavailable: [] as string[],
  };

  if (config.mode === "disabled") {
    return { ...base, configured: false };
  }
  if (!isCoolifyConfigured()) {
    return { ...base, configured: false, error: "Coolify API token is not configured" };
  }

  const { variables, skipped, unavailable } = buildPreviewEnvironmentVariables({
    domain: input.domain,
    config,
  });

  if (variables.length === 0) {
    return { ...base, configured: false, skipped, unavailable };
  }

  const payload = variables.map((v) => ({
    key: v.key,
    value: v.value,
    is_preview: false,
    is_literal: true,
    is_multiline: false,
    is_shown_once: false,
    is_runtime: v.isRuntime,
    is_buildtime: v.isBuildtime,
  }));

  const uuid = encodeURIComponent(input.applicationUuid);
  try {
    // Primary: bulk upsert in a single call.
    await coolifyFetch(`/applications/${uuid}/envs/bulk`, {
      method: "PATCH",
      body: JSON.stringify({ data: payload }),
    });
  } catch (err) {
    const isNotFound =
      err instanceof CoolifyError && err.code === "not_found";
    const msg = err instanceof Error ? err.message : "";
    if (isNotFound || /not found/i.test(msg)) {
      // Fallback for versions without the bulk endpoint: per-key upsert.
      await applyEnvFallback(input.applicationUuid, variables);
    } else {
      throw err;
    }
  }

  return {
    ...base,
    configured: true,
    keys: variables.map((v) => v.key),
    skipped,
    unavailable,
    configuredAt: new Date().toISOString(),
  };
}

/**
 * Per-key create/update fallback for Coolify versions without the bulk route.
 */
async function applyEnvFallback(
  applicationUuid: string,
  variables: PreviewEnvVariable[]
): Promise<void> {
  const uuid = encodeURIComponent(applicationUuid);
  const existing = await getPreviewApplicationEnvironment(applicationUuid);
  const existingSet = new Set(existing.map((k) => k.toUpperCase()));

  for (const v of variables) {
    const body = {
      key: v.key,
      value: v.value,
      is_preview: false,
      is_literal: true,
      is_multiline: false,
      is_shown_once: false,
      is_runtime: v.isRuntime,
      is_buildtime: v.isBuildtime,
    };
    if (existingSet.has(v.key.toUpperCase())) {
      await coolifyFetch(`/applications/${uuid}/envs`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    } else {
      await coolifyFetch(`/applications/${uuid}/envs`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    }
  }
}
