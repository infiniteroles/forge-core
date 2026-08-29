// Fase 6.0 — Chat Composer: initial proposal generator.
// From a confirmed ComposerSpec, proposes stack / database / auth / hosting.

import { chatCompletion } from "@/lib/llm/client";
import { applySkill } from "@/lib/agents/skills";
import type { LLMMessage } from "@/lib/llm/types";
import type { ComposerProposal, ComposerSpec } from "./types";

const SYSTEM_PROMPT = `You are the architect of "Forge Composer". Based on a confirmed app spec you propose a pragmatic initial architecture. Default UI direction: shadcn/ui (or Material 3 if the user chose it). Keep the proposal minimal and standard, avoid over-engineering. Prefer: Next.js + React + TypeScript, PostgreSQL, Prisma; auth via a managed provider (e.g. NextAuth/Auth.js) or none; hosting on a container platform (Coolify/Docker) — unless the spec implies otherwise.

Respond with STRICT JSON only, matching this shape:
{
  "summary": "1-2 sentences in the user's language explaining the proposal",
  "stack": {
    "frontend": "...",
    "backend": "...",
    "database": "...",
    "auth": "...",
    "hosting": "..."
  },
  "structure": ["optional bullet list of main app areas"],
  "openQuestions": ["anything you still need to decide before building, if any"]
}`;

function extractJsonObject(text: string): Record<string, unknown> | null {
  try {
    const trimmed = text.trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  return null;
}

export async function generateProposal(
  spec: ComposerSpec
): Promise<ComposerProposal> {
  const messages: LLMMessage[] = [
    { role: "system", content: applySkill("planner", SYSTEM_PROMPT) },
    {
      role: "user",
      content: `App spec:\n${JSON.stringify(spec, null, 2)}\n\nGenerate the initial architecture proposal.`,
    },
  ];

  const result = await chatCompletion({
    messages,
    temperature: 0.3,
    maxTokens: 1600,
    responseFormat: "json_object",
  });

  const parsed = extractJsonObject(result.content);
  const stack = (parsed?.stack as Record<string, unknown>) ?? {};
  return {
    summary:
      typeof parsed?.summary === "string"
        ? parsed.summary
        : "Propuesta inicial generada.",
    stack: {
      frontend: String(stack.frontend ?? "Next.js + React + TypeScript"),
      backend: String(stack.backend ?? "Next.js API routes"),
      database: String(stack.database ?? "PostgreSQL (Prisma)"),
      auth: String(stack.auth ?? "Ninguno (según spec)"),
      hosting: String(stack.hosting ?? "Coolify / Docker"),
    },
    structure: Array.isArray(parsed?.structure)
      ? (parsed.structure as string[])
      : undefined,
    openQuestions: Array.isArray(parsed?.openQuestions)
      ? (parsed.openQuestions as string[])
      : undefined,
  };
}
