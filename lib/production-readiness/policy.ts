/**
 * Production Readiness policy (Fase 3.8).
 *
 * The gate is always AVAILABLE as a read-only review layer. Merge automation,
 * deploy automation and production writes are always DISABLED — this phase
 * only PREPARES a readiness summary for human approval.
 */

export interface ProductionReadinessPolicy {
  gateAvailable: boolean;
  mergeAutomationEnabled: boolean;
  deployAutomationEnabled: boolean;
  approvalRequired: boolean;
}

export function getProductionReadinessPolicy(): ProductionReadinessPolicy {
  return {
    gateAvailable: true,
    mergeAutomationEnabled: false,
    deployAutomationEnabled: false,
    approvalRequired: true,
  };
}

/** Short human-readable labels for settings/UI. */
export const PRODUCTION_READINESS_LABELS = {
  gateAvailable: "Available",
  mergeAutomationEnabled: "Disabled",
  deployAutomationEnabled: "Disabled",
  approvalRequired: "Yes",
} as const;
