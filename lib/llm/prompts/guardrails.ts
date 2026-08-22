/**
 * Compact guardrails (Fase 4.5).
 *
 * A single short, reusable guardrails block for LLM prompts — the long-form
 * instructions stay in each agent's own SYSTEM_PROMPT; this compact constant
 * is used where a short reminder is enough. Keeps prompts lean without
 * changing behavior.
 */

export const COMPACT_GUARDRAILS = `GUARDRAILS (compact):
- Never touch main, never merge, never deploy outside the flow.
- Never read, write or propose secrets / .env / credentials.
- Only use the context provided; never invent files or APIs.
- Stay inside the task branch and the safe-file policy.
- Reply only with the requested JSON — no markdown fences.`;

export const COMPACT_GUARDRAILS_SHORT = `No merge. No deploy. No secrets. No files outside the task branch. JSON only.`;
