import { describe, expect, it, vi } from "vitest";
import baseballGamesFixture from "@/providers/api-sports/__fixtures__/baseball-games-by-date.json";
import footballFixturesFixture from "@/providers/api-sports/__fixtures__/football-fixtures-by-date.json";
import planErrorFixture from "@/providers/api-sports/__fixtures__/plan-error.json";
import statusFixture from "@/providers/api-sports/__fixtures__/status.json";
import { ApiSportsClient, ProviderError } from "@/providers/api-sports/client";
import { fixturesForTeam, matchFixture } from "@/providers/api-sports/match";
import { API_SPORTS_TEAM_IDS } from "@/providers/api-sports/teams";
import {
  baseballGamesSchema,
  footballFixturesSchema,
} from "@/providers/api-sports/schemas";

const football = footballFixturesSchema.parse(footballFixturesFixture.response);
const baseball = baseballGamesSchema.parse(baseballGamesFixture.response);

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

type Fetcher = typeof globalThis.fetch;

function client(fetcher: Fetcher, maxRequests = 12) {
  return new ApiSportsClient({
    key: "test-key",
    fetch: fetcher,
    paceMs: 0,
    maxRequests,
  });
}

describe("matchFixture", () => {
  const yankees = fixturesForTeam(
    baseball,
    API_SPORTS_TEAM_IDS["new-york-yankees"],
  );

  it("picks the nearest leg of a doubleheader", () => {
    expect(yankees).toHaveLength(2);
    expect(
      matchFixture({ scheduledAt: "2026-08-23T17:35:00.000Z" }, yankees)?.id,
    ).toBe(179970);
    expect(
      matchFixture({ scheduledAt: "2026-08-23T20:50:00.000Z" }, yankees)?.id,
    ).toBe(179971);
  });

  it("matches a soccer fixture the stored board also carries", () => {
    const barcelona = fixturesForTeam(football, API_SPORTS_TEAM_IDS.barcelona);
    expect(
      matchFixture({ scheduledAt: "2026-08-23T19:30:00.000Z" }, barcelona)?.id,
    ).toBe(1570346);
  });

  it("leaves a fixture 26 hours away unmatched rather than guessing", () => {
    expect(
      matchFixture({ scheduledAt: "2026-08-24T19:35:00.000Z" }, yankees),
    ).toBeUndefined();
  });

  it("accepts the edge of the window and rejects just past it", () => {
    expect(
      matchFixture({ scheduledAt: "2026-08-23T14:35:00.001Z" }, yankees)?.id,
    ).toBe(179970);
    expect(
      matchFixture({ scheduledAt: "2026-08-23T14:34:59.000Z" }, yankees),
    ).toBeUndefined();
  });

  it("returns undefined for no candidates and for an unparseable kickoff", () => {
    expect(
      matchFixture({ scheduledAt: "2026-08-23T17:35:00.000Z" }, []),
    ).toBeUndefined();
    expect(
      matchFixture({ scheduledAt: "not-a-date" }, yankees),
    ).toBeUndefined();
  });
});

describe("ApiSportsClient", () => {
  it("reads the status envelope and sends the key header", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(statusFixture));
    const status = await client(fetcher).getStatus("soccer");

    expect(status.subscription.plan).toBe("Free");
    expect(status.requests.limit_day).toBe(100);
    const [url, init] = fetcher.mock.calls[0]!;
    expect(String(url)).toBe("https://v3.football.api-sports.io/status");
    expect(init?.headers).toMatchObject({
      "x-apisports-key": "test-key",
    });
  });

  it("routes each sport to its own host and fixtures path", async () => {
    const fetcher = vi.fn<Fetcher>(async () =>
      jsonResponse(baseballGamesFixture),
    );
    await client(fetcher).getFixturesByDate("baseball", "2026-08-23");

    expect(String(fetcher.mock.calls[0]![0])).toBe(
      "https://v1.baseball.api-sports.io/games?date=2026-08-23",
    );
  });

  it("maps an HTTP 200 carrying a populated errors object to a ProviderError", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(planErrorFixture));
    await expect(
      client(fetcher).getFixturesByDate("soccer", "2026-08-23"),
    ).rejects.toMatchObject({
      name: "ProviderError",
      code: "unavailable",
    });
  });

  it("throws once the per-run request cap is reached, without calling out", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(statusFixture));
    const capped = client(fetcher, 1);

    await capped.getStatus("soccer");
    await expect(capped.getStatus("soccer")).rejects.toMatchObject({
      code: "rate_limited",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(capped.spent).toBe(1);
  });

  it("maps a rejected credential to unauthorized", async () => {
    const fetcher = vi.fn<Fetcher>(
      async () => new Response("", { status: 401 }),
    );
    await expect(client(fetcher).getStatus("soccer")).rejects.toMatchObject({
      code: "unauthorized",
    });
  });

  it("refuses to construct without a key", () => {
    expect(() => new ApiSportsClient({ key: "" })).toThrow(ProviderError);
  });
});
