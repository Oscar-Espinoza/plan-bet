import { describe, expect, it } from "vitest";

import apiFootballHeadToHead from "@/providers/apifootball/__fixtures__/head-to-head.json";
import apiFootballMatches from "@/providers/apifootball/__fixtures__/matches-by-range.json";
import apiFootballPredictions from "@/providers/apifootball/__fixtures__/predictions.json";
import apiFootballStandings from "@/providers/apifootball/__fixtures__/standings.json";
import {
  apiFootballHeadToHeadSchema,
  apiFootballMatchesSchema,
  apiFootballPredictionsSchema,
  apiFootballStandingsSchema,
} from "@/providers/apifootball/schemas";
import bigBallsFinished from "@/providers/bigballs/__fixtures__/matches-finished.json";
import bigBallsScheduled from "@/providers/bigballs/__fixtures__/matches-scheduled.json";
import bigBallsStandings from "@/providers/bigballs/__fixtures__/standings.json";
import {
  bigBallsMatchesSchema,
  bigBallsStandingsSchema,
} from "@/providers/bigballs/schemas";
import { matchFixture } from "@/providers/api-sports/match";

describe("apifootball schemas", () => {
  it("flattens matches and keeps kickoff_utc rather than the vendor's local time", () => {
    const matches = apiFootballMatchesSchema.parse(apiFootballMatches);
    expect(matches.length).toBeGreaterThan(10);

    const elche = matches.find((match) => match.id === "798823");
    expect(elche).toMatchObject({
      kickoff: "2026-08-23T19:30:00.000Z",
      homeTeam: "Elche",
      awayTeam: "Barcelona",
      awayTeamId: "97",
    });
    // Unplayed fixtures carry empty score strings, which must not become 0.
    expect(elche?.homeScore).toBeUndefined();
  });

  it("reaches past the ±1 day window that limits API-Sports", () => {
    const matches = apiFootballMatchesSchema.parse(apiFootballMatches);
    const span =
      Date.parse(matches[matches.length - 1]!.kickoff) -
      Date.parse(matches[0]!.kickoff);
    expect(span).toBeGreaterThan(7 * 24 * 60 * 60 * 1000);
  });

  it("splits head-to-head into meetings and each side's form, with scores", () => {
    const h2h = apiFootballHeadToHeadSchema.parse(apiFootballHeadToHead);
    expect(h2h.meetings.length).toBeGreaterThan(0);
    expect(h2h.homeForm.length).toBeGreaterThan(0);
    expect(h2h.meetings[0]).toMatchObject({ homeScore: expect.any(Number) });
  });

  it("parses predictions with a favorite", () => {
    const predictions = apiFootballPredictionsSchema.parse(
      apiFootballPredictions,
    );
    expect(predictions.length).toBeGreaterThan(0);
    expect(["home", "away", "draw"]).toContain(predictions[0]!.favorite);
  });

  it("coerces the standings table out of strings", () => {
    const table = apiFootballStandingsSchema.parse(apiFootballStandings);
    expect(table[0]).toMatchObject({
      position: 1,
      points: expect.any(Number),
    });
  });
});

describe("bigballs schemas", () => {
  it("drops odds, broadcast and logos at the boundary", () => {
    const matches = bigBallsMatchesSchema.parse(bigBallsScheduled);
    expect(matches.length).toBeGreaterThan(0);
    for (const match of matches) {
      expect(match).not.toHaveProperty("has_odds");
      expect(match).not.toHaveProperty("broadcast");
      expect(Object.keys(match)).not.toContain("logo_url");
    }
  });

  it("keeps finished scores so recent form can be derived", () => {
    const matches = bigBallsMatchesSchema.parse(bigBallsFinished);
    const scored = matches.filter((match) => match.homeScore !== undefined);
    expect(scored.length).toBe(matches.length);
  });

  it("renames points_for to runs and keeps the streak", () => {
    const table = bigBallsStandingsSchema.parse(bigBallsStandings);
    const yankees = table.find((row) => row.team === "New York Yankees");
    expect(yankees).toMatchObject({
      wins: expect.any(Number),
      runsFor: expect.any(Number),
      streak: expect.any(String),
    });
    expect(yankees).not.toHaveProperty("pointsFor");
  });
});

describe("matchFixture across vendors", () => {
  it("matches a stored soccer game to the apifootball fixture", () => {
    const candidates = apiFootballMatchesSchema.parse(apiFootballMatches);
    const matched = matchFixture(
      { scheduledAt: "2026-08-23T19:30:00.000Z" },
      candidates.filter(
        (match) => match.homeTeamId === "97" || match.awayTeamId === "97",
      ),
    );
    expect(matched?.id).toBe("798823");
  });

  it("matches a stored baseball game to the BigBalls row", () => {
    const candidates = bigBallsMatchesSchema
      .parse(bigBallsScheduled)
      .filter(
        (match) =>
          match.homeTeam === "New York Yankees" ||
          match.awayTeam === "New York Yankees",
      );
    const matched = matchFixture(
      { scheduledAt: "2026-08-23T17:35:00.000Z" },
      candidates,
    );
    expect(matched?.homeTeam).toBe("New York Yankees");
  });

  it("leaves a game outside the ±3h window unmatched rather than guessing", () => {
    const candidates = bigBallsMatchesSchema.parse(bigBallsScheduled);
    expect(
      matchFixture({ scheduledAt: "2026-08-20T17:35:00.000Z" }, candidates),
    ).toBeUndefined();
  });
});
