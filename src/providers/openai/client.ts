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

export type BriefingRequest = {
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

  async createBriefing(request: BriefingRequest): Promise<BriefingCompletion> {
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
}

export { ProviderError } from "@/providers/provider-error";
