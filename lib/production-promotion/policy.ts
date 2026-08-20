import type { ProductionMergeMethod, ProductionPromotionMode } from "./types";

export interface ProductionPromotionPolicy {
  /** How a promotion is executed against the repository. */
  strategy: "github_pr_merge";
  /** The merge method used when merging the pull request. */
  mergeMethod: ProductionMergeMethod;
  /** How the deployment wait phase behaves. */
  deployMode: "wait_for_existing_deploy";
  /** Base URL of the production environment, used for post-merge health checks. */
  productionBaseUrl: string;
  /** Max time to wait (ms) for the production deploy to pick up the merge. */
  deployWaitMs: number;
  /** How often (ms) to poll the production endpoint while waiting. */
  deployPollIntervalMs: number;
  /** Explicit confirmation word required to execute a promotion. */
  confirmWord: "PROMOTE";
}

/**
 * Returns the effective promotion policy, reading configuration from the
 * environment with sensible defaults for Forge Core01.
 */
export function getProductionPromotionPolicy(): ProductionPromotionPolicy {
  return {
    strategy: "github_pr_merge",
    mergeMethod: "squash",
    deployMode: "wait_for_existing_deploy",
    productionBaseUrl:
      process.env.PRODUCTION_BASE_URL ?? "https://forge-app.dev.core01.io",
    deployWaitMs: Number(
      process.env.PRODUCTION_DEPLOY_WAIT_MS ?? "180000"
    ),
    deployPollIntervalMs: Number(
      process.env.PRODUCTION_DEPLOY_POLL_INTERVAL_MS ?? "10000"
    ),
    confirmWord: "PROMOTE",
  };
}

export function isPromotionModeEnabled(mode?: string | null): boolean {
  const raw = (mode ?? process.env.PRODUCTION_PROMOTION_MODE ?? "").trim();
  return raw.length > 0 && raw !== "disabled";
}
