/**
 * LLM cost tracking (Fase 4.5).
 *
 * Minimal, non-blocking cost accounting. Nothing here blocks or gates calls:
 * if prices are not configured, the estimated cost stays null.
 *
 * Env:
 *   LLM_COST_TRACKING_ENABLED="true"
 *   LLM_DEEPSEEK_INPUT_COST_PER_1M="0.14"     (USD per 1M input tokens)
 *   LLM_DEEPSEEK_OUTPUT_COST_PER_1M="0.28"    (USD per 1M output tokens)
 */

export interface CostPolicy {
  enabled: boolean;
  inputCostPer1M: number | null;
  outputCostPer1M: number | null;
}

export function getCostPolicy(): CostPolicy {
  const enabled =
    (process.env.LLM_COST_TRACKING_ENABLED ?? "true").trim().toLowerCase() ===
    "true";
  const inputRaw = (process.env.LLM_DEEPSEEK_INPUT_COST_PER_1M ?? "").trim();
  const outputRaw = (process.env.LLM_DEEPSEEK_OUTPUT_COST_PER_1M ?? "").trim();
  return {
    enabled,
    inputCostPer1M: inputRaw ? Number(inputRaw) : null,
    outputCostPer1M: outputRaw ? Number(outputRaw) : null,
  };
}

/** Estimated USD for a call, or null when prices are not configured. */
export function estimateCostUsd(
  promptTokens: number | null | undefined,
  completionTokens: number | null | undefined
): number | null {
  const policy = getCostPolicy();
  if (!policy.enabled) return null;
  const input = policy.inputCostPer1M ?? 0;
  const output = policy.outputCostPer1M ?? 0;
  const p = promptTokens ?? 0;
  const c = completionTokens ?? 0;
  if (input <= 0 && output <= 0) return null;
  const cost = (p / 1_000_000) * input + (c / 1_000_000) * output;
  // Keep at most 6 decimals to avoid floating noise.
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export interface UsageLike {
  usage?: { promptTokens?: number; completionTokens?: number } | undefined;
  model?: string | null | undefined;
}

/**
 * Builds the persistable usage columns for an AgentRun from a chat result.
 * All fields are null-safe: when the provider returns no usage or prices are
 * not configured, they stay null (nothing is invented).
 */
export function persistableUsage(
  result: UsageLike,
  provider?: string | null
): {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number | null;
  provider: string | null;
} {
  const promptTokens = result.usage?.promptTokens ?? null;
  const completionTokens = result.usage?.completionTokens ?? null;
  const totalTokens =
    promptTokens !== null && completionTokens !== null
      ? promptTokens + completionTokens
      : promptTokens !== null
        ? promptTokens
        : completionTokens !== null
          ? completionTokens
          : null;
  const estimatedCostUsd = estimateCostUsd(promptTokens, completionTokens);
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd,
    provider: provider ?? null,
  };
}
