import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import cancelledFixture from "@/providers/mlb-stats/__fixtures__/cancelled.json";
import completedFixture from "@/providers/mlb-stats/__fixtures__/completed.json";
import liveFixture from "@/providers/mlb-stats/__fixtures__/live.json";
import malformedScheduleFixture from "@/providers/mlb-stats/__fixtures__/malformed-schedule.json";
import missingProbableFixture from "@/providers/mlb-stats/__fixtures__/missing-probable.json";
import partialOffseasonFixture from "@/providers/mlb-stats/__fixtures__/partial-offseason.json";
import pitchersFixture from "@/providers/mlb-stats/__fixtures__/pitchers.json";
import postponedFixture from "@/providers/mlb-stats/__fixtures__/postponed.json";
import recentFixture from "@/providers/mlb-stats/__fixtures__/recent-results.json";
import redSoxTeamFixture from "@/providers/mlb-stats/__fixtures__/red-sox-team.json";
import scheduledFixture from "@/providers/mlb-stats/__fixtures__/scheduled.json";
import standingsFixture from "@/providers/mlb-stats/__fixtures__/standings.json";
import unknownFixture from "@/providers/mlb-stats/__fixtures__/unknown.json";
import yankeesTeamFixture from "@/providers/mlb-stats/__fixtures__/yankees-team.json";
import { BaseballSavantClient } from "@/providers/baseball-savant/client";
import { MlbStatsClient } from "@/providers/mlb-stats/client";
import {
  normalizeBaseballTeamData,
  normalizeMlbStatus,
} from "@/providers/mlb-stats/normalize";
import { MlbSportsProvider } from "@/providers/mlb-stats/provider";
import {
  mlbPeopleResponseSchema,
  mlbScheduleResponseSchema,
  mlbStandingsResponseSchema,
  mlbTeamsResponseSchema,
} from "@/providers/mlb-stats/schemas";
import { ProviderError } from "@/providers/provider-error";

const fixtureText = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const team = mlbTeamsResponseSchema.parse(yankeesTeamFixture).teams[0]!;
const redSoxTeam = mlbTeamsResponseSchema.parse(redSoxTeamFixture).teams[0]!;
const upcoming = mlbScheduleResponseSchema
  .parse(scheduledFixture)
  .dates.flatMap((date) => date.games);
const recent = mlbScheduleResponseSchema
  .parse(recentFixture)
  .dates.flatMap((date) => date.games);
const standings = mlbStandingsResponseSchema.parse(standingsFixture);
const pitchers = mlbPeopleResponseSchema.parse(pitchersFixture).people;

async function statcastRows(name = "expected-teams.csv") {
  const text = fixtureText(`../baseball-savant/__fixtures__/${name}`);
  return new BaseballSavantClient({
    fetch: vi.fn(async () => new Response(text)),
  }).getExpectedTeamStats(2026);
}

