/**
 * LLM context budget (Fase 4.5).
 *
 * Conservative, configurable limits that keep the prompts compact: how many
 * repo files are read, how many bytes per file, a hard total, and how many
 * recent ActivityLog events are included. Nothing here changes behavior — it
 * only trims context size.
 *
 * Env (defaults are deliberately conservative):
 *   LLM_CONTEXT_MAX_FILES="8"
 *   LLM_CONTEXT_MAX_FILE_BYTES="20000"
 *   LLM_CONTEXT_MAX_TOTAL_BYTES="80000"
 *   LLM_CONTEXT_INCLUDE_ACTIVITY_LIMIT="20"
 */

export interface ContextBudget {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  includeActivityLimit: number;
}

export function getContextBudget(): ContextBudget {
  const num = (key: string, fallback: number) => {
    const v = Number(process.env[key] ?? "");
    return Number.isFinite(v) && v > 0 ? v : fallback;
  };
  return {
    maxFiles: num("LLM_CONTEXT_MAX_FILES", 8),
    maxFileBytes: num("LLM_CONTEXT_MAX_FILE_BYTES", 20000),
    maxTotalBytes: num("LLM_CONTEXT_MAX_TOTAL_BYTES", 80000),
    includeActivityLimit: num("LLM_CONTEXT_INCLUDE_ACTIVITY_LIMIT", 20),
  };
}

/** Truncates a string to `maxBytes` characters (byte-ish approximation). */
export function truncateToBudget(content: string, maxBytes: number): string {
  if (content.length <= maxBytes) return content;
  return content.slice(0, maxBytes);
}
