// Fase 6.0 — Chat Composer: multi-turn discovery agent.
// Asks the minimum essential questions and produces a structured ComposerSpec.

import { chatCompletion } from "@/lib/llm/client";
import type { LLMMessage } from "@/lib/llm/types";
import type {
  ComposerMessage,
  ComposerSpec,
  ComposerTurnResult,
} from "./types";

const SYSTEM_PROMPT = `You are "Forge Composer", the conversational onboarding agent of a product builder. You help a user describe the app they want and you ask the MINIMUM essential questions, one or a few at a time, in a friendly way.

Discovery order (ask only what is still missing):
1. Project name (required).
2. What the app does / purpose (required).
3. Repository: does the user want none, a new repo, or an existing repo URL?
4. Auth/login: none, single user, or multi-user (with provider preference if any, e.g. email/password, Google, GitHub).
5. Audience: is it for a single user or many users?
6. Visual style: default is shadcn/ui; Material 3 is an alternative. If the user uploads a logo, infer a palette/style from its dominant colors and confirm. Only create a style from an explicit description; NEVER invent a logo.

Rules:
- Keep replies short and human (Spanish, unless the user writes in another language).
- Do NOT invent requirements the user did not state.
- When you have enough info (at least name, purpose, auth and uiLibrary decided), emit the final spec.

Respond with STRICT JSON only:
- If you still need info: {"kind":"question","text":"<your question or confirmation>"}
- If you have enough: {"kind":"spec","text":"<short confirmation summary>","spec":{...}}

ComposerSpec shape:
{
  "name": string,
  "purpose": string,
  "repo": "none" | "new" | "<url>",
  "auth": "none" | "single_user" | "multi_user",
  "authProvider"?: string,
  "audience"?: string,
  "uiLibrary": "shadcn" | "material3" | "other",
  "palette"?: string[],
  "logoStyle"?: {"hasLogo": boolean, "dominantColors": string[], "notes"?: string}
}`;

const REQUIRED_SPEC_FIELDS = ["name", "purpose", "auth", "uiLibrary"] as const;

export function specLooksComplete(spec: ComposerSpec | null | undefined): boolean {
  if (!spec || typeof spec !== "object") return false;
  return REQUIRED_SPEC_FIELDS.every((f) => {
    const v = (spec as Record<string, unknown>)[f];
    return typeof v === "string" && v.trim().length > 0;
  });
}

function toLLMMessages(history: ComposerMessage[], latestUser: string): LLMMessage[] {
  const msgs: LLMMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
  for (const m of history) {
    if (m.role === "user") {
      msgs.push({
        role: "user",
        content: m.kind === "logo"
          ? `[El usuario ha subido un logo. Paleta dominante aproximada: ${m.content}]`
          : m.content,
      });
    } else {
      msgs.push({ role: "assistant", content: m.content });
    }
  }
  msgs.push({ role: "user", content: latestUser });
  return msgs;
}

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

/**
 * Runs one discovery turn. `history` is the previous ComposerMessages (without
 * the current user message), `latestUser` is the newest user input.
 */
export async function runDiscoveryTurn(
  history: ComposerMessage[],
  latestUser: string
): Promise<ComposerTurnResult> {
  const result = await chatCompletion({
    messages: toLLMMessages(history, latestUser),
    temperature: 0.2,
    maxTokens: 1600,
    responseFormat: "json_object",
  });

  const parsed = extractJsonObject(result.content);
  const kind = parsed?.kind === "spec" ? "spec" : "question";
  const text =
    typeof parsed?.text === "string" && parsed.text.trim()
      ? parsed.text.trim()
      : kind === "spec"
        ? "He reunido lo esencial. Revisa el resumen y confírmalo o dime qué cambiar."
        : "Cuéntame un poco más para poder arrancar.";

  let spec: ComposerSpec | null = null;
  let status: ComposerTurnResult["status"] = "discovering";
  if (kind === "spec") {
    const candidate = parsed?.spec as ComposerSpec | undefined;
    if (specLooksComplete(candidate)) {
      spec = candidate;
      status = "proposal";
    } else {
      // Incomplete spec → keep asking.
      return {
        reply:
          "Me falta cerrar algún detalle imprescindible (nombre, propósito, login y estilo visual). " +
          text,
        kind: "text",
        status: "discovering",
      };
    }
  }

  return { reply: text, kind: kind === "spec" ? "spec" : "text", spec, status };
}