describe("MLB and Savant normalization", () => {
  it("maps scheduled, live, completed, postponed, cancelled, and unknown states", () => {
    expect(
      normalizeMlbStatus({
        abstractGameState: "Preview",
        detailedState: "Scheduled",
      }),
    ).toBe("scheduled");
    expect(normalizeMlbStatus(liveFixture)).toBe("live");
    expect(normalizeMlbStatus(completedFixture)).toBe("finished");
    expect(normalizeMlbStatus(postponedFixture)).toBe("postponed");
    expect(normalizeMlbStatus(cancelledFixture)).toBe("cancelled");
    expect(normalizeMlbStatus(unknownFixture)).toBe("unknown");
  });

  it("normalizes Yankees schedules, standings, pitchers, form, and Statcast", async () => {
    const data = normalizeBaseballTeamData({
      slug: "new-york-yankees",
      team,
      upcoming,
      recent,
      standings,
      pitchers,
      statcastRows: await statcastRows(),
      fetchedAt: new Date("2026-08-18T12:00:00Z"),
    });

    expect(data.schedule.games.map((game) => game.id)).toEqual([
      "mlb-900001-new-york-yankees",
      "mlb-900002-new-york-yankees",
    ]);
    expect(data.schedule.context).toMatchObject({
      kind: "baseball",
      divisionRank: 2,
      record: "69–55",
      lastTen: "5–5",
      recentForm: ["W"],
    });
    expect(data.snapshots[0]).toMatchObject({
      providerGameId: "900001",
      canonicalGameId: "mlb-900001",
      route: {
        id: "mlb-900001-new-york-yankees",
        teamSlug: "new-york-yankees",
      },
    });
    expect(data.snapshots[0]?.snapshot.context).toMatchObject({
      statcast: {
        trackedTeam: { teamCode: "NYY", season: 2026 },
        opponent: { teamCode: "BOS", season: 2026 },
      },
    });
    expect(
      data.snapshots[0]?.snapshot.evidenceFacts.length,
    ).toBeGreaterThanOrEqual(9);
    expect(data.snapshots[0]?.snapshot.evidenceFacts[0]).toMatchObject({
      label: "Scheduled time",
      value: data.schedule.games[0]!.scheduledAt,
      valueType: "datetime",
    });
  });

  it("keeps shared provider and evidence IDs stable under reordered input", async () => {
    const normalize = (games: typeof upcoming) =>
      normalizeBaseballTeamData({
        slug: "new-york-yankees",
        team,
        upcoming: games,
        recent,
        standings,
        pitchers,
        statcastRows: [],
        fetchedAt: new Date("2026-08-18T12:00:00Z"),
      });
    const first = normalize(upcoming);
    const reordered = normalize([...upcoming].reverse());

    expect(first.snapshots.map((item) => item.providerGameId)).toEqual(
      reordered.snapshots.map((item) => item.providerGameId),
    );
    expect(
      first.snapshots[0]?.snapshot.evidenceFacts.map((fact) => fact.id),
    ).toEqual(
      reordered.snapshots[0]?.snapshot.evidenceFacts.map((fact) => fact.id),
    );
  });

  it("uses the same adapter for Boston and permits missing probable pitchers", () => {
    const games = mlbScheduleResponseSchema
      .parse(missingProbableFixture)
      .dates.flatMap((date) => date.games);
    const data = normalizeBaseballTeamData({
      slug: "boston-red-sox",
      team: redSoxTeam,
      upcoming: games,
      recent: [],
      standings,
      pitchers: [],
      statcastRows: [],
      fetchedAt: new Date("2026-08-18T12:00:00Z"),
    });

    expect(data.schedule.games[0]?.id).toBe("mlb-900003-boston-red-sox");
    expect(data.schedule.context).toMatchObject({
      kind: "baseball",
      probablePitchers: [],
    });
  });

  it("retains recently finished games with their run totals, without touching the schedule", async () => {
    const data = normalizeBaseballTeamData({
      slug: "new-york-yankees",
      team,
      upcoming,
      recent,
      standings,
      pitchers,
      statcastRows: await statcastRows(),
      fetchedAt: new Date("2026-08-18T12:00:00Z"),
    });

    // The schedule stays the upcoming games only.
    expect(data.schedule.games.map((game) => game.id)).toEqual([
      "mlb-900001-new-york-yankees",
      "mlb-900002-new-york-yankees",
    ]);
    expect(data.schedule.games.every((game) => !game.result)).toBe(true);

    const retained = data.snapshots.find(
      (item) => item.providerGameId === "899999",
    );
    expect(retained?.snapshot.game.result).toEqual({
      homeScore: 5,
      awayScore: 2,
      // The schedule payload reports no innings, so completion stays absent
      // rather than claiming the game ended in regulation.
      completion: undefined,
      source: "mlb-stats",
      observedAt: "2026-08-18T12:00:00.000Z",
    });
    expect(retained?.snapshot.game.status).toBe("finished");
    expect(
      retained?.snapshot.evidenceFacts.find((fact) =>
        fact.id.endsWith("-fact-final-score"),
      )?.value,
    ).toContain("5 – 2");
    expect(
      retained?.snapshot.sources.find((source) =>
        source.id.endsWith("-source-schedule"),
      )?.operation,
    ).toBe("recent_results");
  });

  it("drops a finished game outside the retention window and reports no result without run totals", async () => {
    const base = recent[0]!;
    const data = normalizeBaseballTeamData({
      slug: "new-york-yankees",
      team,
      upcoming: [],
      recent: [
        base,
        // Eight days back — outside the seven-day retention window.
        { ...base, gamePk: 899001, gameDate: "2026-08-10T17:05:00Z" },
        {
          ...base,
          gamePk: 899002,
          teams: {
            home: { ...base.teams.home, score: undefined },
            away: { ...base.teams.away, score: undefined },
          },
        },
      ],
      standings,
      pitchers,
      statcastRows: await statcastRows(),
      fetchedAt: new Date("2026-08-18T12:00:00Z"),
    });

    expect(data.snapshots.map((item) => item.providerGameId)).toEqual([
      "899999",
      "899002",
    ]);
    // Retained and readable, but with no result rather than a fabricated 0–0.
    expect(
      data.snapshots.find((item) => item.providerGameId === "899002")?.snapshot
        .game.result,
    ).toBeUndefined();
  });

  it("accepts a truthful partial offseason schedule and rejects malformed MLB payloads", () => {
    expect(
      mlbScheduleResponseSchema.parse(partialOffseasonFixture).dates,
    ).toEqual([]);
    expect(() =>
      mlbScheduleResponseSchema.parse(malformedScheduleFixture),
    ).toThrow();
  });
});

