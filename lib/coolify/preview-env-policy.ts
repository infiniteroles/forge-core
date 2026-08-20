/**
 * Preview Runtime Environment policy (Fase 3.7C).
 *
 * Decides which environment variables Forge may inject into Coolify preview
 * applications so they can boot, without copying all of Forge's secrets and
 * without ever turning previews into production.
 *
 * SECURITY: this module never returns or logs real values — it only reasons
 * about keys and generates non-secret values (APP_URL / NEXT_PUBLIC_APP_URL /
 * NODE_ENV).
 */

export const PREVIEW_ENV_MODES = ["disabled", "minimal", "shared_dev"] as const;
export type PreviewEnvMode = (typeof PREVIEW_ENV_MODES)[number];

export const PREVIEW_ENV_DEFAULT_ALLOWED_KEYS = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "APP_URL",
  "NEXT_PUBLIC_APP_URL",
  "NODE_ENV",
] as const;

// Keys Forge generates itself (never copied from the Forge process env).
const GENERATED_KEYS = ["APP_URL", "NEXT_PUBLIC_APP_URL", "NODE_ENV"] as const;

// Always forbidden, even if someone puts them in PREVIEW_ENV_ALLOWED_KEYS.
const FORBIDDEN_EXACT = [
  "COOLIFY_API_TOKEN",
  "COOLIFY_BASE_URL",
  "COOLIFY_SERVER_UUID",
  "COOLIFY_PROJECT_UUID",
  "COOLIFY_ENVIRONMENT_NAME",
  "GITHUB_TOKEN",
  "GITHUB_API_BASE_URL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_MODEL",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "LLM_API_KEY",
  "LLM_REQUEST_TIMEOUT_MS",
  "PRIVATE_KEY",
  "SSH_KEY",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD_HASH",
] as const;

// Forbidden suffixes (unless explicitly excepted). Covers *_TOKEN, *_PASSWORD,
// *_SECRET and any *.credentials file entries.
const FORBIDDEN_SUFFIXES = ["_TOKEN", "_PASSWORD", "_SECRET", "_KEY", ".CREDENTIALS"] as const;
// Explicit exception: AUTH_SECRET is required for the app to boot.
const FORBIDDEN_SUFFIX_EXCEPTIONS = ["AUTH_SECRET"] as const;

export interface PreviewEnvConfig {
  mode: PreviewEnvMode;
  allowedKeys: string[];
  nodeEnv: string;
  appUrlTemplate: string;
}

/**
 * Reads the preview env policy from the environment.
 */
export function getPreviewEnvConfig(): PreviewEnvConfig {
  const modeRaw = (process.env.PREVIEW_ENV_MODE ?? "disabled").trim().toLowerCase();
  const mode: PreviewEnvMode =
    modeRaw === "minimal" || modeRaw === "shared_dev" ? modeRaw : "disabled";

  const allowedRaw = (process.env.PREVIEW_ENV_ALLOWED_KEYS ?? "").trim();
  const allowedKeys = (allowedRaw
    ? allowedRaw.split(",")
    : PREVIEW_ENV_DEFAULT_ALLOWED_KEYS
  )
    .map((k) => k.trim().toUpperCase())
    .filter(Boolean);

  return {
    mode,
    allowedKeys,
    nodeEnv: process.env.PREVIEW_ENV_NODE_ENV ?? "production",
    appUrlTemplate: process.env.PREVIEW_ENV_APP_URL_TEMPLATE ?? "https://{domain}",
  };
}

/**
 * True when a key must NEVER be copied into a preview application.
 */
export function isPreviewEnvKeyForbidden(key: string): boolean {
  const k = (key ?? "").trim().toUpperCase();
  if (!k) return true;
  if ((FORBIDDEN_EXACT as readonly string[]).includes(k)) return true;
  if ((FORBIDDEN_SUFFIX_EXCEPTIONS as readonly string[]).includes(k)) return false;
  for (const suffix of FORBIDDEN_SUFFIXES) {
    if (k.endsWith(suffix)) return true;
  }
  return false;
}

/**
 * True when a key may be injected under the current mode + allowlist.
 */
