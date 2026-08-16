import { z } from "zod";

export type LLMRole = "system" | "user" | "assistant";

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export interface LLMChatParams {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Optional: request JSON output (OpenAI-compatible `response_format`). */
  responseFormat?: "json_object";
}

export interface LLMChatResult {
  /** Raw text content returned by the model. */
  content: string;
  /** Model actually used (echoed by the provider when available). */
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
  };
}

export interface LLMProviderConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

export class LLMError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "LLMError";
    this.code = code;
  }
}

// ── Planner output ────────────────────────────────────────────────────────────

export const plannerOutputSchema = z.object({
  summary: z.string(),
  recommended_next_phase: z.string(),
  objectives: z.array(z.string()),
  proposed_tasks: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      priority: z.enum(["high", "medium", "low"]),
      type: z.enum(["product", "frontend", "backend", "infra", "qa", "docs"]),
    })
  ),
  risks: z.array(z.string()),
  questions: z.array(z.string()),
  acceptance_criteria: z.array(z.string()),
});

export type PlannerOutput = z.infer<typeof plannerOutputSchema>;
