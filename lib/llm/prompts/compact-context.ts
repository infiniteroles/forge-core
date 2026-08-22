/**
 * Compact context helpers (Fase 4.5).
 *
 * Small helpers used by the context builders to keep embedded context lean:
 * truncate summaries, activity messages and agent-run lines before they are
 * injected into a prompt. Pure functions — no behavior change, just less
 * context per call.
 */

/** Keeps the first `max` characters of a single-line text. */
export function compactLine(text: string | null | undefined, max = 160): string {
  if (!text) return "";
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? oneLine.slice(0, max) + "…" : oneLine;
}

/** Formats an activity event compactly: "type — message (time)". */
export function compactActivity(
  type: string,
  message: string,
  max = 140
): string {
  const m = compactLine(message, max);
  return m ? `${type}: ${m}` : type;
}

/** Formats a work-session row compactly for the iteration history. */
export function compactWorkSessionRow(input: {
  id: string;
  status: string;
  summary: string | null;
  iterationNumber: number;
  max?: number;
}): string {
  const summary = compactLine(input.summary, input.max ?? 160);
  const base = `#${input.iterationNumber} ${input.status} (${input.id})`;
  return summary ? `${base}: ${summary}` : base;
}
