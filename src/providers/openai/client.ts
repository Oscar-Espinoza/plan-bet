import "server-only";

import { z } from "zod";
import { openAiResponseSchema, readOutput } from "@/providers/openai/schemas";
import { ProviderError } from "@/providers/provider-error";

const BASE_URL = "https://api.openai.com/v1/responses";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MODEL = "gpt-5.6-luna";
const DEFAULT_MAX_OUTPUT_TOKENS = 1_200;
export const OPENAI_MAX_RESPONSE_BYTES = 200_000;

type ClientOptions = {
  apiKey?: string;
  model?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

export type StructuredRequest = {
  operation: string;
  instructions: string;
  input: string;
  schema: Record<string, unknown>;
};

export type BriefingCompletion = {
  text: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
};

export type StreamingRequest = {
  operation: string;
  instructions: string;
  input: string;
  maxOutputTokens?: number;
};

export type StreamEvent =
  | { type: "delta"; text: string }
  | {
      type: "done";
      model: string;
      inputTokens?: number;
      outputTokens?: number;
    };

export function isOpenAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function getOpenAiModel() {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
}

export class OpenAiClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(options: ClientOptions = {}) {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey?.trim()) {
      throw new ProviderError(
        "unauthorized",
        "OpenAI provider is not configured",
        "configuration",
      );
    }
    this.apiKey = apiKey;
    this.model = options.model ?? getOpenAiModel();
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async createStructured(
    request: StructuredRequest,
  ): Promise<BriefingCompletion> {
    const { operation } = request;

    let response: Response;
    try {
      response = await this.fetcher(BASE_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: "no-store",
        body: JSON.stringify({
          model: this.model,
          instructions: request.instructions,
          input: request.input,
          // No web search, file search, code execution, MCP, or functions.
          tools: [],
          // User watchlist text and notes are never retained by the provider.
          store: false,
          max_output_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
          text: {
            format: {
              type: "json_schema",
              name: "briefing",
              strict: true,
              schema: request.schema,
            },
          },
        }),
      });
    } catch (error) {
      const timedOut =
        error instanceof DOMException &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      throw new ProviderError(
        timedOut ? "timeout" : "unavailable",
        timedOut ? "Provider request timed out" : "Provider request failed",
        operation,
        { cause: error },
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new ProviderError(
        "unauthorized",
        "Provider rejected the configured credential",
        operation,
      );
    }
    if (response.status === 429) {
      throw new ProviderError(
        "rate_limited",
        "Provider request rate limit reached",
        operation,
      );
    }
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > OPENAI_MAX_RESPONSE_BYTES) {
      throw new ProviderError(
        "invalid_payload",
        "Provider response exceeded the size limit",
        operation,
      );
    }

    let text: string;
    try {
      text = await response.text();
    } catch (error) {
      const timedOut =
        error instanceof DOMException &&
        (error.name === "TimeoutError" || error.name === "AbortError");
      throw new ProviderError(
        timedOut ? "timeout" : "unavailable",
        timedOut
          ? "Provider response timed out"
          : "Provider response could not be read",
        operation,
        { cause: error },
      );
    }
    if (new TextEncoder().encode(text).byteLength > OPENAI_MAX_RESPONSE_BYTES) {
      throw new ProviderError(
        "invalid_payload",
        "Provider response exceeded the size limit",
        operation,
      );
    }

    if (!response.ok) {
      throw new ProviderError(
        "unavailable",
        `Provider returned HTTP ${response.status}`,
        operation,
      );
    }

    let parsed: z.infer<typeof openAiResponseSchema>;
    try {
      parsed = openAiResponseSchema.parse(JSON.parse(text));
    } catch (error) {
      throw new ProviderError(
        "invalid_payload",
        error instanceof z.ZodError
          ? "Provider response failed validation"
          : "Provider response was not valid JSON",
        operation,
        { cause: error },
      );
    }

    if (parsed.status && parsed.status !== "completed") {
      throw new ProviderError(
        "invalid_payload",
        "Provider response was incomplete",
        operation,
      );
    }

    const output = readOutput(parsed);
    if (!output || output.refused) {
      throw new ProviderError(
        "invalid_payload",
        output?.refused
          ? "Provider declined to produce the briefing"
          : "Provider response contained no briefing text",
        operation,
      );
    }

    return {
      text: output.text,
      model: parsed.model,
      inputTokens: parsed.usage?.input_tokens,
      outputTokens: parsed.usage?.output_tokens,
    };
  }

  /**
   * Streams plain prose (no `text.format`) as `response.output_text.delta`
   * events, terminating on `response.completed`. The byte cap is enforced on
   * the accumulated stream because streaming responses carry no
   * `content-length` header — the one bound that makes the non-streaming path
   * safe would otherwise silently disappear.
   */
  async *createStreaming(
    request: StreamingRequest,
  ): AsyncGenerator<StreamEvent> {
    const { operation } = request;

    let response: Response;
    try {
      response = await this.fetcher(BASE_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: "no-store",
        body: JSON.stringify({
          model: this.model,
          instructions: request.instructions,
          input: request.input,
          tools: [],
          store: false,
          stream: true,
          max_output_tokens:
            request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        }),
      });
    } catch (error) {
      throw new ProviderError(
        isTimeout(error) ? "timeout" : "unavailable",
        isTimeout(error)
          ? "Provider request timed out"
          : "Provider request failed",
        operation,
        { cause: error },
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new ProviderError(
        "unauthorized",
        "Provider rejected the configured credential",
        operation,
      );
    }
    if (response.status === 429) {
      throw new ProviderError(
        "rate_limited",
        "Provider request rate limit reached",
        operation,
      );
    }
    if (!response.ok || !response.body) {
      throw new ProviderError(
        "unavailable",
        `Provider returned HTTP ${response.status}`,
        operation,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let byteCount = 0;
    let completed = false;

    try {
      while (true) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await reader.read();
        } catch (error) {
          throw new ProviderError(
            isTimeout(error) ? "timeout" : "unavailable",
            "Provider stream could not be read",
            operation,
            { cause: error },
          );
        }
        if (chunk.done) break;

        byteCount += chunk.value.byteLength;
        if (byteCount > OPENAI_MAX_RESPONSE_BYTES) {
          throw new ProviderError(
            "invalid_payload",
            "Provider response exceeded the size limit",
            operation,
          );
        }

        buffer += decoder.decode(chunk.value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const dataLine = frame
            .split("\n")
            .find((line) => line.startsWith("data:"));
          if (!dataLine) continue;
          const jsonText = dataLine.slice(5).trim();
          if (!jsonText || jsonText === "[DONE]") continue;

          let payload: {
            type?: string;
            delta?: string;
            response?: {
              model?: string;
              usage?: { input_tokens?: number; output_tokens?: number };
            };
          };
          try {
            payload = JSON.parse(jsonText);
          } catch {
            continue;
          }

          if (
            payload.type === "response.output_text.delta" &&
            typeof payload.delta === "string"
          ) {
            yield { type: "delta", text: payload.delta };
          } else if (payload.type === "response.completed") {
            completed = true;
            yield {
              type: "done",
              model: payload.response?.model ?? this.model,
              inputTokens: payload.response?.usage?.input_tokens,
              outputTokens: payload.response?.usage?.output_tokens,
            };
            return;
          } else if (
            payload.type === "response.failed" ||
            payload.type === "response.incomplete"
          ) {
            throw new ProviderError(
              "invalid_payload",
              "Provider response was incomplete",
              operation,
            );
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!completed) {
      throw new ProviderError(
        "unavailable",
        "Provider stream ended before completing",
        operation,
      );
    }
  }
}

function isTimeout(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

export { ProviderError } from "@/providers/provider-error";
