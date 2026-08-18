import "server-only";

import { parse } from "csv-parse/sync";
import { z } from "zod";
import {
  savantExpectedTeamRowSchema,
  type SavantExpectedTeamRow,
} from "@/providers/mlb-stats/schemas";
import { ProviderError } from "@/providers/provider-error";

const BASE_URL =
  "https://baseballsavant.mlb.com/leaderboard/expected_statistics";
const DEFAULT_TIMEOUT_MS = 8_000;
export const SAVANT_MAX_RESPONSE_BYTES = 1_000_000;

type ClientOptions = {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

export class BaseballSavantClient {
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(options: ClientOptions = {}) {
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async getExpectedTeamStats(season: number): Promise<SavantExpectedTeamRow[]> {
    const operation = "expected_statistics";
    const url = new URL(BASE_URL);
    url.searchParams.set("type", "batter-team");
    url.searchParams.set("year", String(season));
    url.searchParams.set("position", "");
    url.searchParams.set("team", "");
    url.searchParams.set("min", "1");
    url.searchParams.set("csv", "true");

    let response: Response;
    try {
      response = await this.fetcher(url, {
        headers: { "User-Agent": "Matchday Plan/0.1" },
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
        "Provider rejected the request",
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
    if (contentLength > SAVANT_MAX_RESPONSE_BYTES) {
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
    if (new TextEncoder().encode(text).byteLength > SAVANT_MAX_RESPONSE_BYTES) {
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

    try {
      const raw = parse(text, {
        bom: true,
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as unknown[];
      if (raw.length) {
        const keys = Object.keys(raw[0] as Record<string, unknown>);
        if (!keys.includes("team_id") || !keys.includes("est_woba")) {
          throw new Error("Expected-statistics columns are missing");
        }
      } else if (!/team_id/.test(text) || !/est_woba/.test(text)) {
        throw new Error("Expected-statistics header is missing");
      }
      return z.array(savantExpectedTeamRowSchema).parse(raw);
    } catch (error) {
      throw new ProviderError(
        "invalid_payload",
        "Provider CSV failed validation",
        operation,
        { cause: error },
      );
    }
  }
}
