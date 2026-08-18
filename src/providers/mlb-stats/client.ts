import "server-only";

import { z, type ZodType } from "zod";
import {
  mlbPeopleResponseSchema,
  mlbScheduleResponseSchema,
  mlbStandingsResponseSchema,
  mlbTeamsResponseSchema,
} from "@/providers/mlb-stats/schemas";
import { ProviderError } from "@/providers/provider-error";

const BASE_URL = "https://statsapi.mlb.com/api/v1";
const DEFAULT_TIMEOUT_MS = 8_000;
export const MLB_MAX_RESPONSE_BYTES = 2_000_000;

type ClientOptions = {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

export class MlbStatsClient {
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(options: ClientOptions = {}) {
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
    if (contentLength > MLB_MAX_RESPONSE_BYTES) {
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
    if (new TextEncoder().encode(text).byteLength > MLB_MAX_RESPONSE_BYTES) {
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

  getTeam(teamId: number, season: number) {
    return this.request(
      "team_metadata",
      `/teams/${teamId}`,
      mlbTeamsResponseSchema,
      {
        season: String(season),
        hydrate: "division,league,venue",
      },
    );
  }

  getSchedule(input: {
    teamId: number;
    season: number;
    startDate: string;
    endDate: string;
    operation: "upcoming_schedule" | "recent_results";
  }) {
    return this.request(
      input.operation,
      "/schedule",
      mlbScheduleResponseSchema,
      {
        sportId: "1",
        teamId: String(input.teamId),
        season: String(input.season),
        startDate: input.startDate,
        endDate: input.endDate,
        gameTypes: "R,F,D,L,W",
        hydrate: "team,venue,probablePitcher",
      },
    );
  }

  getStandings(season: number) {
    return this.request("standings", "/standings", mlbStandingsResponseSchema, {
      leagueId: "103,104",
      season: String(season),
      standingsTypes: "regularSeason",
      hydrate: "team(division)",
    });
  }

  getPitchers(personIds: number[], season: number) {
    if (!personIds.length) return Promise.resolve({ people: [] });
    return this.request(
      "probable_pitchers",
      "/people",
      mlbPeopleResponseSchema,
      {
        personIds: [...new Set(personIds)].sort((a, b) => a - b).join(","),
        hydrate: `stats(group=[pitching],type=[season],season=${season})`,
      },
    );
  }
}