export function isPreviewEnvKeyAllowed(
  key: string,
  config: PreviewEnvConfig = getPreviewEnvConfig()
): boolean {
  const k = (key ?? "").trim().toUpperCase();
  if (isPreviewEnvKeyForbidden(k)) return false;
  if (config.mode === "minimal") {
    return (GENERATED_KEYS as readonly string[]).includes(k);
  }
  if (config.mode === "shared_dev") {
    return config.allowedKeys.includes(k);
  }
  return false;
}

/**
 * Redacts a value for any safe display path. Only NODE_ENV is treated as a
 * non-secret literal; everything else is masked.
 */
export function redactEnvValue(key: string, value: string): string {
  const k = (key ?? "").trim().toUpperCase();
  if (k === "NODE_ENV") return value;
  return value ? "••••••" : "";
}

export interface PreviewEnvVariable {
  key: string;
  value: string;
  isRuntime: boolean;
  isBuildtime: boolean;
}

export interface BuiltPreviewEnvironment {
  variables: PreviewEnvVariable[];
  skipped: string[];
  unavailable: string[];
}

/**
 * Builds the env vars to inject into a preview application for a domain,
 * following the configured mode and the allowlist/denylist. Never includes
 * forbidden secrets. `skipped` lists forbidden keys that were present in the
 * source env (proving they were blocked); `unavailable` lists allowed keys
 * that were missing from the source.
 */
export function buildPreviewEnvironmentVariables(input: {
  domain: string;
  config?: PreviewEnvConfig;
  source?: Record<string, string | undefined>;
}): BuiltPreviewEnvironment {
  const config = input.config ?? getPreviewEnvConfig();
  const source: Record<string, string | undefined> = input.source ?? process.env;
  const variables: PreviewEnvVariable[] = [];
  const skipped: string[] = [];
  const unavailable: string[] = [];

  // If the mode is disabled, nothing is injected.
  if (config.mode === "disabled") {
    return { variables, skipped, unavailable };
  }

  const domain = (input.domain ?? "").replace(/^https?:\/\//, "").trim();
  const generated: Record<string, string> = {
    APP_URL: config.appUrlTemplate.replace("{domain}", domain),
    NEXT_PUBLIC_APP_URL: config.appUrlTemplate.replace("{domain}", domain),
    NODE_ENV: config.nodeEnv,
  };

  // Report forbidden keys present in the source env (they were deliberately
  // not copied) so the UI/ActivityLog can prove the denylist worked.
  for (const key of Object.keys(source)) {
    const k = key.trim().toUpperCase();
    if (k && isPreviewEnvKeyForbidden(k) && !skipped.includes(k)) {
      skipped.push(k);
    }
  }

  // Decide the candidate key set.
  let candidates: string[];
  if (config.mode === "minimal") {
    candidates = GENERATED_KEYS.slice();
  } else if (config.mode === "shared_dev") {
    candidates = config.allowedKeys.slice();
  } else {
    candidates = [];
  }

  for (const rawKey of candidates) {
    const key = rawKey.trim().toUpperCase();
    if (isPreviewEnvKeyForbidden(key)) {
      if (!skipped.includes(key)) skipped.push(key);
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(generated, key)) {
      const value = generated[key];
      variables.push({
        key,
        value,
        isRuntime: true,
        // Only NEXT_PUBLIC_* needs to be baked in at build time. NODE_ENV must
        // stay runtime-only: if NODE_ENV=production is present during the
        // build, `npm ci` skips devDependencies and the Next.js build fails
        // (e.g. "Cannot find module 'tailwindcss'").
        isBuildtime: key.startsWith("NEXT_PUBLIC_"),
      });
      continue;
    }
    if (config.mode !== "shared_dev") {
      continue;
    }
    const value = source[key];
    if (value === undefined || value === null || value.trim() === "") {
      unavailable.push(key);
      continue;
    }
    variables.push({
      key,
      value,
      isRuntime: true,
      isBuildtime: key.startsWith("NEXT_PUBLIC_"),
    });
  }

  return { variables, skipped: [...new Set(skipped)].sort(), unavailable: [...new Set(unavailable)].sort() };
}