describe("MLB Stats client failures", () => {
  const clientFor = (fetcher: typeof fetch) =>
    new MlbStatsClient({ fetch: fetcher });

  it.each([
    [401, "unauthorized"],
    [429, "rate_limited"],
    [503, "unavailable"],
  ] as const)("maps HTTP %s to %s", async (status, code) => {
    const fetcher = vi.fn(async () => new Response("{}", { status }));
    await expect(clientFor(fetcher).getTeam(147, 2026)).rejects.toMatchObject({
      code,
    });
  });

  it("maps timeouts, malformed JSON, invalid payloads, and oversized responses", async () => {
    const timeout = vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    await expect(clientFor(timeout).getTeam(147, 2026)).rejects.toMatchObject({
      code: "timeout",
    });

    const malformed = vi.fn(async () => new Response("not-json"));
    await expect(clientFor(malformed).getTeam(147, 2026)).rejects.toMatchObject(
      {
        code: "invalid_payload",
      },
    );

    const invalid = vi.fn(
      async () => new Response(JSON.stringify({ teams: [{ id: "147" }] })),
    );
    await expect(clientFor(invalid).getTeam(147, 2026)).rejects.toMatchObject({
      code: "invalid_payload",
    });

    const oversized = vi.fn(
      async () =>
        new Response("{}", {
          headers: { "content-length": "2000001" },
        }),
    );
    await expect(clientFor(oversized).getTeam(147, 2026)).rejects.toMatchObject(
      {
        code: "invalid_payload",
      },
    );
  });
});

describe("Baseball Savant supplemental behavior", () => {
  it("parses expected team statistics and permits a missing tracked row", async () => {
    expect((await statcastRows()).map((row) => row.team_id)).toEqual([
      "NYY",
      "BOS",
      "BAL",
    ]);
    expect(
      (await statcastRows("missing-team.csv")).find(
        (row) => row.team_id === "NYY",
      ),
    ).toBeUndefined();
  });

  it("rejects malformed CSV and response-size violations", async () => {
    await expect(statcastRows("malformed.csv")).rejects.toMatchObject({
      code: "invalid_payload",
    });
    const client = new BaseballSavantClient({
      fetch: vi.fn(
        async () =>
          new Response("", { headers: { "content-length": "1000001" } }),
      ),
    });
    await expect(client.getExpectedTeamStats(2026)).rejects.toMatchObject({
      code: "invalid_payload",
    });
  });

  it.each([
    [401, "unauthorized"],
    [429, "rate_limited"],
    [503, "unavailable"],
  ] as const)("maps Savant HTTP %s to %s", async (status, code) => {
    const client = new BaseballSavantClient({
      fetch: vi.fn(async () => new Response("", { status })),
    });
    await expect(client.getExpectedTeamStats(2026)).rejects.toMatchObject({
      code,
    });
  });

  it("maps Savant aborts to timeout", async () => {
    const client = new BaseballSavantClient({
      fetch: vi.fn(async () => {
        throw new DOMException("timed out", "AbortError");
      }),
    });
    await expect(client.getExpectedTeamStats(2026)).rejects.toMatchObject({
      code: "timeout",
    });
  });

  it("keeps MLB bundles when Savant is unavailable", async () => {
    const scheduleResponse = mlbScheduleResponseSchema.parse(scheduledFixture);
    const recentResponse = mlbScheduleResponseSchema.parse(recentFixture);
    const mlb = {
      getStandings: vi.fn(async () => standings),
      getTeam: vi.fn(async (id: number) =>
        id === 147
          ? mlbTeamsResponseSchema.parse(yankeesTeamFixture)
          : mlbTeamsResponseSchema.parse(redSoxTeamFixture),
      ),
      getSchedule: vi.fn(async (input: { operation: string }) =>
        input.operation === "recent_results"
          ? recentResponse
          : scheduleResponse,
      ),
      getPitchers: vi.fn(async () => ({ people: pitchers })),
    };
    const savant = {
      getExpectedTeamStats: vi.fn(async () => {
        throw new ProviderError(
          "unavailable",
          "supplement unavailable",
          "expected_statistics",
        );
      }),
    };
    const provider = new MlbSportsProvider(mlb as never, savant as never);
    const result = await provider.refresh({
      now: new Date("2026-08-18T12:00:00Z"),
      cachedTeams: {},
    });

    expect(result.bundles).toHaveLength(2);
    expect(result.failures).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        provider: "baseball-savant",
        status: "failed",
      }),
    ]);
    expect(
      result.bundles.every(
        (bundle) =>
          bundle.schedule.context.kind === "baseball" &&
          bundle.schedule.context.statcast === undefined,
      ),
    ).toBe(true);
  });
});
