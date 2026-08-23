import "server-only";

import { z, type ZodType } from "zod";
import type { Sport } from "@/lib/contracts";
import { logEvent } from "@/lib/logger";
import {
  apiSportsEnvelopeSchema,
  apiSportsInjuriesSchema,
  apiSportsStatusSchema,
  baseballGamesSchema,
  baseballTeamsSchema,
  envelopeErrorMessages,
  footballFixturesSchema,
  footballTeamsSchema,
  type ApiSportsFixture,
  type ApiSportsInjury,
  type ApiSportsTeamMatch,
} from "@/providers/api-sports/schemas";
import { ProviderError } from "@/providers/provider-error";

/** Hosts that never change are constants, not configuration. */
const SPORT_HOST: Record<Sport, string> = {
  soccer: "https://v3.football.api-sports.io",
  baseball: "https://v1.baseball.api-sports.io",
};

/** The two vendors disagree on the path for "the fixtures on this date". */
const FIXTURES_PATH: Record<Sport, string> = {
  soccer: "/fixtures",
  baseball: "/games",
};

const DEFAULT_TIMEOUT_MS = 15_000;
// A full day of football fixtures is ~750KB, so the football-data ceiling of
// 2MB would sit uncomfortably close to a busy Saturday.
const MAX_RESPONSE_BYTES = 4_000_000;
// The free plan allows 10 requests/minute. 6.5s serial pacing keeps a run
// under it without needing a token bucket.
const DEFAULT_PACE_MS = 6_500;
// A hard per-instance ceiling so a loop bug cannot drain the 100/day allowance.
const DEFAULT_MAX_REQUESTS = 12;

type ClientOptions = {
  key?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  paceMs?: number;
  maxRequests?: number;
};

export function apiSportsKey() {
  // The account is a direct API-Sports dashboard subscription, whose key lives
  // in DASHBOARD_API_FOOTBALL_KEY. API_FOOTBAL_KEY (the older, misspelled
  // entry) is read as a fallback but is not an API-Sports key on this account.
  return (
    process.env.DASHBOARD_API_FOOTBALL_KEY?.trim() ||
    process.env.API_FOOTBAL_KEY?.trim() ||
    process.env.API_FOOTBALL_KEY?.trim() ||
    ""
  );
}

export function isApiSportsConfigured() {
  return apiSportsKey().length > 0;
}

export class ApiSportsClient {
  private readonly key: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly paceMs: number;
  private readonly maxRequests: number;
  private requestCount = 0;
  private lastStartedAt = 0;
  private gate: Promise<unknown> = Promise.resolve();

  constructor(options: ClientOptions = {}) {
    const key = options.key ?? apiSportsKey();
    if (!key.trim()) {
      throw new ProviderError(
        "unauthorized",
        "API-Sports provider is not configured",
        "configuration",
      );
    }
    this.key = key;
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.paceMs = options.paceMs ?? DEFAULT_PACE_MS;
    this.maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
  }

  /** Requests spent by this instance, for a caller that budgets a run. */
  get spent() {
    return this.requestCount;
  }

  /** Serialises requests and holds `paceMs` between the start of each. */
  private schedule<T>(work: () => Promise<T>): Promise<T> {
    const result = this.gate.then(async () => {
      const wait = this.lastStartedAt
        ? this.paceMs - (Date.now() - this.lastStartedAt)
        : 0;
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.lastStartedAt = Date.now();
      return work();
    });
    this.gate = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async request<T>(
    sport: Sport,
    operation: string,
    path: string,
    schema: ZodType<T>,
    query?: Record<string, string>,
  ): Promise<T> {
    if (this.requestCount >= this.maxRequests) {
      throw new ProviderError(
        "rate_limited",
        `API-Sports request cap of ${this.maxRequests} reached for this run`,
        operation,
      );
    }
    this.requestCount += 1;

    const url = new URL(`${SPORT_HOST[sport]}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }

    const response = await this.schedule(async () => {
      try {
        return await this.fetcher(url, {
          headers: { "x-apisports-key": this.key },
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
    });

    logEvent("info", "sports_ingestion", {
      provider: "api-sports",
      operation,
      sport,
      remaining: response.headers.get("x-ratelimit-requests-remaining"),
      spent: this.requestCount,
    });

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
    if (
      Number(response.headers.get("content-length") ?? 0) > MAX_RESPONSE_BYTES
    ) {
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
      throw new ProviderError(
        "unavailable",
        `Provider returned HTTP ${response.status}`,
        operation,
      );
    }

    let envelope: z.infer<typeof apiSportsEnvelopeSchema>;
    try {
      envelope = apiSportsEnvelopeSchema.parse(JSON.parse(text));
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

    // HTTP 200 with a populated `errors` map is how this vendor reports
    // failure, so it maps to a ProviderError and never to data.
    const messages = envelopeErrorMessages(envelope.errors);
    if (messages.length > 0) {
      const joined = messages.join("; ");
      const unauthorized = /token|key|subscription/i.test(joined);
      const limited = /rate|limit|requests/i.test(joined);
      throw new ProviderError(
        unauthorized
          ? "unauthorized"
          : limited
            ? "rate_limited"
            : "unavailable",
        `Provider reported ${joined}`,
        operation,
      );
    }

    try {
      return schema.parse(envelope.response);
    } catch (error) {
      throw new ProviderError(
        "invalid_payload",
        "Provider response failed validation",
        operation,
        { cause: error },
      );
    }
  }

  getStatus(sport: Sport) {
    return this.request(sport, "status", "/status", apiSportsStatusSchema);
  }

  searchTeams(sport: Sport, search: string): Promise<ApiSportsTeamMatch[]> {
    return this.request(
      sport,
      "team_search",
      "/teams",
      sport === "soccer" ? footballTeamsSchema : baseballTeamsSchema,
      { search },
    );
  }

  /**
   * Every fixture on one UTC date. The free plan rejects `next=`, and `team=`
   * requires a `season=` it also rejects, so the whole day is pulled and
   * filtered by team id on this side.
   */
  getFixturesByDate(sport: Sport, date: string): Promise<ApiSportsFixture[]> {
    return this.request(
      sport,
      "fixtures_by_date",
      FIXTURES_PATH[sport],
      sport === "soccer" ? footballFixturesSchema : baseballGamesSchema,
      { date },
    );
  }

  /**
   * Missing players for one fixture, with the reason. Football only, and only
   * reachable while the fixture itself is inside the free plan's ±1 day window.
   */
  getInjuries(fixtureId: number): Promise<ApiSportsInjury[]> {
    return this.request(
      "soccer",
      "injuries_by_fixture",
      "/injuries",
      apiSportsInjuriesSchema,
      { fixture: String(fixtureId) },
    );
  }
}

export { ProviderError } from "@/providers/provider-error";
