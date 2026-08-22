import type { ProductionMergeMethod, ProductionPromotionMode } from "./types";

export type ProductionDeployMode = "manual_wait" | "coolify_api";

export interface ProductionPromotionPolicy {
  /** How a promotion is executed against the repository. */
  strategy: "github_pr_merge";
  /** The merge method used when merging the pull request. */
  mergeMethod: ProductionMergeMethod;
  /**
   * How the deployment is triggered after the merge:
   *  - manual_wait: no Coolify call, just wait/poll the endpoints (legacy).
   *  - coolify_api: resolve + trigger the production app deploy via Coolify.
   */
  deployMode: ProductionDeployMode;
  /** Explicit Coolify application UUID for the production app (nullable). */
  productionCoolifyApplicationUuid: string | null;
  /** Base URL of the production environment, used for post-merge health checks. */
  productionBaseUrl: string;
  /** Max time (ms) to wait for the production deploy to pick up the merge. */
  deployWaitMs: number;
  /** How often (ms) to poll the production endpoint while waiting. */
  deployPollIntervalMs: number;
  /** Max time (ms) for the Coolify trigger call itself. */
  deployTriggerTimeoutMs: number;
  /** Explicit confirmation word required to execute a promotion. */
  confirmWord: "PROMOTE";
}

/**
 * Returns the effective promotion policy, reading configuration from the
 * environment with sensible defaults for Forge Core01.
 */
export function getProductionPromotionPolicy(): ProductionPromotionPolicy {
  const deployModeRaw = (process.env.PRODUCTION_DEPLOY_MODE ?? "manual_wait").trim();
  return {
    strategy: "github_pr_merge",
    mergeMethod: "squash",
    deployMode: deployModeRaw === "coolify_api" ? "coolify_api" : "manual_wait",
    productionCoolifyApplicationUuid:
      (process.env.PRODUCTION_COOLIFY_APPLICATION_UUID ?? "").trim() || null,
    productionBaseUrl:
      process.env.PRODUCTION_BASE_URL ?? "https://forge-app.dev.core01.io",
    deployWaitMs: Number(
      process.env.PRODUCTION_DEPLOY_WAIT_MS ?? "600000"
    ),
    deployPollIntervalMs: Number(
      process.env.PRODUCTION_DEPLOY_POLL_INTERVAL_MS ?? "10000"
    ),
    deployTriggerTimeoutMs: Number(
      process.env.PRODUCTION_DEPLOY_TRIGGER_TIMEOUT_MS ?? "30000"
    ),
    confirmWord: "PROMOTE",
  };
}

export function isPromotionModeEnabled(mode?: string | null): boolean {
  const raw = (mode ?? process.env.PRODUCTION_PROMOTION_MODE ?? "").trim();
  return raw.length > 0 && raw !== "disabled";
}
