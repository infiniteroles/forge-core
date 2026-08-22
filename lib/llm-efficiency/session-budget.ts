/**
 * Per-work-session LLM budget (Fase 4.5).
 *
 * Non-aggressive guardrail: count LLM calls (AgentRuns) for a session and warn
 * / stop only above configured thresholds. Nothing is hard-blocked by default.
 *
 * Env:
 *   LLM_MAX_CALLS_PER_WORK_SESSION="5"
 *   LLM_MAX_CALLS_PER_ITERATION="3"
 *   LLM_WARN_AFTER_CALLS="3"
 */

export interface SessionBudgetPolicy {
  maxCallsPerSession: number | null;
  maxCallsPerIteration: number | null;
  warnAfterCalls: number | null;
}

export function getSessionBudgetPolicy(): SessionBudgetPolicy {
  const num = (key: string, fallback: number | null) => {
    const v = Number(process.env[key] ?? "");
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  return {
    maxCallsPerSession: num("LLM_MAX_CALLS_PER_WORK_SESSION", null),
    maxCallsPerIteration: num("LLM_MAX_CALLS_PER_ITERATION", null),
    warnAfterCalls: num("LLM_WARN_AFTER_CALLS", null),
  };
}

export interface BudgetCheck {
  /** Human-facing status: ok | warning | exceeded. */
  level: "ok" | "warning" | "exceeded";
  calls: number;
  limit: number | null;
  warnAfter: number | null;
}

/**
 * Evaluates the budget for a session/iteration given the number of LLM calls
 * (AgentRuns) already performed.
 */
export function checkSessionBudget(
  calls: number,
  opts?: { iterationCalls?: number }
): BudgetCheck {
  const policy = getSessionBudgetPolicy();
  const iterationCalls = opts?.iterationCalls ?? calls;

  // Iteration cap (stricter) takes precedence.
  if (policy.maxCallsPerIteration !== null && iterationCalls >= policy.maxCallsPerIteration) {
    return { level: "exceeded", calls, limit: policy.maxCallsPerIteration, warnAfter: policy.warnAfterCalls };
  }
  if (policy.maxCallsPerSession !== null && calls >= policy.maxCallsPerSession) {
    return { level: "exceeded", calls, limit: policy.maxCallsPerSession, warnAfter: policy.warnAfterCalls };
  }
  if (policy.warnAfterCalls !== null && calls >= policy.warnAfterCalls) {
    return { level: "warning", calls, limit: policy.maxCallsPerSession, warnAfter: policy.warnAfterCalls };
  }
  return { level: "ok", calls, limit: policy.maxCallsPerSession, warnAfter: policy.warnAfterCalls };
}
