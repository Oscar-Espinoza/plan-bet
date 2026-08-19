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
import { createEvidenceBriefing } from "@/lib/briefing";
import { getTeam } from "@/lib/seed";
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
    const briefing = createEvidenceBriefing(
      data.snapshots[0]!.snapshot,
      getTeam("real-madrid")!,
    );
    expect(briefing.items[0]).toMatchObject({
      text: "Scheduled time:",
      timestamp: game.scheduledAt,
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
