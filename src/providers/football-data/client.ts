import "server-only";

import { z, type ZodType } from "zod";
import {
  footballDataMatchesSchema,
  footballDataStandingsSchema,
  footballDataTeamSchema,
} from "@/providers/football-data/schemas";

const BASE_URL = "https://api.football-data.org/v4";
const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 2_000_000;

export type ProviderErrorCode =
  | "unauthorized"
  | "rate_limited"
  | "timeout"
  | "unavailable"
  | "invalid_payload";

export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly operation: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ProviderError";
  }
}

type ClientOptions = {
  token?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

export class FootballDataClient {
  private readonly token: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(options: ClientOptions = {}) {
    const token = options.token ?? process.env.FOOTBALL_DATA_API_TOKEN;
    if (!token?.trim()) {
      throw new ProviderError(
        "unauthorized",
        "Football data provider is not configured",
        "configuration",
      );
    }
    this.token = token;
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private async request<T>(
    operation: string,
    path: string,
    schema: ZodType<T>,
    query?: Record<string, string>,
  ) {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }

    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers: { "X-Auth-Token": this.token },
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: "no-store",
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
    if (contentLength > MAX_RESPONSE_BYTES) {
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
    if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
      throw new ProviderError(
        "invalid_payload",
        "Provider response exceeded the size limit",
        operation,
      );
    }

    if (!response.ok) {
      let invalidCredential = false;
      if (response.status === 400) {
        try {
          const errorPayload = JSON.parse(text) as { message?: unknown };
          invalidCredential =
            typeof errorPayload.message === "string" &&
            /api token is invalid/i.test(errorPayload.message);
        } catch {
          // A non-JSON error body is handled as a generic unavailable response.
        }
      }
      throw new ProviderError(
        invalidCredential ? "unauthorized" : "unavailable",
        invalidCredential
          ? "Provider rejected the configured credential"
          : `Provider returned HTTP ${response.status}`,
        operation,
      );
    }

    try {
      return schema.parse(JSON.parse(text));
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
  }

  getTeam(teamId: number) {
    return this.request(
      "team_metadata",
      `/teams/${teamId}`,
      footballDataTeamSchema,
    );
  }

  getTeamMatches(
    teamId: number,
    operation: "upcoming_matches" | "recent_matches",
    query: Record<string, string>,
  ) {
    return this.request(
      operation,
      `/teams/${teamId}/matches`,
      footballDataMatchesSchema,
      query,
    );
  }

  getLaLigaStandings() {
    return this.request(
      "standings",
      "/competitions/PD/standings",
      footballDataStandingsSchema,
    );
  }
}
