import {
  LLMChatParams,
  LLMChatResult,
  LLMError,
  LLMProviderConfig,
} from "./types";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-pro";
const DEFAULT_TIMEOUT_MS = 90000;
const DEFAULT_MAX_TOKENS = 8000;

export function getLLMConfig(): LLMProviderConfig {
  return {
    apiKey: process.env.DEEPSEEK_API_KEY || undefined,
    baseUrl: process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL,
    model: process.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
    timeoutMs: Number(process.env.LLM_REQUEST_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  };
}

export function isLLMConfigured(): boolean {
  return Boolean(process.env.DEEPSEEK_API_KEY);
}

/**
 * Minimal OpenAI-compatible `chat/completions` call. Provider-agnostic:
 * base URL, model and key come from environment.
 *
 * Reintenta automáticamente errores transitorios del proveedor
 * (empty_response, timeout, fallos de red) — DeepSeek a veces devuelve
 * `empty_response` de forma intermitente y un segundo intento suele funcionar.
 * Nunca registra la API key.
 */
export async function chatCompletion(
  params: LLMChatParams,
  config?: LLMProviderConfig
): Promise<LLMChatResult> {
  const cfg = config ?? getLLMConfig();

  if (!cfg.apiKey) {
    throw new LLMError("LLM provider is not configured", "not_configured");
  }

  const url = `${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  // DeepSeek devuelve `empty_response` de forma intermitente; 5 reintentos con
  // backoff creciente dan margen para que el build autónomo no muera por un
  // par de respuestas vacías seguidas.
  const maxRetries = Number(process.env.LLM_MAX_RETRIES) || 5;
  const retryDelayMs = Number(process.env.LLM_RETRY_DELAY_MS) || 1200;

  const attemptOnce = async (): Promise<LLMChatResult> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
          model: cfg.model,
          messages: params.messages,
          temperature: params.temperature ?? 0.2,
          max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
          response_format: params.responseFormat
            ? { type: params.responseFormat }
            : undefined,
          stream: false,
        }),
        signal: controller.signal,
        // Do not surface the key in stack traces on connection errors.
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new LLMError(
          `LLM provider error (HTTP ${res.status}): ${text.slice(0, 500)}`,
          "provider_error"
        );
      }

      const data = await res.json().catch(() => null);
      const content = data?.choices?.[0]?.message?.content;

      if (typeof content !== "string" || content.trim().length === 0) {
        throw new LLMError(
          "LLM provider returned an empty or invalid response",
          "empty_response"
        );
      }

      return {
        content,
        model: typeof data?.model === "string" ? data.model : cfg.model,
        usage: {
          promptTokens: data?.usage?.prompt_tokens,
          completionTokens: data?.usage?.completion_tokens,
        },
      };
    } catch (error) {
      if (error instanceof LLMError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new LLMError("LLM request timed out", "timeout");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  const isRetryable = (err: unknown): boolean => {
    if (err instanceof LLMError) {
      return err.code === "empty_response" || err.code === "timeout";
    }
    // Fallos de red (fetch lanza TypeError) son transitorios.
    return err instanceof Error;
  };

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs * attempt));
    }
    try {
      return await attemptOnce();
    } catch (err) {
      lastError = err;
      if (!isRetryable(err)) throw err;
    }
  }
  throw lastError;
}
