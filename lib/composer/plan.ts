// Fase 6.0 — Chat Composer: development & test plan generator.
// From a confirmed proposal (and optional user feedback), produces a pragmatic
// build/test plan for the autonomous phase.

import { chatCompletion } from "@/lib/llm/client";
import type { LLMMessage } from "@/lib/llm/types";
import type { ComposerPlan, ComposerProposal, ComposerSpec } from "./types";

const SYSTEM_PROMPT = `You are the engineering planner of "Forge Composer". Based on a confirmed app spec and architecture proposal you produce a pragmatic development and test plan. Keep it realistic and ordered; avoid over-engineering. Phases should go from setup → data model → auth → core backend → frontend → tests → polish. Tasks must be concrete and small enough to build autonomously. Testing must be pragmatic (unit tests for core logic, an API smoke test, and a manual checklist for the user to verify the MVP).

Respond with STRICT JSON only, matching this shape:
{
  "summary": "1-2 sentences in the user's language summarizing the plan",
  "phases": ["Setup", "...", "Tests"],
  "tasks": [
    {"title": "...", "description": "...", "kind": "setup|db|auth|backend|frontend|test"}
  ],
  "testStrategy": "short description of the testing approach",
  "risks": ["optional risk bullets"]
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

export async function generatePlan(
  spec: ComposerSpec,
  proposal: ComposerProposal,
  feedback?: string
): Promise<ComposerPlan> {
  const messages: LLMMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `App spec:\n${JSON.stringify(spec, null, 2)}\n\n` +
        `Architecture proposal:\n${JSON.stringify(proposal, null, 2)}\n\n` +
        (feedback ? `User feedback on the previous plan:\n${feedback}\n\n` : "") +
        `Generate the development and test plan.`,
    },
  ];

  const result = await chatCompletion({
    messages,
    temperature: 0.3,
    maxTokens: 2400,
    responseFormat: "json_object",
  });

  const parsed = extractJsonObject(result.content);
  const tasks = Array.isArray(parsed?.tasks)
    ? (parsed.tasks as unknown[]).map((t) => {
        const o = (t ?? {}) as Record<string, unknown>;
        return {
          title: String(o.title ?? "Tarea"),
          description: String(o.description ?? ""),
          kind: String(o.kind ?? "backend"),
        };
      })
    : [{ title: "Preparar el proyecto base", description: "Scaffold inicial y configuración.", kind: "setup" }];

  return {
    summary:
      typeof parsed?.summary === "string"
        ? parsed.summary
        : "Plan de desarrollo generado.",
    phases: Array.isArray(parsed?.phases)
      ? (parsed.phases as string[])
      : ["Setup", "Core", "Tests"],
    tasks,
    testStrategy:
      typeof parsed?.testStrategy === "string"
        ? parsed.testStrategy
        : "Tests unitarios del núcleo + smoke test del endpoint principal.",
    risks: Array.isArray(parsed?.risks)
      ? (parsed.risks as string[])
      : undefined,
  };
}
