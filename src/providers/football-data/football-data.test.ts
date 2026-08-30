import { describe, expect, it, vi } from "vitest";
import standingsFixture from "@/providers/football-data/__fixtures__/la-liga-standings.json";
import recentFixture from "@/providers/football-data/__fixtures__/real-madrid-recent.json";
import teamFixture from "@/providers/football-data/__fixtures__/real-madrid-team.json";
import upcomingFixture from "@/providers/football-data/__fixtures__/real-madrid-upcoming.json";
import {
  FootballDataClient,
  ProviderError,
} from "@/providers/football-data/client";
import {
  normalizeFootballStatus,
  normalizeSoccerTeamData,
} from "@/providers/football-data/normalize";
import {
  footballDataMatchesSchema,
  footballDataStandingsSchema,
  footballDataTeamSchema,
} from "@/providers/football-data/schemas";

const team = footballDataTeamSchema.parse(teamFixture);
const upcoming = footballDataMatchesSchema.parse(upcomingFixture).matches;
const recent = footballDataMatchesSchema.parse(recentFixture).matches;
const standings = footballDataStandingsSchema.parse(standingsFixture);

describe("football-data normalization", () => {
  it("maps all canonical game status families", () => {
    expect(normalizeFootballStatus("SCHEDULED")).toBe("scheduled");
    expect(normalizeFootballStatus("IN_PLAY")).toBe("live");
    expect(normalizeFootballStatus("FINISHED")).toBe("finished");
    expect(normalizeFootballStatus("SUSPENDED")).toBe("postponed");
    expect(normalizeFootballStatus("CANCELLED")).toBe("cancelled");
    expect(normalizeFootballStatus("SOMETHING_NEW")).toBe("unknown");
  });

  it("normalizes sorted games, form, evidence, and unavailable fields", () => {
    const data = normalizeSoccerTeamData({
      slug: "real-madrid",
      team,
      upcoming,
      recent,
      standings,
      fetchedAt: new Date("2026-08-17T10:00:00Z"),
    });

    expect(data.schedule.games.map((game) => game.id)).toEqual([
      "football-data-600001-real-madrid",
      "football-data-600002-real-madrid",
    ]);
    expect(data.schedule.context.recentForm).toEqual(["W", "W", "L", "D", "W"]);
    expect(data.schedule.context.availability).toEqual([]);
    expect(
      data.snapshots[0]?.snapshot.evidenceFacts.map((fact) =>
        fact.id.replace(`${data.schedule.games[0]!.id}-fact-`, ""),
      ),
    ).toEqual([
      "schedule",
      "matchup",
      "competition",
      "stage",
      "status",
      "venue",
      "standing",
      "opponent-standing",
      "form",
    ]);
  });

  it("sources the opponent standing from the table it already fetched", () => {
    const data = normalizeSoccerTeamData({
      slug: "real-madrid",
      team,
      upcoming,
      recent,
      standings,
      fetchedAt: new Date("2026-08-17T10:00:00Z"),
    });
    const facts = data.snapshots[0]!.snapshot.evidenceFacts;
    const matchup = facts.find((fact) => fact.id.endsWith("-fact-matchup"));
    const opponent = facts.find((fact) =>
      fact.id.endsWith("-fact-opponent-standing"),
    );

    expect(matchup?.value).toContain("(home)");
    expect(matchup?.value).toContain("(away)");
    // Either a real table row or an honest absence, never an invented one.
    expect(opponent?.value).toMatch(/^(#\d+ · |Not provided$)/);
  });

  it("hides the table position before either team has played enough games", () => {
    const seasonStart = {
      ...standings,
      standings: standings.standings.map((entry) => ({
        ...entry,
        table: entry.table.map((row) => ({ ...row, playedGames: 0 })),
      })),
    };
    const data = normalizeSoccerTeamData({
      slug: "real-madrid",
      team,
      upcoming,
      recent,
      standings: seasonStart,
      fetchedAt: new Date("2026-08-17T10:00:00Z"),
    });
    const facts = data.snapshots[0]!.snapshot.evidenceFacts;

    expect(
      facts.find((fact) => fact.id.endsWith("-fact-standing"))?.value,
    ).toBe("Not provided");
    expect(
      facts.find((fact) => fact.id.endsWith("-fact-opponent-standing"))?.value,
    ).toBe("Not provided");
    if (data.schedule.context.kind === "soccer") {
      expect(data.schedule.context.tablePosition).toBeUndefined();
    }
  });

  it("marks the scheduled time as a datetime instead of prose", () => {
    const data = normalizeSoccerTeamData({
      slug: "real-madrid",
      team,
      upcoming,
      recent,
      standings,
      fetchedAt: new Date("2026-08-17T10:00:00Z"),
    });
    const game = data.schedule.games[0]!;

    expect(data.snapshots[0]?.snapshot.evidenceFacts[0]).toMatchObject({
      label: "Scheduled time",
      value: game.scheduledAt,
      valueType: "datetime",
    });
  });

  it("keeps game and evidence IDs stable when provider arrays reorder", () => {
    const normalize = (matches: typeof upcoming) =>
      normalizeSoccerTeamData({
        slug: "real-madrid",
        team,
        upcoming: matches,
        recent,
        standings,
        fetchedAt: new Date("2026-08-17T10:00:00Z"),
      });
    const first = normalize(upcoming);
    const reordered = normalize([...upcoming].reverse());

    expect(first.schedule.games.map((game) => game.id)).toEqual(
      reordered.schedule.games.map((game) => game.id),
    );
    expect(
      first.snapshots[0]?.snapshot.evidenceFacts.map((fact) => fact.id),
    ).toEqual(
      reordered.snapshots[0]?.snapshot.evidenceFacts.map((fact) => fact.id),
    );
  });

  it("uses the same adapter for Barcelona", () => {
    const data = normalizeSoccerTeamData({
      slug: "barcelona",
      team: {
        ...team,
        id: 81,
        name: "FC Barcelona",
        shortName: "Barcelona",
        tla: "FCB",
      },
      upcoming: [upcoming[0]!],
      recent: [],
      standings,
      fetchedAt: new Date("2026-08-17T10:00:00Z"),
    });

    expect(data.schedule.team.slug).toBe("barcelona");
    expect(data.schedule.context.kind).toBe("soccer");
    expect(data.schedule.games[0]?.id).toBe("football-data-600002-barcelona");
  });

  it("retains recently finished matches with their score, without touching the schedule", () => {
    const data = normalizeSoccerTeamData({
      slug: "real-madrid",
      team,
      upcoming,
      recent,
      standings,
      fetchedAt: new Date("2026-08-17T10:00:00Z"),
    });

    // The schedule stays the upcoming fixtures only.
    expect(data.schedule.games.map((game) => game.id)).toEqual([
      "football-data-600001-real-madrid",
      "football-data-600002-real-madrid",
    ]);
    expect(data.schedule.games.every((game) => !game.result)).toBe(true);

    // Snapshots carry the upcoming fixtures plus finished ones inside the
    // seven-day retention window: 08-12 and 08-16 in, 08-09 and older out.
    const retained = data.snapshots.filter((item) => item.snapshot.game.result);
    expect(retained.map((item) => item.providerGameId)).toEqual([
      "500005",
      "500004",
    ]);
    expect(retained[0]?.snapshot.game.result).toEqual({
      homeScore: 4,
      awayScore: 1,
      completion: undefined,
      source: "football-data",
      observedAt: "2026-08-16T22:00:00Z",
    });
    expect(retained[0]?.snapshot.game.status).toBe("finished");
    expect(
      retained[0]?.snapshot.evidenceFacts.find((fact) =>
        fact.id.endsWith("-fact-final-score"),
      )?.value,
    ).toContain("4 – 1");
    // The retained fixture cites the request it actually came from.
    expect(
      retained[0]?.snapshot.sources.find((source) =>
        source.id.endsWith("-source-schedule"),
      )?.operation,
    ).toBe("recent_matches");
  });

  it("keeps a goalless draw distinct from an unreported score, and reads extra time", () => {
    const base = recent.find((match) => match.id === 500005)!;
    const data = normalizeSoccerTeamData({
      slug: "real-madrid",
      team,
      upcoming: [],
      recent: [
        { ...base, id: 500101, score: { fullTime: { home: 0, away: 0 } } },
        {
          ...base,
          id: 500102,
          score: { fullTime: { home: null, away: null } },
        },
        { ...base, id: 500103, score: undefined },
        {
          ...base,
          id: 500104,
          score: {
            duration: "PENALTY_SHOOTOUT",
            fullTime: { home: 2, away: 1 },
          },
        },
      ],
      standings,
      fetchedAt: new Date("2026-08-17T10:00:00Z"),
    });

    const resultFor = (providerGameId: string) =>
      data.snapshots.find((item) => item.providerGameId === providerGameId)
        ?.snapshot.game.result;

    // A finished 0–0 is a reported score, not a missing one.
    expect(resultFor("500101")).toMatchObject({ homeScore: 0, awayScore: 0 });
    // An unreported score yields no result at all rather than zeros.
    expect(resultFor("500102")).toBeUndefined();
    expect(resultFor("500103")).toBeUndefined();
    // Retained regardless, so the route stays readable.
    expect(data.snapshots).toHaveLength(4);
    expect(resultFor("500104")?.completion).toBe("shootout");
  });

  it("rejects malformed provider fixtures", () => {
    expect(() =>
      footballDataMatchesSchema.parse({ matches: [{ id: "wrong" }] }),
    ).toThrow();
  });
});

describe("football-data client failures", () => {
  const clientFor = (fetcher: typeof fetch) =>
    new FootballDataClient({ token: "test-token", fetch: fetcher });

  it.each([
    [401, "unauthorized"],
    [429, "rate_limited"],
    [503, "unavailable"],
  ] as const)("maps HTTP %s to %s", async (status, code) => {
    const fetcher = vi.fn(async () => new Response("{}", { status }));
    await expect(clientFor(fetcher).getTeam(86)).rejects.toMatchObject({
      code,
    });
  });

  it("maps football-data.org's HTTP 400 invalid-token response to unauthorized", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ message: "Your API token is invalid." }),
          { status: 400 },
        ),
    );
    await expect(clientFor(fetcher).getTeam(86)).rejects.toMatchObject({
      code: "unauthorized",
      message: "Provider rejected the configured credential",
    });
  });

  it("maps malformed JSON and invalid payloads without leaking credentials", async () => {
    const malformed = vi.fn(async () => new Response("not-json"));
    await expect(clientFor(malformed).getTeam(86)).rejects.toMatchObject({
      code: "invalid_payload",
    });

    const invalid = vi.fn(
      async () => new Response(JSON.stringify({ id: "86" })),
    );
    const error = await clientFor(invalid)
      .getTeam(86)
      .catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ProviderError);
    expect(String(error)).not.toContain("test-token");
  });

  it("maps aborts to timeout", async () => {
    const fetcher = vi.fn(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    await expect(clientFor(fetcher).getTeam(86)).rejects.toMatchObject({
      code: "timeout",
    });
  });
});
