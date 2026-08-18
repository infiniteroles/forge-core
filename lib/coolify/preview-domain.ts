import { getCoolifyConfig } from "./client";

/**
 * Slugs a string into a safe DNS label: lowercase, no accents, only
 * [a-z0-9-], trimmed, reasonable max length.
 */
export function slugifyLabel(input: string, max = 40): string {
  const normalized = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (normalized || "preview").slice(0, max);
}

/**
 * Builds the base preview domain for a task/session:
 *   preview-<taskShortId>.dev.core01.io
 * or (when a session id is given) ws-<sessionShortId>.dev.core01.io.
 * Only ever uses the configured PREVIEW_DOMAIN_SUFFIX. Never external domains.
 */
export function buildPreviewDomain(
  taskId: string,
  workSessionId: string | null
): string {
  const cfg = getCoolifyConfig();
  const suffix = cfg.domainSuffix.startsWith(".")
    ? cfg.domainSuffix
    : `.${cfg.domainSuffix}`;
  const short = workSessionId
    ? `ws-${workSessionId.slice(0, 6)}`
    : `preview-${taskId.slice(0, 6)}`;
  return `${short}${suffix}`;
}

/**
 * Returns a domain that does not collide with an existing PreviewDeployment
 * in Forge (or an optional set of taken labels). Tries preview-<short>,
 * preview-<short>-2, preview-<short>-3, … up to a sane limit.
 */
export async function buildFreePreviewDomain(
  taskId: string,
  workSessionId: string | null,
  opts: { projectId?: string; taken?: Set<string> } = {}
): Promise<string> {
  const base = buildPreviewDomain(taskId, workSessionId);
  const suffix = base.slice(base.indexOf("."));
  const label = base.slice(0, base.indexOf("."));
  const taken = opts.taken ?? new Set<string>();

  if (!taken.has(label)) return base;

  for (let i = 2; i <= 20; i++) {
    const candidate = `${label}-${i}`;
    if (!taken.has(candidate)) return `${candidate}${suffix}`;
  }
  return `${label}-${Date.now().toString(36).slice(-4)}${suffix}`;
}

/**
 * App name shown in Coolify for a preview app, e.g. forge-preview-<taskShort>.
 */
export function buildPreviewAppName(taskId: string): string {
  const prefix = (process.env.PREVIEW_APP_NAME_PREFIX ?? "forge-preview").trim();
  const short = taskId.slice(0, 6);
  return `${prefix}-${short}`;
}
